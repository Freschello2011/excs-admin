import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Input, Table, Button, Tag, Avatar } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { UserOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import { userApi } from '@/api/user';
import type { SSOSearchUser } from '@/api/gen/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ImportSupplierModal({ open, onClose }: Props) {
  const { message } = useMessage();
  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sso-users-search', searchKeyword, page, pageSize],
    queryFn: () => userApi.searchSSOUsers({ keyword: searchKeyword, page, page_size: pageSize }),
    enabled: open && searchKeyword.length > 0,
  });

  const importMutation = useMutation({
    mutationFn: (user: SSOSearchUser) =>
      userApi.importSSOUser({
        sso_user_id: user.sso_user_id,
        name: user.nickname,
        phone: user.phone,
      }),
    onSuccess: () => {
      message.success('供应商导入成功');
      queryClient.invalidateQueries({ queryKey: ['sso-users-search'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      message.error('导入失败');
    },
  });

  const handleSearch = () => {
    setSearchKeyword(keyword);
    setPage(1);
  };

  const handleClose = () => {
    setKeyword('');
    setSearchKeyword('');
    setPage(1);
    onClose();
  };

  const columns: TableColumnsType<SSOSearchUser> = [
    {
      title: '用户',
      key: 'user',
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar src={record.avatar} icon={<UserOutlined />} size="small" />
          <span>{record.nickname}</span>
        </div>
      ),
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 140,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      width: 200,
    },
    {
      title: '操作',
      width: 100,
      align: 'center',
      render: (_, record) =>
        record.is_imported ? (
          <Tag color="green">已导入</Tag>
        ) : (
          <Button
            type="link"
            size="small"
            loading={importMutation.isPending}
            onClick={() => importMutation.mutate(record)}
          >
            导入
          </Button>
        ),
    },
  ];

  return (
    <Modal
      title="导入供应商"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={700}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索 SSO 用户（姓名、手机号...）"
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={handleSearch}
          enterButton="搜索"
          style={{ width: '100%' }}
        />
      </div>

      {searchKeyword && (
        <Table<SSOSearchUser>
          columns={columns}
          dataSource={data?.list ?? []}
          loading={isLoading}
          rowKey="sso_user_id"
          size="small"
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setPage(p),
            size: 'small',
          }}
        />
      )}
    </Modal>
  );
}
