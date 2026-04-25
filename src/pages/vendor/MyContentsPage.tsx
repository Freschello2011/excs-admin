/**
 * 供应商「我的内容」页 —— Phase 12 升级。
 *
 * 升级点：
 *   - 4 Tab → 5 Tab + 全部：全部 / 待接收 / 已绑定 / 已驳回 / 已撤回 / 已归档（PillTabs）
 *   - bound 状态加 [上传新版本] 入口（旧版本在新版本被接收时自动归档，由后端处理）
 *   - URL ?status= 同步
 *   - 状态 Tag → ContentStatusTag 共用组件
 *   - 内容详情抽屉（版本链 + 操作历史）
 *
 * 上传仍走 `POST /api/v1/vendor/contents/upload` 拿 presigned PUT URL；
 * 大文件分片续传留 Phase 12.x（≤200MB 单文件 PUT 已通）。
 */
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Col, Empty, Input, Modal, Popconfirm, Progress, Row, Space, Tag, Typography, Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import axios, { type AxiosProgressEvent } from 'axios';
import PageHeader from '@/components/common/PageHeader';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';
import ContentStatusTag from '@/components/content/ContentStatusTag';
import ContentDetailDrawer from '@/components/content/ContentDetailDrawer';
import { useMessage } from '@/hooks/useMessage';
import { contentApi } from '@/api/content';
import type { ContentDetail, ContentStatus } from '@/types/content';
import { REJECT_REASON_LABEL, type ContentRejectReason } from '@/types/content';

const { Text, Paragraph } = Typography;

const MAX_SIMPLE_UPLOAD = 200 * 1024 * 1024; // 200MB；超过提示走分片（Phase 12.x 实现）

type StatusFilter = 'all' | 'pending_accept' | 'bound' | 'rejected' | 'withdrawn' | 'archived';

const TABS: PillTab<StatusFilter>[] = [
  { key: 'all', label: '全部' },
  { key: 'pending_accept', label: '待接收' },
  { key: 'bound', label: '已绑定' },
  { key: 'rejected', label: '已驳回' },
  { key: 'withdrawn', label: '已撤回' },
  { key: 'archived', label: '已归档' },
];

function formatMB(bytes: number): string {
  if (!bytes) return '0 MB';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MyContentsPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const validStatus: StatusFilter[] = ['all', 'pending_accept', 'bound', 'rejected', 'withdrawn', 'archived'];
  const statusParam = searchParams.get('status') as StatusFilter | null;
  const statusFilter: StatusFilter = statusParam && validStatus.includes(statusParam) ? statusParam : 'all';
  const keyword = searchParams.get('keyword') ?? '';

  const updateParam = (patches: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patches).forEach(([k, v]) => {
      if (v == null || v === '' || v === 'all') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  };

  const [uploadVisible, setUploadVisible] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState<ContentDetail | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [drawerContentId, setDrawerContentId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 一次拉全部（≤500），状态 Tab 是本地分组（避免每次切换都打后端）
  const { data: rawList = [], isLoading } = useQuery({
    queryKey: ['vendor', 'my-contents', 'all'],
    queryFn: () => contentApi.vendorListMyContents({ page: 1, page_size: 500 }),
    select: (res) => (res.data.data?.list ?? []) as ContentDetail[],
  });

  const counts = useMemo(() => ({
    all: rawList.length,
    pending_accept: rawList.filter((x) => x.status === 'pending_accept').length,
    bound: rawList.filter((x) => x.status === 'bound').length,
    rejected: rawList.filter((x) => x.status === 'rejected').length,
    withdrawn: rawList.filter((x) => x.status === 'withdrawn').length,
    archived: rawList.filter((x) => x.status === 'archived').length,
  }), [rawList]);

  const visibleList = useMemo(() => {
    let list = rawList;
    if (statusFilter !== 'all') {
      list = list.filter((x) => x.status === statusFilter);
    }
    if (keyword) {
      const lk = keyword.toLowerCase();
      list = list.filter((x) => x.name.toLowerCase().includes(lk));
    }
    return list;
  }, [rawList, statusFilter, keyword]);

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
      message.error('当前版本大文件需分片上传，Phase 12.x 提供；本期仅支持 ≤ 200MB');
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
      await axios.put(result.presigned_url, file, {
        headers: { 'Content-Type': body.content_type },
        signal: abortRef.current.signal,
        onUploadProgress: (ev: AxiosProgressEvent) => {
          if (ev.total) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        },
      });
      await contentApi.uploadComplete(result.content_id, { content_id: result.content_id });
      message.success(parentContentId ? '新版本已提交，等待技术员重新接收（接收后旧版本自动归档）' : '上传完成，等待技术员接收');
      setUploadVisible(false);
      setResubmitTarget(null);
      queryClient.invalidateQueries({ queryKey: ['vendor', 'my-contents'] });
    } catch (err) {
      if (axios.isCancel(err)) {
        message.info('上传已取消');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
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

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input.Search
          placeholder="搜索内容标题"
          allowClear
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => updateParam({ keyword: e.target.value || null })}
        />
        <Text type="secondary">{isLoading ? '加载中…' : `共 ${visibleList.length} 条`}</Text>
      </div>

      <div style={{ marginBottom: 12 }}>
        <PillTabs<StatusFilter>
          tabs={TABS.map((t) => ({
            ...t,
            label: t.key === 'all' ? `全部 · ${counts.all}` : `${t.label} · ${counts[t.key]}`,
          }))}
          active={statusFilter}
          onChange={(k) => updateParam({ status: k })}
          ariaLabel="我的内容状态 tab"
        />
      </div>

      {visibleList.length === 0 ? (
        <Card><Empty description={isLoading ? '加载中…' : '没有匹配的内容'} /></Card>
      ) : (
        <Row gutter={[16, 16]}>
          {visibleList.map((item) => {
            const status = item.status;
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
                  extra={<ContentStatusTag status={status} />}
                  actions={[
                    <Button key="detail" type="link" size="small" onClick={() => setDrawerContentId(item.id)}>
                      详情
                    </Button>,
                    // 主操作按状态切换
                    status === 'pending_accept' ? (
                      <Popconfirm key="withdraw" title="撤回该内容？撤回后可重新上传新版本" onConfirm={() => withdrawMutation.mutate(item.id)}>
                        <Button type="link" size="small">撤回</Button>
                      </Popconfirm>
                    ) : status === 'rejected' ? (
                      <Button key="resubmit" type="link" size="small" onClick={() => setResubmitTarget(item)}>
                        上传新版本
                      </Button>
                    ) : status === 'bound' ? (
                      <Button key="replace" type="link" size="small" onClick={() => setResubmitTarget(item)}>
                        上传新版本
                      </Button>
                    ) : (
                      <span key="noop" />
                    ),
                    // 删除按钮：仅 pending_accept / rejected / withdrawn 可硬删（后端 STATUS_LOCKED 兜底）
                    (['pending_accept', 'rejected', 'withdrawn'] as ContentStatus[]).includes(status) ? (
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
                  {status === 'bound' && item.hall_name && (
                    <Paragraph style={{ marginBottom: 4 }}>已绑定到展厅：<Tag color="blue">{item.hall_name}</Tag></Paragraph>
                  )}
                  {status === 'rejected' && (
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
        title={resubmitTarget ? `上传新版本：${resubmitTarget.name}（v${(resubmitTarget.content_version ?? 1) + 1}）` : '上传新内容'}
        open={uploadVisible || !!resubmitTarget}
        onCancel={() => {
          if (uploading) cancelUpload();
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
          <>
            {resubmitTarget?.status === 'bound' && (
              <Paragraph type="warning" style={{ marginBottom: 12 }}>
                此内容当前为「已绑定」状态。上传新版本并被技术员接收后，旧版本将自动归档，不影响展厅播放衔接。
              </Paragraph>
            )}
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
                当前版本支持 ≤ 200MB 的单文件上传；大文件分片续传将在 Phase 12.x 提供
              </p>
            </Upload.Dragger>
          </>
        )}
      </Modal>

      <ContentDetailDrawer
        open={drawerContentId != null}
        contentId={drawerContentId}
        onClose={() => setDrawerContentId(null)}
      />
    </div>
  );
}
