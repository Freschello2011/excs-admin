import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  DatePicker,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { CopyOutlined, EyeOutlined, RedoOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import PageHeader from '@/components/common/PageHeader';
import { analyticsApi } from '@/api/analytics';
import { nasArchiveApi } from '@/api/nasArchive';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useMessage } from '@/hooks/useMessage';
import type { OssObjectDTO } from '@/api/gen/client';
import type { HallListItem } from '@/api/gen/client';
import type { NASArchiveListItem, NASArchiveListParams, NASSyncStatus } from '@/api/gen/client';

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

const STATUS_META: Record<NASSyncStatus, { label: string; color: string }> = {
  pending: { label: '待同步', color: 'orange' },
  syncing: { label: '同步中', color: 'blue' },
  synced: { label: '已归档', color: 'green' },
  failed: { label: '失败', color: 'red' },
};

function OSSBucketTable({ bucket }: { bucket: string }) {
  const [prefix, setPrefix] = useState('');
  const [marker, setMarker] = useState('');

  const params = {
    bucket,
    prefix: prefix || undefined,
    marker: marker || undefined,
    page_size: 50,
  };
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.ossBrowser(params as unknown as Record<string, unknown>),
    queryFn: () => analyticsApi.browseOSS(params),
    select: (res) => res.data.data,
  });

  const objects = data?.objects ?? [];
  const nextMarker = data?.next_marker ?? '';
  const isTruncated = data?.is_truncated ?? false;

  const columns: TableColumnsType<OssObjectDTO> = [
    {
      title: '文件名',
      dataIndex: 'key',
      ellipsis: true,
      render: (key: string) => {
        const parts = key.split('/');
        return parts[parts.length - 1] || key;
      },
    },
    { title: '完整路径', dataIndex: 'key', ellipsis: true },
    {
      title: '大小',
      dataIndex: 'size',
      width: 100,
      render: (v: number) => formatSize(v),
      sorter: (a, b) => a.size - b.size,
    },
    {
      title: '最后修改',
      dataIndex: 'last_modified',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="按文件名前缀筛选"
          allowClear
          style={{ width: 360 }}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          onSearch={() => setMarker('')}
        />
      </div>

      {isLoading ? (
        <Spin style={{ display: 'flex', justifyContent: 'center', padding: 40 }} />
      ) : (
        <>
          <div style={{ marginBottom: 8, color: 'var(--color-outline)' }}>
            当前页 {objects.length} 个文件
            {isTruncated && (
              <Tag
                color="blue"
                style={{ marginLeft: 8, cursor: 'pointer' }}
                onClick={() => setMarker(nextMarker)}
              >
                加载下一页
              </Tag>
            )}
          </div>
          <Table<OssObjectDTO>
            columns={columns}
            dataSource={objects}
            pagination={false}
            rowKey="key"
            size="middle"
            locale={{ emptyText: '该桶中无文件' }}
          />
          {isTruncated && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Tag
                color="blue"
                style={{ cursor: 'pointer', padding: '4px 16px' }}
                onClick={() => setMarker(nextMarker)}
              >
                加载更多
              </Tag>
            </div>
          )}
        </>
      )}
    </>
  );
}

function NASArchiveTable() {
  const [filters, setFilters] = useState<NASArchiveListParams>({ page: 1, page_size: 50 });
  const navigate = useNavigate();
  const { message } = useMessage();
  const queryClient = useQueryClient();

  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 } as Record<string, unknown>),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data,
  });
  const halls: HallListItem[] = hallsData?.list ?? [];

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.nasArchiveList(filters as unknown as Record<string, unknown>),
    queryFn: () => nasArchiveApi.list(filters),
    select: (res) => res.data.data,
  });

  const retryMutation = useMutation({
    mutationFn: (id: number) => nasArchiveApi.retry(id),
    onSuccess: () => {
      message.success('已重新加入同步队列');
      queryClient.invalidateQueries({ queryKey: ['nas-archive'] });
    },
  });

  const rows = data?.list ?? [];
  const total = data?.total ?? 0;

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      message.success('路径已复制');
    } catch {
      message.error('复制失败，请手动选择');
    }
  };

  const handleViewDetail = (row: NASArchiveListItem) => {
    const params = new URLSearchParams({ content: String(row.content_id) });
    if (row.exhibit_id) {
      navigate(`/halls/${row.hall_id}/exhibit-management/${row.exhibit_id}?${params.toString()}`);
    } else {
      navigate(`/halls/${row.hall_id}?${params.toString()}`);
    }
  };

  const columns: TableColumnsType<NASArchiveListItem> = [
    {
      title: '原始文件名',
      dataIndex: 'content_name',
      ellipsis: true,
      width: 220,
    },
    {
      title: '展厅',
      dataIndex: 'hall_name',
      width: 120,
      ellipsis: true,
    },
    {
      title: '展项',
      dataIndex: 'exhibit_name',
      width: 120,
      ellipsis: true,
      render: (v) => v || <span style={{ color: 'var(--color-outline)' }}>—</span>,
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      width: 100,
      render: (v: number) => formatSize(v),
      sorter: (a, b) => a.file_size - b.file_size,
    },
    {
      title: '上传者',
      dataIndex: 'uploader_name',
      width: 100,
      render: (v) => v || <span style={{ color: 'var(--color-outline)' }}>—</span>,
    },
    {
      title: '上传时间',
      dataIndex: 'uploaded_at',
      width: 140,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
      sorter: (a, b) => dayjs(a.uploaded_at).unix() - dayjs(b.uploaded_at).unix(),
    },
    {
      title: '同步状态',
      dataIndex: 'status',
      width: 100,
      render: (s: NASSyncStatus, row) => {
        const meta = STATUS_META[s] ?? { label: s, color: 'default' };
        const tag = <Tag color={meta.color}>{meta.label}</Tag>;
        if (s === 'failed' && row.last_error) {
          return <Tooltip title={row.last_error}>{tag}</Tooltip>;
        }
        return tag;
      },
    },
    {
      title: 'NAS 路径',
      dataIndex: 'nas_path',
      ellipsis: true,
      render: (path: string) => (
        <Space size={4}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{path}</span>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopyPath(path)}
          />
        </Space>
      ),
    },
    {
      title: 'sha256',
      dataIndex: 'sha256',
      width: 110,
      render: (s?: string) =>
        s ? (
          <Tooltip title={s}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.slice(0, 8)}…</span>
          </Tooltip>
        ) : (
          <span style={{ color: 'var(--color-outline)' }}>—</span>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, row) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(row)}
          >
            详情
          </Button>
          {row.status === 'failed' && (
            <Button
              type="link"
              size="small"
              icon={<RedoOutlined />}
              loading={retryMutation.isPending}
              onClick={() => retryMutation.mutate(row.id)}
            >
              重试
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="展厅"
          style={{ width: 160 }}
          value={filters.hall_id}
          onChange={(v) => setFilters({ ...filters, hall_id: v, exhibit_id: undefined, page: 1 })}
          options={halls.map((h) => ({ value: h.id, label: h.name }))}
        />
        <Select
          allowClear
          placeholder="同步状态"
          style={{ width: 140 }}
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v, page: 1 })}
          options={[
            { value: 'pending', label: '待同步' },
            { value: 'syncing', label: '同步中' },
            { value: 'synced', label: '已归档' },
            { value: 'failed', label: '失败' },
          ]}
        />
        <DatePicker.RangePicker
          placeholder={['起始', '结束']}
          onChange={(vals: [Dayjs | null, Dayjs | null] | null) => {
            const from = vals?.[0]?.format('YYYY-MM-DD');
            const to = vals?.[1]?.format('YYYY-MM-DD');
            setFilters({ ...filters, from, to, page: 1 });
          }}
        />
      </Space>

      <Table<NASArchiveListItem>
        columns={columns}
        dataSource={rows}
        loading={isLoading}
        rowKey="id"
        size="middle"
        scroll={{ x: 1400 }}
        pagination={{
          total,
          current: filters.page || 1,
          pageSize: filters.page_size || 50,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100, 200],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, pageSize) =>
            setFilters({ ...filters, page, page_size: pageSize }),
        }}
        locale={{ emptyText: '暂无归档记录' }}
      />
    </>
  );
}

// ADR-0001 + ADR-0027: 6 业务桶
const OSS_TABS = [
  { key: 'excs-raw', label: '原始桶 (excs-raw)' },
  { key: 'excs-encrypted', label: '加密桶 (excs-encrypted)' },
  { key: 'excs-thumbnail', label: '缩略图桶 (excs-thumbnail)' },
  { key: 'excs-releases', label: '发布包桶 (excs-releases)' },
  { key: 'excs-ai-assets', label: 'AI 资产桶 (excs-ai-assets)' },
];

export default function OssBrowserPage({ embedded }: { embedded?: boolean } = {}) {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [bucket, setBucket] = useState('excs-encrypted');

  const tabItems = [
    ...OSS_TABS.map((b) => ({ key: b.key, label: b.label })),
    ...(isAdmin ? [{ key: 'synology', label: 'NAS 归档 (Synology)' }] : []),
  ];

  return (
    <div>
      {!embedded && (
        <PageHeader title="存储浏览" description="浏览 OSS 桶中的文件与 NAS 归档库" />
      )}

      <Card>
        <Tabs
          activeKey={bucket}
          onChange={(key) => setBucket(key)}
          items={tabItems}
        />

        {bucket === 'synology' ? <NASArchiveTable /> : <OSSBucketTable bucket={bucket} />}
      </Card>
    </div>
  );
}
