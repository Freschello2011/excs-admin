/**
 * 供应商「我的内容」页 —— Phase 10 接入真实 API 与状态机。
 *
 * 上传走后端 `POST /api/v1/vendor/contents/upload` 拿 presigned PUT URL，再浏览器直 PUT OSS；
 * 完成后调用 `POST /contents/:id/upload-complete` 置 pending_accept。
 *
 * 大文件断点续传（PRD §7.3）需引入 ali-oss SDK + STS 凭据，留给 Phase 10.x 继续：
 *   - 目前支持 <= 200MB 的一次性 PUT + 进度条（XHR `onUploadProgress`）
 *   - >200MB 提示使用分片（现阶段先阻止，避免浏览器超时）
 *
 * 状态 Tab 分组、驳回原因展示、重提交、撤回全部走 Phase 10 新端点。
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Col, Empty, Input, Modal, Popconfirm, Progress, Row, Segmented, Space, Tag, Typography, Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import axios, { type AxiosProgressEvent } from 'axios';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import { contentApi } from '@/api/content';
import type { ContentDetail, ContentStatus } from '@/types/content';
import { REJECT_REASON_LABEL, type ContentRejectReason } from '@/types/content';

const { Text, Paragraph } = Typography;

const STATUS_META: Partial<Record<ContentStatus, { color: string; label: string }>> = {
  pending_accept: { color: 'gold', label: '待接收' },
  bound: { color: 'green', label: '已绑定' },
  rejected: { color: 'red', label: '已驳回' },
  withdrawn: { color: 'default', label: '已撤回' },
  archived: { color: 'default', label: '已归档' },
  uploading: { color: 'blue', label: '上传中' },
};

const MAX_SIMPLE_UPLOAD = 200 * 1024 * 1024; // 200MB；超过提示走分片（v1.0 未实现）

type StatusFilter = 'all' | 'pending_accept' | 'bound' | 'rejected';

function formatMB(bytes: number): string {
  if (!bytes) return '0 MB';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MyContentsPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [uploadVisible, setUploadVisible] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState<ContentDetail | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { data: rawList = [], isLoading } = useQuery({
    queryKey: ['vendor', 'my-contents', { status: statusFilter }],
    queryFn: () =>
      contentApi.vendorListMyContents(statusFilter === 'all' ? { page: 1, page_size: 200 } : { status: statusFilter, page: 1, page_size: 200 }),
    select: (res) => (res.data.data?.list ?? []) as ContentDetail[],
  });

  const visibleList = useMemo(() => {
    return rawList.filter((item) => {
      if (keyword && !item.name.toLowerCase().includes(keyword.toLowerCase())) return false;
      return true;
    });
  }, [rawList, keyword]);

  const counts = useMemo(() => ({
    all: rawList.length,
    pending_accept: rawList.filter((x) => x.status === 'pending_accept').length,
    bound: rawList.filter((x) => x.status === 'bound').length,
    rejected: rawList.filter((x) => x.status === 'rejected').length,
  }), [rawList]);

  const withdrawMutation = useMutation({
    mutationFn: (contentId: number) => contentApi.withdrawContent(contentId),
    onSuccess: () => {
      message.success('已撤回');
      queryClient.invalidateQueries({ queryKey: ['vendor', 'my-contents'] });
    },
    onError: (err: Error) => message.error(err.message || '撤回失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (contentId: number) => contentApi.deleteContent(contentId),
    onSuccess: () => {
      message.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['vendor', 'my-contents'] });
    },
    onError: (err: Error) => message.error(err.message || '删除失败'),
  });

  const doUpload = async (file: File, parentContentId?: number) => {
    if (file.size > MAX_SIMPLE_UPLOAD) {
      message.error('当前版本大文件需分片上传，Phase 10 v1 仅支持 ≤ 200MB；请联系管理员或压缩后重试');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    abortRef.current = new AbortController();
    try {
      const body = {
        filename: file.name,
        file_size: file.size,
        content_type: file.type || 'application/octet-stream',
      };
      const resp = parentContentId
        ? await contentApi.vendorResubmit(parentContentId, body)
        : await contentApi.vendorRequestUpload(body);
      const result = resp.data.data!;
      if (!result.presigned_url) {
        throw new Error('后端未返回 presigned_url，请联系管理员');
      }
      // PUT 直传 OSS
      await axios.put(result.presigned_url, file, {
        headers: { 'Content-Type': body.content_type },
        signal: abortRef.current.signal,
        onUploadProgress: (ev: AxiosProgressEvent) => {
          if (ev.total) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        },
      });
      await contentApi.uploadComplete(result.content_id, { content_id: result.content_id });
      message.success(parentContentId ? '新版本已提交，等待技术员重新接收' : '上传完成，等待技术员接收');
      setUploadVisible(false);
      setResubmitTarget(null);
      queryClient.invalidateQueries({ queryKey: ['vendor', 'my-contents'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (axios.isCancel(err)) {
        message.info('上传已取消');
      } else {
        message.error(`上传失败：${msg}`);
      }
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  };

  const cancelUpload = () => {
    abortRef.current?.abort();
  };

  return (
    <div>
      <PageHeader
        title="我的内容"
        description="上传、查看内容状态；内容需经技术员接收后方能在展厅使用。"
        extra={
          <Button
            type="primary"
            icon={<span className="material-symbols-outlined" style={{ fontSize: 16 }}>cloud_upload</span>}
            onClick={() => setUploadVisible(true)}
          >
            上传内容
          </Button>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { value: 'all', label: `全部 · ${counts.all}` },
              { value: 'pending_accept', label: `待接收 · ${counts.pending_accept}` },
              { value: 'bound', label: `已绑定 · ${counts.bound}` },
              { value: 'rejected', label: `已驳回 · ${counts.rejected}` },
            ]}
          />
          <Input.Search
            placeholder="搜索内容标题"
            allowClear
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Text type="secondary">{isLoading ? '加载中…' : `共 ${visibleList.length} 条`}</Text>
        </Space>
      </Card>

      {visibleList.length === 0 ? (
        <Empty description={isLoading ? '加载中…' : '没有匹配的内容'} />
      ) : (
        <Row gutter={[16, 16]}>
          {visibleList.map((item) => {
            const meta = STATUS_META[item.status] ?? { color: 'default', label: item.status };
            return (
              <Col key={item.id} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  title={
                    <Space size={6}>
                      <span>{item.name}</span>
                      {item.content_version && item.content_version > 1 && (
                        <Tag color="purple">v{item.content_version}</Tag>
                      )}
                    </Space>
                  }
                  extra={<Tag color={meta.color}>{meta.label}</Tag>}
                  actions={[
                    item.status === 'pending_accept' ? (
                      <Popconfirm key="withdraw" title="撤回该内容？" onConfirm={() => withdrawMutation.mutate(item.id)}>
                        <Button type="link" size="small">撤回</Button>
                      </Popconfirm>
                    ) : item.status === 'rejected' ? (
                      <Button key="resubmit" type="link" size="small" onClick={() => setResubmitTarget(item)}>
                        上传新版本
                      </Button>
                    ) : (
                      <span key="noop" />
                    ),
                    (['pending_accept', 'rejected', 'withdrawn'] as ContentStatus[]).includes(item.status) ? (
                      <Popconfirm key="del" title="删除此条？" okText="删除" okButtonProps={{ danger: true }} onConfirm={() => deleteMutation.mutate(item.id)}>
                        <Button type="link" size="small" danger>删除</Button>
                      </Popconfirm>
                    ) : (
                      <span key="del-noop" />
                    ),
                  ]}
                >
                  <Paragraph type="secondary" style={{ marginBottom: 4 }}>
                    {item.type} · {formatMB(item.file_size)}
                  </Paragraph>
                  {item.status === 'bound' && item.hall_name && (
                    <Paragraph style={{ marginBottom: 4 }}>已绑定到展厅：<Tag color="blue">{item.hall_name}</Tag></Paragraph>
                  )}
                  {item.status === 'rejected' && (
                    <Paragraph style={{ marginBottom: 4 }}>
                      <Text type="danger">驳回原因：</Text>
                      <Space size={4} wrap>
                        {(item.reject_reasons ?? []).map((r) => (
                          <Tag key={r} color="red">{REJECT_REASON_LABEL[r as ContentRejectReason] ?? r}</Tag>
                        ))}
                        {item.reject_note && <span style={{ color: 'var(--ant-color-text-secondary)' }}>{item.reject_note}</span>}
                      </Space>
                    </Paragraph>
                  )}
                  <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                    上传时间：{item.created_at ? item.created_at.slice(0, 10) : '-'}
                  </Paragraph>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* 上传 Modal（新上传 or 重提交） */}
      <Modal
        title={resubmitTarget ? `重新提交：${resubmitTarget.name}` : '上传新内容'}
        open={uploadVisible || !!resubmitTarget}
        onCancel={() => {
          if (uploading) {
            cancelUpload();
          }
          setUploadVisible(false);
          setResubmitTarget(null);
        }}
        footer={null}
        destroyOnHidden
      >
        {uploading ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Progress percent={uploadProgress} />
            <Button danger onClick={cancelUpload}>取消上传</Button>
          </Space>
        ) : (
          <Upload.Dragger
            accept="video/*,image/*,audio/*,.ppt,.pptx"
            multiple={false}
            showUploadList={false}
            beforeUpload={(file: UploadFile & File) => {
              doUpload(file as unknown as File, resubmitTarget?.id);
              return false;
            }}
          >
            <p className="ant-upload-drag-icon" style={{ margin: '12px 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36 }}>cloud_upload</span>
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此处</p>
            <p className="ant-upload-hint" style={{ color: 'var(--ant-color-text-secondary)' }}>
              当前版本支持 ≤ 200MB 的单文件上传；大文件分片续传在 Phase 10.x 提供
            </p>
          </Upload.Dragger>
        )}
      </Modal>
    </div>
  );
}
