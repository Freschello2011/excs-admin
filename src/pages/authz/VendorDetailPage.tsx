import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  DatePicker,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import Can from '@/components/authz/Can';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { vendorApi } from '@/api/vendor';
import type { VendorMember, VendorStatus } from '@/types/authz';

const { Text, Paragraph } = Typography;

const STATUS_META: Record<VendorStatus, { label: string; color: string }> = {
  active: { label: '启用', color: 'green' },
  suspended: { label: '已停用', color: 'red' },
  archived: { label: '已归档', color: 'default' },
};

export default function VendorDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const { message } = useMessage();
  const qc = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm<{ name: string; phone: string; email?: string }>();
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendValue, setExtendValue] = useState<Dayjs | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['authz', 'vendor', id],
    queryFn: () => vendorApi.get(id),
    select: (res) => res.data.data,
    enabled: Number.isFinite(id),
  });

  const inviteMutation = useMutation({
    mutationFn: (body: { name: string; phone: string; email?: string }) => vendorApi.inviteMember(id, body),
    onSuccess: () => {
      message.success('子账号已创建，邀请链接已生成');
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', id] });
      setInviteOpen(false);
      inviteForm.resetFields();
    },
    onError: (err: Error) => {
      message.error(err.message || '邀请失败');
    },
  });

  const suspendMemberMutation = useMutation({
    mutationFn: (memberID: number) => vendorApi.suspendMember(id, memberID),
    onSuccess: (_res, memberID) => {
      message.success(`子账号 #${memberID} 已停用，相关授权已撤销`);
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', id] });
    },
    onError: (err: Error) => {
      message.error(err.message || '停用失败');
    },
  });

  const extendMutation = useMutation({
    mutationFn: (newExpires: string) => vendorApi.extend(id, newExpires),
    onSuccess: () => {
      message.success('授权期已延长，子账号 Grant 已批量同步');
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', id] });
      setExtendOpen(false);
      setExtendValue(null);
    },
    onError: (err: Error) => {
      message.error(err.message || '延期失败');
    },
  });

  const suspendVendorMutation = useMutation({
    mutationFn: (reason?: string) => vendorApi.suspend(id, reason),
    onSuccess: () => {
      message.success('供应商已停用，所有子账号登录将被拒');
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', id] });
    },
    onError: (err: Error) => {
      message.error(err.message || '停用失败');
    },
  });

  const transferMutation = useMutation({
    mutationFn: (args: { newPrimaryUserID: number; reason?: string }) =>
      vendorApi.transferPrimary(id, args.newPrimaryUserID, args.reason),
    onSuccess: () => {
      message.success('主账号已转移');
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', id] });
    },
    onError: (err: Error) => {
      message.error(err.message || '转移失败');
    },
  });

  if (!Number.isFinite(id)) {
    return <Paragraph>无效的 vendor_id</Paragraph>;
  }
  if (isLoading) {
    return <Paragraph>加载中…</Paragraph>;
  }
  if (!data) {
    return <Paragraph>未找到供应商</Paragraph>;
  }

  const { vendor, members } = data;
  const statusMeta = STATUS_META[vendor.status] ?? { label: vendor.status, color: 'default' };

  const memberColumns: TableColumnsType<VendorMember> = [
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
          <div style={{ fontSize: 12, color: '#999' }}>
            user_id={m.user_id}
            {m.phone ? ` · ${m.phone}` : ''}
            {m.email ? ` · ${m.email}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: '权限',
      key: 'authz',
      width: 160,
      render: (_, m) => (
        <Button
          size="small"
          onClick={() => navigate(`/platform/users/${m.user_id}?tab=authz`)}
        >
          查看授权
        </Button>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 320,
      render: (_, m) => (
        <Space>
          {!m.is_primary && !m.suspended && (
            <Can action="vendor.manage" mode="hide">
              <RiskyActionButton
                action="vendor.manage"
                forceRiskLevel="high"
                size="small"
                danger
                onConfirm={async () => {
                  await suspendMemberMutation.mutateAsync(m.user_id);
                }}
                confirmTitle="停用子账号"
                confirmContent={`确认停用 ${m.name || `user#${m.user_id}`}？该账号的全部 active 授权将立即被撤销。`}
              >
                停用
              </RiskyActionButton>
            </Can>
          )}
          {!m.is_primary && !m.suspended && (
            <Can action="vendor.manage" mode="hide">
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
                    确认把主账号权力从 <Text code>user#{vendor.primary_user_id}</Text> 转移到{' '}
                    <Text code>user#{m.user_id}</Text>？此操作会写入审计。
                  </>
                }
              >
                设为主账号
              </RiskyActionButton>
            </Can>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={vendor.name}
        extra={
          <Space>
            <Button onClick={() => navigate('/platform/authz/vendors')}>返回列表</Button>
            <Can action="vendor.manage" mode="hide">
              <Button onClick={() => setExtendOpen(true)}>延期授权</Button>
            </Can>
            {vendor.status === 'active' && (
              <Can action="vendor.manage" mode="hide">
                <RiskyActionButton
                  action="vendor.manage"
                  forceRiskLevel="critical"
                  danger
                  onConfirm={async (reason) => {
                    await suspendVendorMutation.mutateAsync(reason);
                  }}
                  confirmTitle="停用整个供应商"
                  confirmContent={
                    <>
                      停用后 <strong>{vendor.name}</strong> 下所有账号登录将被 SSO 拒绝。
                      已上传的内容保留可见；恢复需走恢复流程（Phase 9 上线）。
                    </>
                  }
                >
                  停用供应商
                </RiskyActionButton>
              </Can>
            )}
          </Space>
        }
      />

      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="代码">{vendor.code}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="主账号 user_id">{vendor.primary_user_id}</Descriptions.Item>
          <Descriptions.Item label="租户 id">{vendor.tenant_id}</Descriptions.Item>
          <Descriptions.Item label="联系人">{vendor.contact_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="联系电话">{vendor.contact_phone || '-'}</Descriptions.Item>
          <Descriptions.Item label="联系邮箱">{vendor.contact_email || '-'}</Descriptions.Item>
          <Descriptions.Item label="授权到期">
            <Tooltip title={dayjs(vendor.grant_expires_at).format('YYYY-MM-DD HH:mm:ss')}>
              <span>
                {dayjs(vendor.grant_expires_at).format('YYYY-MM-DD')}（剩{' '}
                {Math.max(0, dayjs(vendor.grant_expires_at).diff(dayjs(), 'day'))} 天）
              </span>
            </Tooltip>
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {vendor.notes || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={`团队成员（${members.length}）`}
        extra={
          <Can action="vendor.manage" mode="hide">
            <Button type="primary" onClick={() => setInviteOpen(true)}>
              邀请子账号
            </Button>
          </Can>
        }
      >
        <Table
          rowKey="user_id"
          columns={memberColumns}
          dataSource={members}
          pagination={false}
        />
      </Card>

      {/* 邀请子账号 Modal */}
      <Modal
        title="邀请子账号"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={inviteForm}
          layout="vertical"
          onFinish={(values) => inviteMutation.mutate(values)}
        >
          <Form.Item name="name" label="姓名" rules={[{ required: true, max: 64 }]}>
            <Input placeholder="如 李四" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
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
                生成邀请
              </Button>
              <Button onClick={() => setInviteOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 延期 Modal */}
      <Modal
        title="延长授权期"
        open={extendOpen}
        onOk={() => {
          if (!extendValue) {
            message.warning('请选择新的到期日期');
            return;
          }
          extendMutation.mutate(extendValue.endOf('day').toISOString());
        }}
        onCancel={() => setExtendOpen(false)}
        confirmLoading={extendMutation.isPending}
        okText="延长"
        cancelText="取消"
      >
        <Paragraph type="secondary">
          延长后本 vendor 下所有子账号的 active Grant 会同步延长到新日期。
        </Paragraph>
        <DatePicker
          value={extendValue}
          onChange={setExtendValue}
          style={{ width: '100%' }}
          disabledDate={(d) => d.isBefore(dayjs(), 'day')}
          placeholder="选择新的到期日"
        />
      </Modal>
    </div>
  );
}
