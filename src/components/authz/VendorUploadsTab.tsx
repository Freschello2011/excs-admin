/**
 * VendorUploadsTab —— Phase 12：VendorDetailPage「上传内容」Tab。
 *
 * 替换原占位 Result 卡。展示该供应商上传的全部内容（按 5 状态分组：
 * 待接收 / 已绑定 / 已驳回 / 已撤回 / 已归档），支持 PRD §7.2 全部生命周期操作：
 *   - pending_accept：[绑定到展项] / [驳回]
 *   - bound：[解绑]
 *   - rejected / withdrawn：[删除]
 *   - archived：仅查看
 *
 * 后端调用 `/api/v1/admin/contents?vendor_ids=:id&status=...` 拿数据。
 *
 * 与 ContentGroupListPage 解耦：不依赖 useHallStore（vendor 视角是跨展厅）。
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Col, Empty, Modal, Popconfirm, Row, Select, Space, Statistic, Table,
  Tag, Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { LinkOutlined, StopOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';
import ContentStatusTag, { CONTENT_STATUS_LABEL } from '@/components/content/ContentStatusTag';
import ContentDetailDrawer from '@/components/content/ContentDetailDrawer';
import RejectContentModal from '@/components/content/RejectContentModal';
import { useMessage } from '@/hooks/useMessage';
import { contentApi } from '@/api/content';
import { hallApi } from '@/api/hall';
import { useCan } from '@/lib/authz/can';
import type { ContentDetail, ContentRejectReason, ContentStatus } from '@/api/gen/client';
import type { HallListItem, ExhibitListItem } from '@/api/gen/client';

interface Props {
  vendorId: number;
}

type StatusFilter = 'all' | 'pending_accept' | 'bound' | 'rejected' | 'withdrawn' | 'archived';

const TABS: PillTab<StatusFilter>[] = [
  { key: 'all', label: '全部' },
  { key: 'pending_accept', label: '待接收' },
  { key: 'bound', label: '已绑定' },
  { key: 'rejected', label: '已驳回' },
  { key: 'withdrawn', label: '已撤回' },
  { key: 'archived', label: '已归档' },
];

function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function VendorUploadsTab({ vendorId }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const canManage = useCan('content.edit');

  const [searchParams, setSearchParams] = useSearchParams();
  const sub = (searchParams.get('sub') ?? 'all') as StatusFilter;
  const validSub: StatusFilter[] = ['all', 'pending_accept', 'bound', 'rejected', 'withdrawn', 'archived'];
  const statusFilter: StatusFilter = validSub.includes(sub) ? sub : 'all';

  const [bindTarget, setBindTarget] = useState<ContentDetail | null>(null);
  const [bindHallId, setBindHallId] = useState<number | null>(null);
  const [bindExhibitId, setBindExhibitId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ContentDetail | null>(null);
  const [drawerContentId, setDrawerContentId] = useState<number | null>(null);

  // 拉所有该 vendor 的内容（分页 200 上限）；用于本地分组统计 + 当前 Tab 过滤
  const { data: rawList = [], isLoading } = useQuery({
    queryKey: ['admin', 'contents', { vendor_id: vendorId }],
    queryFn: () => contentApi.adminListContents({
      vendor_ids: String(vendorId),
      page: 1,
      page_size: 500,
    }),
    select: (res) => (res.data.data?.list ?? []) as ContentDetail[],
  });

  // hall 列表 — 绑定 modal 用
  const { data: halls = [] } = useQuery({
    queryKey: ['halls', 'all'],
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 200 }),
    select: (res) => res.data.data?.list ?? [],
  });

  const { data: exhibits = [] } = useQuery({
    queryKey: ['halls', bindHallId, 'exhibits'],
    queryFn: () => hallApi.getExhibits(bindHallId!),
    select: (res) => res.data.data,
    enabled: !!bindHallId,
  });

  const counts = useMemo(() => ({
    pending_accept: rawList.filter((x) => x.status === 'pending_accept').length,
    bound: rawList.filter((x) => x.status === 'bound').length,
    rejected: rawList.filter((x) => x.status === 'rejected').length,
    withdrawn: rawList.filter((x) => x.status === 'withdrawn').length,
    archived: rawList.filter((x) => x.status === 'archived').length,
  }), [rawList]);

  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return rawList;
    return rawList.filter((x) => x.status === statusFilter);
  }, [rawList, statusFilter]);

  const handleTabChange = (key: StatusFilter) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'all') next.delete('sub');
    else next.set('sub', key);
    setSearchParams(next, { replace: true });
  };

  const bindMutation = useMutation({
    mutationFn: ({ contentId, exhibitId }: { contentId: number; exhibitId: number }) =>
      contentApi.bindToExhibit(contentId, exhibitId),
    onSuccess: () => {
      message.success('绑定成功');
      queryClient.invalidateQueries({ queryKey: ['admin', 'contents'] });
      setBindTarget(null);
      setBindHallId(null);
      setBindExhibitId(null);
    },
    onError: (err: Error) => message.error(err.message || '绑定失败'),
  });

  const unbindMutation = useMutation({
    mutationFn: (contentId: number) => contentApi.unbindContent(contentId),
    onSuccess: () => {
      message.success('已解绑');
      queryClient.invalidateQueries({ queryKey: ['admin', 'contents'] });
    },
    onError: (err: Error) => message.error(err.message || '解绑失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (contentId: number) => contentApi.deleteContent(contentId),
    onSuccess: () => {
      message.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['admin', 'contents'] });
    },
    onError: (err: Error) => message.error(err.message || '删除失败'),
  });

  const rejectMutation = useMutation({
    mutationFn: (args: { contentId: number; reasons: ContentRejectReason[]; note: string }) =>
      contentApi.rejectContent(args.contentId, { reasons: args.reasons, note: args.note }),
    onSuccess: () => {
      message.success('已驳回，供应商将收到通知');
      setRejectTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'contents'] });
    },
    onError: (err: Error) => message.error(err.message || '驳回失败'),
  });

  const columns: TableColumnsType<ContentDetail> = [
    {
      title: '文件名',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Space size={6}>
          <Typography.Text ellipsis style={{ maxWidth: 240 }}>{name}</Typography.Text>
          {record.content_version && record.content_version > 1 && (
            <Tag color="purple">v{record.content_version}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      width: 100,
      render: (v: number) => formatFileSize(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: ContentStatus) => <ContentStatusTag status={s} />,
    },
    {
      title: '归属展厅',
      width: 140,
      render: (_: unknown, record) =>
        record.hall_name ? <Tag color="blue">{record.hall_name}</Tag> : <Tag>未绑定</Tag>,
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      width: 110,
      render: (v?: string) => (v ? v.slice(0, 10) : '-'),
    },
    {
      title: '操作',
      width: 280,
      fixed: 'right',
      render: (_: unknown, record) => {
        const status = record.status;
        return (
          <Space size="small">
            <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => setDrawerContentId(record.id)}>
              详情
            </Button>
            {!canManage ? null : (<>
            {status === 'pending_accept' && (
              <>
                <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => {
                  setBindTarget(record);
                  setBindHallId(null);
                  setBindExhibitId(null);
                }}>绑定</Button>
                <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => setRejectTarget(record)}>
                  驳回
                </Button>
              </>
            )}
            {status === 'bound' && (
              <Popconfirm title="确认解绑？解绑后内容将转回未绑定池" onConfirm={() => unbindMutation.mutate(record.id)}>
                <Button type="link" size="small">解绑</Button>
              </Popconfirm>
            )}
            {(status === 'rejected' || status === 'withdrawn') && (
              <Popconfirm
                title="确认删除？OSS 原文件与缩略图将一并清理"
                okText="删除"
                okButtonProps={{ danger: true }}
                onConfirm={() => deleteMutation.mutate(record.id)}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            )}
            </>)}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      {/* 5 状态 Statistic 卡（PRD §7.2 全态可视化） */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {(['pending_accept', 'bound', 'rejected', 'withdrawn', 'archived'] as const).map((k) => (
          <Col span={4} key={k}>
            <Card size="small" hoverable onClick={() => handleTabChange(k)} style={{ cursor: 'pointer' }}>
              <Statistic
                title={CONTENT_STATUS_LABEL[k]}
                value={counts[k]}
                valueStyle={{
                  fontSize: 22,
                  color: k === 'pending_accept' ? '#d4b106'
                    : k === 'bound' ? '#52c41a'
                    : k === 'rejected' ? '#cf1322'
                    : 'var(--ant-color-text-secondary)',
                }}
              />
            </Card>
          </Col>
        ))}
        <Col span={4}>
          <Card size="small">
            <Statistic title="合计" value={rawList.length} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        <PillTabs<StatusFilter>
          tabs={TABS}
          active={statusFilter}
          onChange={handleTabChange}
          ariaLabel="供应商内容状态 tab"
        />
      </Card>

      {filteredList.length === 0 && !isLoading ? (
        <Card><Empty description="暂无内容" /></Card>
      ) : (
        <Table<ContentDetail>
          columns={columns}
          dataSource={filteredList}
          loading={isLoading}
          rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
          scroll={{ x: 'max-content' }}
          size="middle"
        />
      )}

      {/* 驳回弹窗（沿用现成组件） */}
      <RejectContentModal
        open={!!rejectTarget}
        contentName={rejectTarget?.name}
        confirmLoading={rejectMutation.isPending}
        onSubmit={(body) => rejectTarget && rejectMutation.mutate({ contentId: rejectTarget.id, ...body })}
        onCancel={() => setRejectTarget(null)}
      />

      {/* 绑定到展项 Modal — vendor 内容跨展厅，先选 Hall 再选 Exhibit */}
      <Modal
        title={`绑定到展项：${bindTarget?.name ?? ''}`}
        open={!!bindTarget}
        onOk={() => {
          if (!bindTarget || !bindExhibitId) return;
          bindMutation.mutate({ contentId: bindTarget.id, exhibitId: bindExhibitId });
        }}
        onCancel={() => {
          setBindTarget(null);
          setBindHallId(null);
          setBindExhibitId(null);
        }}
        confirmLoading={bindMutation.isPending}
        okButtonProps={{ disabled: !bindExhibitId }}
        width={460}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          先选展厅，再选具体展项。绑定后内容状态变为「已绑定」并向供应商发出通知。
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Select
            placeholder="选择展厅"
            style={{ width: '100%' }}
            value={bindHallId}
            onChange={(v) => {
              setBindHallId(v);
              setBindExhibitId(null);
            }}
            options={halls.map((h: HallListItem) => ({ value: h.id, label: h.name }))}
            showSearch
            filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
          />
          <Select
            placeholder={bindHallId ? '选择展项' : '请先选展厅'}
            style={{ width: '100%' }}
            value={bindExhibitId}
            onChange={setBindExhibitId}
            options={exhibits.map((e: ExhibitListItem) => ({ value: e.id, label: e.name }))}
            disabled={!bindHallId}
            showSearch
            filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
          />
        </Space>
      </Modal>

      <ContentDetailDrawer
        open={drawerContentId != null}
        contentId={drawerContentId}
        onClose={() => setDrawerContentId(null)}
      />
    </div>
  );
}
