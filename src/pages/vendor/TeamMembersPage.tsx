/**
 * 供应商「团队成员」页 —— Phase 9 / PRD §7.8。
 *
 * 仅主账号可见（VendorLayout 菜单已按 `is_primary` 过滤）；本页二次防御：
 *   - 非主账号进入会被 useEffect 跳回 /vendor/contents
 *   - 后端 POST /authz/vendors/:id/members/invite 等三条路由挂 `RequireVendorSelfOrManage`
 *     中间件，主账号自助请求放行；子账号即便绕过前端也会被后端 403
 *
 * UI 复用 VendorDetailPage 的列（账号信息 + 操作），但：
 *   - 不渲染 vendor 状态/延期/停用 vendor 按钮（那是超管的事）
 *   - vendor_id 从 useAuthStore().user.vendor_id 推导
 *   - 邀请成功后弹出 InitialPasswordModal（与超管侧一致）
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import { useAuthStore } from '@/stores/authStore';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import InitialPasswordModal from '@/components/authz/InitialPasswordModal';
import { vendorApi } from '@/api/vendor';
import { authClient } from '@/api/gen/client';
import type { VendorMember } from '@/api/gen/client';

const { Text } = Typography;

export default function TeamMembersPage() {
  const navigate = useNavigate();
  const { message } = useMessage();
  const qc = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const isPrimary = user?.is_primary === true;
  const vendorId = user?.vendor_id ?? 0;

  // 硬 gate：非主账号访问 → 跳回「我的内容」+ 警告
  useEffect(() => {
    if (user && !isPrimary) {
      message.warning('仅主账号可访问团队成员管理');
      navigate('/vendor/contents', { replace: true });
    }
  }, [user, isPrimary, navigate, message]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm<{ name: string; phone: string; email?: string }>();
  const [invitedPassword, setInvitedPassword] = useState<string>('');
  const [invitedPhone, setInvitedPhone] = useState<string>('');
  const [pwdModalOpen, setPwdModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['authz', 'vendor', vendorId],
    queryFn: () => vendorApi.get(vendorId),
    select: (res) => res.data.data,
    enabled: isPrimary && vendorId > 0,
  });

  const inviteMutation = useMutation({
    mutationFn: (body: { name: string; phone: string; email?: string }) =>
      vendorApi.inviteMember(vendorId, body),
    onSuccess: (res, vars) => {
      const resp = res.data.data;
      message.success('子账号已创建');
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', vendorId] });
      setInviteOpen(false);
      inviteForm.resetFields();
      setInvitedPassword(resp?.initial_password ?? '');
      setInvitedPhone(vars.phone);
      setPwdModalOpen(true);
    },
    onError: (err: Error) => {
      message.error(err.message || '邀请失败');
    },
  });

  const suspendMutation = useMutation({
    mutationFn: (memberID: number) => vendorApi.suspendMember(vendorId, memberID),
    onSuccess: (_res, memberID) => {
      message.success(`子账号 #${memberID} 已停用`);
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', vendorId] });
    },
    onError: (err: Error) => message.error(err.message || '停用失败'),
  });

  const transferMutation = useMutation({
    mutationFn: (args: { newPrimaryUserID: number; reason?: string }) =>
      vendorApi.transferPrimary(vendorId, args.newPrimaryUserID, args.reason),
    onSuccess: async () => {
      message.success('主账号已转移，权限已同步');
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', vendorId] });
      // 主账号已移交：刷新当前 /auth/me，让 VendorLayout 侧栏立刻缩到三项
      try {
        const u = await authClient.getAuthMe();
        if (u) {
          useAuthStore.setState({ user: u });
          localStorage.setItem('excs-user', JSON.stringify(u));
        }
      } catch {
        // swallow：即便刷新失败，下一次页面进入仍会拉到新状态
      }
    },
    onError: (err: Error) => message.error(err.message || '转移失败'),
  });

  if (!isPrimary) {
    return null; // useEffect 已处理跳转；渲染空态防闪
  }
  if (vendorId === 0) {
    return <Empty description="vendor_id 缺失，无法加载团队成员" />;
  }

  const members = data?.members ?? [];

  const columns: TableColumnsType<VendorMember> = [
    {
      title: '账号',
      dataIndex: 'name',
      key: 'name',
      render: (_, m) => (
        <div>
          <div>
            <strong>{m.name || `user#${m.user_id}`}</strong>{' '}
            {m.is_primary && <Tag color="blue">主账号</Tag>}
            {m.suspended && <Tag color="red">已停用</Tag>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
            user_id={m.user_id}
            {m.phone ? ` · ${m.phone}` : ''}
            {m.email ? ` · ${m.email}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 320,
      render: (_, m) => (
        <Space>
          {!m.is_primary && !m.suspended && (
            <RiskyActionButton
              action="vendor.manage"
              forceRiskLevel="high"
              size="small"
              danger
              onConfirm={async () => {
                await suspendMutation.mutateAsync(m.user_id);
              }}
              confirmTitle="停用子账号"
              confirmContent={`确认停用 ${m.name || `user#${m.user_id}`}？停用后该账号无法登录，已发授权将全部撤销。`}
            >
              停用
            </RiskyActionButton>
          )}
          {!m.is_primary && !m.suspended && (
            <RiskyActionButton
              action="vendor.manage"
              forceRiskLevel="critical"
              size="small"
              onConfirm={async (reason) => {
                await transferMutation.mutateAsync({ newPrimaryUserID: m.user_id, reason });
              }}
              confirmTitle="转移主账号"
              confirmContent={
                <>
                  确认把主账号权力转移给 <Text code>user#{m.user_id}</Text>？
                  <br />
                  转移后您将失去团队成员管理 / 主账号转移能力，但仍可正常使用内容上传。
                </>
              }
            >
              设为主账号
            </RiskyActionButton>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="团队成员"
        description="作为主账号，您可以邀请/停用子账号，也可以将主账号权力转移给团队成员。"
        extra={
          <Button type="primary" onClick={() => setInviteOpen(true)}>
            邀请子账号
          </Button>
        }
      />

      <Card title={`成员（${members.length}）`}>
        <Table
          rowKey="user_id"
          loading={isLoading}
          columns={columns}
          dataSource={members}
          pagination={false}
        />
      </Card>

      <Modal
        title="邀请子账号"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={inviteForm} layout="vertical" onFinish={(values) => inviteMutation.mutate(values)}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, max: 64 }]}>
            <Input placeholder="如 李四" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号（登录用）"
            rules={[
              { required: true, message: '必填' },
              { pattern: /^1\d{10}$/, message: '请输入 11 位大陆手机号' },
            ]}
          >
            <Input placeholder="如 13900139000" />
          </Form.Item>
          <Form.Item name="email" label="邮箱（可选）" rules={[{ type: 'email' }]}>
            <Input placeholder="如 lisi@acme.com" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={inviteMutation.isPending}>
                创建子账号
              </Button>
              <Button onClick={() => setInviteOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <InitialPasswordModal
        open={pwdModalOpen}
        password={invitedPassword}
        phone={invitedPhone}
        onClose={() => setPwdModalOpen(false)}
      />
    </div>
  );
}
