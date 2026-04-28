/**
 * ContentGroupListPage —— 内容总库（Phase 12 升级）。
 *
 * 变化：
 *   - Segmented → PillTabs（与 Vendor / Authz 全栈对齐）
 *   - 4 Tab → 5 Tab：全部 / 待接收 / 已绑定 / 已驳回 / 已撤回 / 已归档
 *   - 加 vendor 下拉筛选（vendor_ids）+ keyword 搜索（前端过滤）
 *   - URL ?status=&vendor_id=&keyword= 全同步
 *   - 后端从 listContents(hall) 改为 adminListContents(vendor_ids/status/hall)
 *     —— 真正"内容总库"维度（非 hall 维度），未选展厅时也能查
 *   - StatusTag → ContentStatusTag 共用组件
 *   - 详情按钮触发 ContentDetailDrawer（版本链 + 操作历史）
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Select, Button, Modal, Popconfirm, Image, Typography, Space, Input, Tag,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import {
  LinkOutlined, FileImageOutlined, SoundOutlined, DeleteOutlined, StopOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';
import ContentStatusTag from '@/components/content/ContentStatusTag';
import RejectContentModal from '@/components/content/RejectContentModal';
import ContentDetailDrawer from '@/components/content/ContentDetailDrawer';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { contentApi } from '@/api/content';
import { hallApi } from '@/api/hall';
import { vendorApi } from '@/api/vendor';
import { useCan } from '@/lib/authz/can';
import { useHallStore } from '@/stores/hallStore';
import type { ExhibitListItem } from '@/api/gen/client';
import type { ContentDetail, ContentRejectReason, ContentStatus } from '@/api/gen/client';
import type { Vendor } from '@/api/gen/client';

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

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function ContentGroupListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const canManage = useCan('content.edit');

  const [searchParams, setSearchParams] = useSearchParams();

  // ---- URL 同步参数 ----
  const validStatus: StatusFilter[] = ['all', 'pending_accept', 'bound', 'rejected', 'withdrawn', 'archived'];
  const statusParam = searchParams.get('status') as StatusFilter | null;
  const status: StatusFilter = statusParam && validStatus.includes(statusParam) ? statusParam : 'all';
  const vendorIdParam = searchParams.get('vendor_id');
  const vendorIdFilter = vendorIdParam ? Number(vendorIdParam) : undefined;
  const keyword = searchParams.get('keyword') ?? '';
  // 'all' = 全展厅；具体 hallId = 仅该展厅；'current' = 沿用顶栏选中的 hall
  const hallScope = searchParams.get('hall_scope') ?? 'all';

  const updateParam = (patches: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patches).forEach(([k, v]) => {
      if (v == null || v === '' || v === 'all') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  };

  // ---- 模态状态 ----
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [bindingItem, setBindingItem] = useState<ContentDetail | null>(null);
  const [bindExhibitId, setBindExhibitId] = useState<number | null>(null);
  const [rejectItem, setRejectItem] = useState<ContentDetail | null>(null);
  const [drawerContentId, setDrawerContentId] = useState<number | null>(null);

  // ---- 数据：内容总库 admin 维度（vendor_ids / status / hall_id 多维过滤） ----
  const queryParams = useMemo(() => {
    const p: Parameters<typeof contentApi.adminListContents>[0] = {
      page: 1,
      page_size: 500,
    };
    if (status !== 'all') p.status = status;
    if (vendorIdFilter) p.vendor_ids = String(vendorIdFilter);
    if (hallScope === 'current' && selectedHallId) p.hall_id = selectedHallId;
    return p;
  }, [status, vendorIdFilter, hallScope, selectedHallId]);

  const { data: rawList = [], isLoading } = useQuery({
    queryKey: ['admin', 'contents', queryParams],
    queryFn: () => contentApi.adminListContents(queryParams),
    select: (res) => (res.data.data?.list ?? []) as ContentDetail[],
  });

  // ---- 辅助数据 ----
  const { data: vendors = [] } = useQuery({
    queryKey: ['authz', 'vendors', 'all'],
    queryFn: () => vendorApi.list(),
    select: (res) => (res.data.data?.list ?? []) as Vendor[],
  });

  const { data: exhibits = [] } = useQuery({
    queryKey: ['halls', selectedHallId, 'exhibits'],
    queryFn: () => hallApi.getExhibits(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  const exhibitNameMap = useMemo(() => {
    const m = new Map<number, string>();
    exhibits.forEach((e: ExhibitListItem) => m.set(e.id, e.name));
    return m;
  }, [exhibits]);

  const vendorNameMap = useMemo(() => {
    const m = new Map<number, string>();
    vendors.forEach((v) => m.set(v.id, v.name));
    return m;
  }, [vendors]);

  // 关键词前端过滤
  const filteredItems = useMemo(() => {
    if (!keyword) return rawList;
    const lk = keyword.toLowerCase();
    return rawList.filter((x) => x.name.toLowerCase().includes(lk));
  }, [rawList, keyword]);

  // ---- 状态计数（不受 keyword 影响，所有 5 状态） ----
  const counts = useMemo(() => ({
    all: rawList.length,
    pending_accept: rawList.filter((i) => i.status === 'pending_accept').length,
    bound: rawList.filter((i) => i.status === 'bound').length,
    rejected: rawList.filter((i) => i.status === 'rejected').length,
    withdrawn: rawList.filter((i) => i.status === 'withdrawn').length,
    archived: rawList.filter((i) => i.status === 'archived').length,
  }), [rawList]);

  // ---- mutations ----
  const bindMutation = useMutation({
    mutationFn: ({ contentId, exhibitId }: { contentId: number; exhibitId: number }) =>
      contentApi.bindToExhibit(contentId, exhibitId),
    onSuccess: () => {
      message.success('绑定成功');
      queryClient.invalidateQueries({ queryKey: ['admin', 'contents'] });
      closeBind();
    },
    onError: () => message.error('绑定失败'),
  });

  const unbindMutation = useMutation({
    mutationFn: (contentId: number) => contentApi.unbindContent(contentId),
    onSuccess: () => {
      message.success('已解绑');
      queryClient.invalidateQueries({ queryKey: ['admin', 'contents'] });
    },
    onError: () => message.error('解绑失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ contentId, reason }: { contentId: number; reason?: string }) =>
      contentApi.deleteContent(contentId, reason),
    onSuccess: () => {
      message.success('文件已删除');
      queryClient.invalidateQueries({ queryKey: ['admin', 'contents'] });
    },
    onError: () => message.error('删除失败'),
  });

  const rejectMutation = useMutation({
    mutationFn: (args: { contentId: number; reasons: ContentRejectReason[]; note: string }) =>
      contentApi.rejectContent(args.contentId, { reasons: args.reasons, note: args.note }),
    onSuccess: () => {
      message.success('已驳回，供应商将收到通知');
      setRejectItem(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'contents'] });
    },
    onError: (err: Error) => message.error(err.message || '驳回失败'),
  });

  // ---- handlers ----
  const openBind = (item: ContentDetail) => {
    setBindingItem(item);
    setBindExhibitId(null);
    setBindModalOpen(true);
  };

  const closeBind = () => {
    setBindModalOpen(false);
    setBindingItem(null);
    setBindExhibitId(null);
  };

  const handleBind = () => {
    if (!bindingItem || !bindExhibitId) return;
    bindMutation.mutate({ contentId: bindingItem.id, exhibitId: bindExhibitId });
  };

  // ---- 表格列 ----
  const columns: TableColumnsType<ContentDetail> = [
    {
      title: '缩略图',
      width: 80,
      render: (_: unknown, record) =>
        record.thumbnail_url ? (
          <Image
            src={record.thumbnail_url}
            width={64}
            height={36}
            style={{ objectFit: 'cover', borderRadius: 4 }}
            fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iMzYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjM2IiBmaWxsPSIjZjBmMGYwIi8+PC9zdmc+"
            preview={{ mask: false }}
          />
        ) : (
          <div style={{ width: 64, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ant-color-bg-layout)', borderRadius: 4 }}>
            <FileImageOutlined style={{ fontSize: 18, color: '#bfbfbf' }} />
          </div>
        ),
    },
    {
      title: '文件名',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Space size={4}>
          <Typography.Text ellipsis style={{ maxWidth: 240 }}>{name}</Typography.Text>
          {record.has_audio && <SoundOutlined style={{ color: 'var(--ant-color-primary)', fontSize: 13 }} />}
          {record.content_version && record.content_version > 1 && (
            <Tag color="purple">v{record.content_version}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '供应商',
      width: 140,
      render: (_: unknown, record) =>
        record.vendor_id ? (
          <Tag color="cyan">{vendorNameMap.get(record.vendor_id) ?? `#${record.vendor_id}`}</Tag>
        ) : <Tag>内部</Tag>,
    },
    {
      title: '展厅 / 展项',
      width: 200,
      render: (_: unknown, record) => {
        const hallText = record.hall_name ?? (record.hall_id ? `#${record.hall_id}` : '-');
        return (
          <Space size={4}>
            <Tag color="blue">{hallText}</Tag>
            {record.exhibit_id != null && (
              <Tag color="geekblue">{exhibitNameMap.get(record.exhibit_id) ?? `#${record.exhibit_id}`}</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 70,
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      width: 90,
      render: (v: number) => formatFileSize(v),
    },
    {
      title: '时长',
      dataIndex: 'duration',
      width: 80,
      render: (v: number) => (v > 0 ? formatDuration(v) : '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: ContentStatus) => <ContentStatusTag status={s} />,
    },
    {
      title: '操作',
      width: 280,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => setDrawerContentId(record.id)}>
            详情
          </Button>
          {canManage && (
            <>
              {record.status === 'pending_accept' ? (
                <>
                  <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openBind(record)}>
                    绑定
                  </Button>
                  <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => setRejectItem(record)}>
                    驳回
                  </Button>
                </>
              ) : record.status === 'bound' ? (
                <Popconfirm title="确认解绑？" onConfirm={() => unbindMutation.mutate(record.id)}>
                  <Button type="link" size="small">解绑</Button>
                </Popconfirm>
              ) : null}
              {(record.status === 'pending_accept' || record.status === 'rejected' || record.status === 'withdrawn' || record.status === 'archived') && (
                <RiskyActionButton
                  action="content.delete"
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  confirmTitle="删除内容"
                  confirmContent="OSS 文件与关联标签将一并清除（已绑定状态请先解绑或归档）。请填写操作原因（≥ 5 字，审计用）。"
                  onConfirm={async (reason) => {
                    await deleteMutation.mutateAsync({ contentId: record.id, reason });
                  }}
                >
                  删除
                </RiskyActionButton>
              )}
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="内容总库"
        description="跨展厅 / 全供应商的内容统一管理；支持按状态、供应商、关键词筛选"
      />

      {/* 筛选条 */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Select
          allowClear
          placeholder="全部供应商"
          style={{ minWidth: 200 }}
          value={vendorIdFilter}
          onChange={(v) => updateParam({ vendor_id: v ? String(v) : null })}
          options={vendors.map((v) => ({ value: v.id, label: v.name }))}
          showSearch
          filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
        />
        <Select
          style={{ minWidth: 180 }}
          value={hallScope}
          onChange={(v) => updateParam({ hall_scope: v })}
          options={[
            { value: 'all', label: '全部展厅' },
            { value: 'current', label: `仅当前展厅${selectedHallId ? '' : '（请先在顶栏选展厅）'}`, disabled: !selectedHallId },
          ]}
        />
        <Input.Search
          allowClear
          placeholder="搜索文件名"
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => updateParam({ keyword: e.target.value || null })}
        />
        <Typography.Text type="secondary">{isLoading ? '加载中…' : `共 ${filteredItems.length} 条`}</Typography.Text>
      </div>

      {/* 5 Tab PillTabs */}
      <div style={{ marginBottom: 12 }}>
        <PillTabs<StatusFilter>
          tabs={TABS.map((t) => ({
            ...t,
            label: t.key === 'all' ? `全部 · ${counts.all}` : `${t.label} · ${counts[t.key]}`,
          }))}
          active={status}
          onChange={(k) => updateParam({ status: k })}
          ariaLabel="内容生命周期状态 tab"
        />
      </div>

      <Table<ContentDetail>
        columns={columns}
        dataSource={filteredItems}
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
        rowKey="id"
        size="middle"
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '暂无内容' }}
      />

      <RejectContentModal
        open={!!rejectItem}
        contentName={rejectItem?.name}
        confirmLoading={rejectMutation.isPending}
        onSubmit={(body) => rejectItem && rejectMutation.mutate({ contentId: rejectItem.id, ...body })}
        onCancel={() => setRejectItem(null)}
      />

      <Modal
        title="绑定到展项"
        open={bindModalOpen}
        onOk={handleBind}
        onCancel={closeBind}
        confirmLoading={bindMutation.isPending}
        okButtonProps={{ disabled: !bindExhibitId }}
        width={420}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          将「{bindingItem?.name}」绑定到当前展厅下的展项
          {!selectedHallId && '（绑定操作需先在顶栏选定展厅以列出可选展项）'}
        </Typography.Paragraph>
        <Select
          style={{ width: '100%' }}
          placeholder={selectedHallId ? '选择展项' : '请先在顶栏选择展厅'}
          value={bindExhibitId}
          onChange={setBindExhibitId}
          options={exhibits.map((e: ExhibitListItem) => ({ value: e.id, label: e.name }))}
          disabled={!selectedHallId}
          showSearch
          filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
        />
      </Modal>

      <ContentDetailDrawer
        open={drawerContentId != null}
        contentId={drawerContentId}
        onClose={() => setDrawerContentId(null)}
      />
    </div>
  );
}
