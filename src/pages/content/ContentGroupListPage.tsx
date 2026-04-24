import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Select, Button, Modal, Popconfirm, Image, Typography, Space, Segmented, Tag,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { LinkOutlined, FileImageOutlined, SoundOutlined, DeleteOutlined, StopOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import RejectContentModal from '@/components/content/RejectContentModal';
import { contentApi } from '@/api/content';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import { useHallStore } from '@/stores/hallStore';
import type { ExhibitListItem } from '@/types/hall';
import type { ContentRejectReason } from '@/types/content';

// Phase 10：4 态 Tab（老 BindFilter 的 bound/unbound/all 保留兼容，新增 pending_accept 与 archived）
type BindFilter = 'all' | 'pending_accept' | 'bound' | 'archived';

interface ContentRow {
  id: number;
  hall_id: number | null;
  vendor_id?: number | null;
  exhibit_id: number | null;
  name: string;
  type: string;
  status: string;
  duration_ms: number;
  file_size: number;
  has_audio: boolean;
  thumbnail_url?: string;
}

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
  const canManage = useCan(
    'content.edit',
    selectedHallId ? { type: 'hall', id: String(selectedHallId) } : undefined,
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const bindParam = (searchParams.get('bind') ?? 'all') as BindFilter;
  const validBinds: BindFilter[] = ['all', 'pending_accept', 'bound', 'archived'];
  const bindFilter: BindFilter = validBinds.includes(bindParam) ? bindParam : 'all';

  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [bindingItem, setBindingItem] = useState<ContentRow | null>(null);
  const [bindExhibitId, setBindExhibitId] = useState<number | null>(null);
  const [rejectItem, setRejectItem] = useState<ContentRow | null>(null);

  // 全量内容（hall 维度）— 后端分页，这里取较大 page_size 作为内容总库视图
  const { data: rawList = [], isLoading } = useQuery({
    queryKey: queryKeys.contents({ hall_id: selectedHallId ?? 0, page: 1, page_size: 500 }),
    queryFn: () => contentApi.listContents({ hall_id: selectedHallId!, page: 1, page_size: 500 }),
    select: (res) => (res.data.data?.list ?? []) as unknown as ContentRow[],
    enabled: !!selectedHallId,
  });

  // Exhibits — 用于绑定 modal + 展示 exhibit 名称
  const { data: exhibits = [] } = useQuery({
    queryKey: queryKeys.exhibits(selectedHallId!),
    queryFn: () => hallApi.getExhibits(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  const exhibitNameMap = useMemo(() => {
    const m = new Map<number, string>();
    exhibits.forEach((e: ExhibitListItem) => m.set(e.id, e.name));
    return m;
  }, [exhibits]);

  const filteredItems = useMemo(() => {
    return rawList.filter((item) => {
      if (bindFilter === 'all') return true;
      if (bindFilter === 'pending_accept') return item.status === 'pending_accept';
      if (bindFilter === 'archived') return item.status === 'archived';
      // bound Tab：已绑定到展项 或 status=bound
      return item.status === 'bound' || (item.exhibit_id != null && item.status !== 'archived' && item.status !== 'pending_accept');
    });
  }, [rawList, bindFilter]);

  const counts = useMemo(() => ({
    all: rawList.length,
    pending: rawList.filter((i) => i.status === 'pending_accept').length,
    bound: rawList.filter((i) => i.status === 'bound' || (i.exhibit_id != null && i.status !== 'archived' && i.status !== 'pending_accept')).length,
    archived: rawList.filter((i) => i.status === 'archived').length,
  }), [rawList]);

  const bindMutation = useMutation({
    mutationFn: ({ contentId, exhibitId }: { contentId: number; exhibitId: number }) =>
      contentApi.bindToExhibit(contentId, exhibitId),
    onSuccess: () => {
      message.success('绑定成功');
      queryClient.invalidateQueries({ queryKey: ['contents'] });
      closeBind();
    },
    onError: () => message.error('绑定失败'),
  });

  const unbindMutation = useMutation({
    mutationFn: (contentId: number) => contentApi.unbindContent(contentId),
    onSuccess: () => {
      message.success('已解绑');
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
    onError: () => message.error('解绑失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (contentId: number) => contentApi.deleteContent(contentId),
    onSuccess: () => {
      message.success('文件已删除');
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
    onError: () => message.error('删除失败'),
  });

  const rejectMutation = useMutation({
    mutationFn: (args: { contentId: number; reasons: ContentRejectReason[]; note: string }) =>
      contentApi.rejectContent(args.contentId, { reasons: args.reasons, note: args.note }),
    onSuccess: () => {
      message.success('已驳回，供应商将收到通知');
      setRejectItem(null);
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
    onError: (err: Error) => message.error(err.message || '驳回失败'),
  });

  const openBind = (item: ContentRow) => {
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

  const handleBindFilterChange = (next: BindFilter) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'all') nextParams.delete('bind');
    else nextParams.set('bind', next);
    setSearchParams(nextParams, { replace: true });
  };

  const columns: TableColumnsType<ContentRow> = [
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
          <Typography.Text ellipsis style={{ maxWidth: 260 }}>{name}</Typography.Text>
          {record.has_audio && <SoundOutlined style={{ color: 'var(--ant-color-primary)', fontSize: 13 }} />}
        </Space>
      ),
    },
    {
      title: '绑定展项',
      width: 180,
      render: (_: unknown, record) => {
        if (record.exhibit_id == null) return <Tag>未绑定</Tag>;
        return <Tag color="blue">{exhibitNameMap.get(record.exhibit_id) ?? `#${record.exhibit_id}`}</Tag>;
      },
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      width: 90,
      render: (v: number) => formatFileSize(v),
    },
    {
      title: '时长',
      dataIndex: 'duration_ms',
      width: 80,
      render: (v: number) => (v > 0 ? formatDuration(v) : '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (s: string) => <StatusTag status={s} />,
    },
    {
      title: '操作',
      width: 260,
      render: (_: unknown, record) => (
        <Space size="small">
          {canManage && (
            <>
              {/* Phase 10：pending_accept 显示 [绑定展项] + [驳回]；其他状态走原有解绑/删除 */}
              {record.status === 'pending_accept' ? (
                <>
                  <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openBind(record)}>
                    绑定展项
                  </Button>
                  <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => setRejectItem(record)}>
                    驳回
                  </Button>
                </>
              ) : record.exhibit_id == null ? (
                <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openBind(record)}>
                  绑定展项
                </Button>
              ) : (
                <Popconfirm title="确认解绑？" onConfirm={() => unbindMutation.mutate(record.id)}>
                  <Button type="link" size="small">解绑</Button>
                </Popconfirm>
              )}
              <Popconfirm
                title="确认删除此文件？"
                description="删除后 OSS 文件和关联标签将一并清除；已绑定内容走归档，保留原 OSS 对象"
                onConfirm={() => deleteMutation.mutate(record.id)}
                okText="删除"
                okButtonProps={{ danger: true }}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
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
        description="展厅所有内容文件的统一管理视图，可按绑定状态筛选"
      />

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Space align="center" size="small">
              <span style={{ fontSize: 13, color: 'var(--color-on-surface-variant)' }}>内容状态</span>
              <Segmented
                value={bindFilter}
                onChange={(v) => handleBindFilterChange(v as BindFilter)}
                options={[
                  { value: 'all', label: `全部 · ${counts.all}` },
                  { value: 'pending_accept', label: `仅未绑定 · ${counts.pending}` },
                  { value: 'bound', label: `已绑定 · ${counts.bound}` },
                  { value: 'archived', label: `已归档 · ${counts.archived}` },
                ]}
              />
            </Space>
          </div>
          <Table<ContentRow>
            columns={columns}
            dataSource={filteredItems}
            loading={isLoading}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            rowKey="id"
            size="middle"
            locale={{ emptyText: '暂无内容' }}
          />
        </>
      )}

      {/* Phase 10：驳回弹窗（PRD §7.5 至少 1 原因码 / 5 字 note 客户端校验） */}
      <RejectContentModal
        open={!!rejectItem}
        contentName={rejectItem?.name}
        confirmLoading={rejectMutation.isPending}
        onSubmit={(body) => rejectItem && rejectMutation.mutate({ contentId: rejectItem.id, ...body })}
        onCancel={() => setRejectItem(null)}
      />

      {/* Bind to exhibit modal */}
      <Modal
        title="绑定到展项"
        open={bindModalOpen}
        onOk={handleBind}
        onCancel={closeBind}
        confirmLoading={bindMutation.isPending}
        okButtonProps={{ disabled: !bindExhibitId }}
        width={420}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
          将「{bindingItem?.name}」绑定到选定展项
        </div>
        <Select
          style={{ width: '100%' }}
          placeholder="选择展项"
          value={bindExhibitId}
          onChange={(v) => setBindExhibitId(v)}
          options={exhibits.map((e: ExhibitListItem) => ({ value: e.id, label: e.name }))}
          showSearch
          filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
        />
      </Modal>
    </div>
  );
}
