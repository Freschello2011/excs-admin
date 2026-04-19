import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Table, Select, Progress, Button, Space, Typography } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import StatusTag from '@/components/common/StatusTag';
import { contentApi } from '@/api/content';
import { queryKeys } from '@/api/queryKeys';
import type { DistributionItem, DistributionStatus, ExhibitContentItem } from '@/types/content';

interface Props {
  hallId: number;
  exhibitId: number;
  canManage: boolean;
}

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'downloading', label: '下载中' },
  { value: 'ready', label: '就绪' },
  { value: 'failed', label: '失败' },
];

function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function ExhibitDistributionTab({ hallId, exhibitId, canManage }: Props) {
  const { message } = useMessage();
  const [statusFilter, setStatusFilter] = useState<DistributionStatus | 'all'>('all');

  // Get exhibit content to know which content_ids belong to this exhibit
  const { data: contentItems = [] } = useQuery({
    queryKey: queryKeys.exhibitContent(exhibitId),
    queryFn: () => contentApi.getExhibitContent(exhibitId),
    select: (res) => res.data.data,
  });

  const contentIds = useMemo(() => {
    const ids = new Set<number>();
    contentItems.forEach((c: ExhibitContentItem) => ids.add(c.content_id));
    return ids;
  }, [contentItems]);

  const params = {
    hall_id: hallId,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
  };

  const { data: allDistributions = [], isLoading } = useQuery({
    queryKey: queryKeys.distributions({ ...params, exhibit_id: exhibitId } as Record<string, unknown>),
    queryFn: () => contentApi.getDistributions(params),
    select: (res) => res.data.data,
    refetchInterval: (query) => {
      const raw = query.state.data;
      const data = raw?.data?.data;
      if (data && data.some((d: DistributionItem) => d.status === 'downloading' || d.status === 'pending')) {
        return 5000;
      }
      return false;
    },
  });

  // Filter distributions to only those matching this exhibit's content
  const distributions = useMemo(() => {
    if (contentIds.size === 0) return allDistributions;
    return allDistributions.filter((d) => contentIds.has(d.content_id));
  }, [allDistributions, contentIds]);

  const downloadMutation = useMutation({
    mutationFn: (contentId: number) => contentApi.getDownloadUrl(contentId),
    onSuccess: (res) => {
      const { download_url, filename, file_size, sha256 } = res.data.data;
      // 1. Download encrypted file
      const a = document.createElement('a');
      a.href = download_url;
      a.download = filename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 2. Generate and download manifest.sha256
      if (sha256) {
        const manifestContent = `${sha256}  ${filename}\n`;
        const blob = new Blob([manifestContent], { type: 'text/plain' });
        const manifestUrl = URL.createObjectURL(blob);
        const b = document.createElement('a');
        b.href = manifestUrl;
        b.download = 'manifest.sha256';
        document.body.appendChild(b);
        setTimeout(() => {
          b.click();
          document.body.removeChild(b);
          URL.revokeObjectURL(manifestUrl);
        }, 500);
      }

      message.success(`开始下载 ${filename} (${formatFileSize(file_size)})`);
    },
  });

  const columns: TableColumnsType<DistributionItem> = [
    { title: '文件名', dataIndex: 'filename', ellipsis: true, render: (v: string) => v || '-' },
    { title: 'App 实例 / 展项', dataIndex: 'instance_exhibit_name', render: (v: string) => v || '-' },
    {
      title: '分发方式',
      dataIndex: 'distribution_type',
      width: 100,
      render: (v: string) => v === 'auto' ? '自动' : '手动',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: string) => <StatusTag status={s} />,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 160,
      render: (v: number, record) => {
        if (record.status === 'ready') return <Progress percent={100} size="small" />;
        if (record.status === 'downloading') return <Progress percent={v} size="small" status="active" />;
        if (record.status === 'failed') return <Progress percent={v} size="small" status="exception" />;
        return <Progress percent={0} size="small" />;
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    ...(canManage ? [{
      title: '操作',
      width: 120,
      render: (_: unknown, record: DistributionItem) => (
        <Button
          type="link"
          size="small"
          icon={<DownloadOutlined />}
          loading={downloadMutation.isPending}
          onClick={() => downloadMutation.mutate(record.content_id)}
        >
          离线下载
        </Button>
      ),
    }] : []),
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 140 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
        />
        <Typography.Text type="secondary">
          共 {distributions.length} 个分发记录
        </Typography.Text>
      </Space>

      <Table<DistributionItem>
        columns={columns}
        dataSource={distributions}
        loading={isLoading}
        pagination={false}
        rowKey="id"
        size="middle"
        locale={{ emptyText: '暂无分发记录' }}
      />
    </div>
  );
}
