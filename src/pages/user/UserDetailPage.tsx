import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Descriptions,
  Tag,
  Select,
  Button,
  Checkbox,
  Space,
  Spin,
  Divider,
  Avatar,
  Popconfirm,
  Row,
  Col,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { ArrowLeftOutlined, UserOutlined, DeleteOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { userApi } from '@/api/user';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { HallPermission } from '@/types/auth';
import dayjs from 'dayjs';
import { useState, useEffect } from 'react';

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'technician', label: '技术员' },
  { value: 'narrator', label: '讲解员' },
  { value: 'producer', label: '制作人' },
];

const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  technician: 'blue',
  narrator: 'green',
  producer: 'purple',
};

const ALL_PERMISSIONS = [
  { value: 'device_control', label: '设备控制' },
  { value: 'content_manage', label: '内容管理' },
  { value: 'scene_switch', label: '场景切换' },
  { value: 'show_control', label: '演出控制' },
  { value: 'system_config', label: '系统配置' },
];

export default function UserDetailPage() {
  const { message } = useMessage();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = Number(userId);

  const { data: user, isLoading } = useQuery({
    queryKey: queryKeys.userDetail(id),
    queryFn: () => userApi.getUser(id),
    select: (res) => res.data.data,
    enabled: !!id,
  });

  // Fetch hall list for adding permissions
  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 200 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 200 }),
    select: (res) => res.data.data,
  });

  const halls = hallsData?.list ?? [];

  const roleMutation = useMutation({
    mutationFn: (role: string) => userApi.assignRole(id, role),
    onSuccess: () => {
      message.success('角色已更新');
      queryClient.invalidateQueries({ queryKey: queryKeys.userDetail(id) });
      queryClient.invalidateQueries({ queryKey: ['auth', 'users'] });
    },
  });

  const permMutation = useMutation({
    mutationFn: (data: { hall_id: number; permissions: string[] }) =>
      userApi.setHallPermissions(id, data),
    onSuccess: () => {
      message.success('权限已更新');
      queryClient.invalidateQueries({ queryKey: queryKeys.userDetail(id) });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (hallId: number) => userApi.revokeHallPermission(id, hallId),
    onSuccess: () => {
      message.success('权限已撤销');
      queryClient.invalidateQueries({ queryKey: queryKeys.userDetail(id) });
    },
  });

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  if (!user) {
    return <div>用户不存在</div>;
  }

  // Halls that user doesn't have permissions for yet
  const existingHallIds = new Set(user.hall_permissions.map((hp) => hp.hall_id));
  const availableHalls = halls.filter((h) => !existingHallIds.has(h.id));

  return (
    <div>
      <PageHeader
        title="用户详情"
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/users')}>
            返回列表
          </Button>
        }
      />

      <Row gutter={24}>
        {/* Left column: User info card */}
        <Col xs={24} lg={8}>
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Avatar
                size={80}
                src={user.avatar}
                icon={<UserOutlined />}
              />
              <h3 style={{ marginTop: 12, marginBottom: 4 }}>{user.name}</h3>
              <Tag color={ROLE_COLORS[user.role] || 'default'}>
                {ROLE_OPTIONS.find((r) => r.value === user.role)?.label || user.role}
              </Tag>
            </div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="邮箱">{user.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="手机">{user.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={user.status === 'active' ? 'green' : 'default'}>
                  {user.status === 'active' ? '正常' : user.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(user.created_at).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="最后登录">
                {user.last_login_at ? dayjs(user.last_login_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* Right column: Role assignment + hall permissions */}
        <Col xs={24} lg={16}>
          <Card title="角色分配" style={{ marginBottom: 16 }}>
            <Space>
              <span>当前角色：</span>
              <Select
                style={{ width: 160 }}
                value={user.role}
                options={ROLE_OPTIONS}
                loading={roleMutation.isPending}
                onChange={(v) => roleMutation.mutate(v)}
              />
            </Space>
          </Card>

          <Card title="展厅权限管理">
            {user.hall_permissions.length === 0 && (
              <p style={{ color: 'var(--color-outline)' }}>暂无展厅权限</p>
            )}

            {user.hall_permissions.map((hp) => (
              <HallPermissionRow
                key={hp.hall_id}
                permission={hp}
                loading={permMutation.isPending || revokeMutation.isPending}
                onSave={(permissions) =>
                  permMutation.mutate({ hall_id: hp.hall_id, permissions })
                }
                onRevoke={() => revokeMutation.mutate(hp.hall_id)}
              />
            ))}

            {availableHalls.length > 0 && (
              <>
                <Divider />
                <AddHallPermission
                  halls={availableHalls}
                  loading={permMutation.isPending}
                  onAdd={(hallId, permissions) =>
                    permMutation.mutate({ hall_id: hallId, permissions })
                  }
                />
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

/** Single hall permission row with checkboxes */
function HallPermissionRow({
  permission,
  loading,
  onSave,
  onRevoke,
}: {
  permission: HallPermission;
  loading: boolean;
  onSave: (permissions: string[]) => void;
  onRevoke: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(permission.permissions);

  useEffect(() => {
    setSelected(permission.permissions);
  }, [permission.permissions]);

  const hasChanged =
    selected.length !== permission.permissions.length ||
    selected.some((p) => !permission.permissions.includes(p));

  return (
    <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-surface)', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>{permission.hall_name}</strong>
        <Space>
          {hasChanged && (
            <Button
              type="primary"
              size="small"
              loading={loading}
              onClick={() => onSave(selected)}
            >
              保存
            </Button>
          )}
          <Popconfirm
            title="确定撤销该展厅的所有权限？"
            onConfirm={onRevoke}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              撤销
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <Checkbox.Group
        value={selected}
        onChange={(vals) => setSelected(vals as string[])}
        options={ALL_PERMISSIONS}
      />
    </div>
  );
}

/** Add permission for a new hall */
function AddHallPermission({
  halls,
  loading,
  onAdd,
}: {
  halls: { id: number; name: string }[];
  loading: boolean;
  onAdd: (hallId: number, permissions: string[]) => void;
}) {
  const { message } = useMessage();
  const [hallId, setHallId] = useState<number | undefined>();
  const [permissions, setPermissions] = useState<string[]>([]);

  const handleAdd = () => {
    if (!hallId || permissions.length === 0) {
      message.warning('请选择展厅和至少一项权限');
      return;
    }
    onAdd(hallId, permissions);
    setHallId(undefined);
    setPermissions([]);
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>添加展厅权限</h4>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Select
          placeholder="选择展厅"
          style={{ width: 300 }}
          value={hallId}
          onChange={setHallId}
          options={halls.map((h) => ({ value: h.id, label: h.name }))}
          showSearch
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
          }
        />
        <Checkbox.Group
          value={permissions}
          onChange={(vals) => setPermissions(vals as string[])}
          options={ALL_PERMISSIONS}
        />
        <Button
          type="primary"
          loading={loading}
          disabled={!hallId || permissions.length === 0}
          onClick={handleAdd}
        >
          添加权限
        </Button>
      </Space>
    </div>
  );
}
