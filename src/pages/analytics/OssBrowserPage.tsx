import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Table, Input, Tabs, Spin, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { analyticsApi } from '@/api/analytics';
import { queryKeys } from '@/api/queryKeys';
import type { OssObjectDTO } from '@/types/analytics';
import dayjs from 'dayjs';

const BUCKETS = [
  { key: 'excs-raw', label: '原始桶 (excs-raw)' },
  { key: 'excs-encrypted', label: '加密桶 (excs-encrypted)' },
  { key: 'excs-thumbnail', label: '缩略图桶 (excs-thumbnail)' },
];

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

export default function OssBrowserPage() {
  const [bucket, setBucket] = useState('excs-encrypted');
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
    <div>
      <PageHeader title="OSS 存储浏览" description="浏览 OSS 桶中的文件" />

      <Card>
        <Tabs
          activeKey={bucket}
          onChange={(key) => {
            setBucket(key);
            setPrefix('');
            setMarker('');
          }}
          items={BUCKETS.map((b) => ({ key: b.key, label: b.label }))}
        />

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
      </Card>
    </div>
  );
}
