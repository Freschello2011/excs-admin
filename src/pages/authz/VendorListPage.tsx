import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '@/components/common/PageHeader';
import Can from '@/components/authz/Can';
import ExpiryTag from '@/components/authz/common/ExpiryTag';
import { vendorApi } from '@/api/vendor';
import type { Vendor, VendorStatus } from '@/types/authz';

const STATUS_META: Record<VendorStatus, { label: string; color: string }> = {
  active: { label: '启用', color: 'green' },
  suspended: { label: '已停用', color: 'red' },
  archived: { label: '已归档', color: 'default' },
};

export default function VendorListPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['authz', 'vendors'],
    queryFn: () => vendorApi.list(),
    select: (res) => res.data.data?.list ?? [],
  });

  const columns: TableColumnsType<Vendor> = [
    {
      title: '供应商',
      dataIndex: 'name',
      key: 'name',
      render: (_, v) => (
        <Link to={`/platform/authz/vendors/${v.id}`}>
          <strong>{v.name}</strong>
          <div style={{ fontSize: 12, color: '#999' }}>{v.code}</div>
        </Link>
      ),
    },
    {
      title: '主账号',
      dataIndex: 'contact_name',
      key: 'contact_name',
      render: (_, v) => (
        <div>
          <div>{v.contact_name || '-'}</div>
          <div style={{ fontSize: 12, color: '#999' }}>
            {v.contact_phone || '-'}
            {v.contact_email ? ` · ${v.contact_email}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: '授权到期',
      dataIndex: 'grant_expires_at',
      key: 'grant_expires_at',
      width: 200,
      render: (val: string) => <ExpiryTag expiresAt={val} variant="full" />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: VendorStatus) => {
        const meta = STATUS_META[s] ?? { label: s, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (val: string) => (val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, v) => (
        <Link to={`/platform/authz/vendors/${v.id}`}>查看详情</Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="供应商管理"
        extra={
          <Can action="vendor.manage" mode="hide">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/platform/authz/vendors/new')}
            >
              新建供应商
            </Button>
          </Can>
        }
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
      />
    </div>
  );
}
