/**
 * VendorDetailPage —— P2.5/2.6/2.8 重构（2026-04-25）。
 *
 * 视觉/IA 变化：
 *   - antd <Tabs> → PillTabs（与全站对齐）
 *   - 拆 3 Tab：基本信息 / 团队成员 / 上传内容（占位 Phase 12）
 *   - 「基本信息」 Tab 增主账号摘要卡：姓名/邮箱/手机/user_id 链接到 /platform/authz/users/:id?tab=authz +
 *     团队成员数 Statistic
 *   - vendor 级操作（延期 / 停用 / 编辑默认范围）顶栏；member 级（邀请 / 转移 / 停用）团队 Tab 内
 *   - 各处过期 ExpiryTag 化
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  IdcardOutlined,
  MailOutlined,
  PhoneOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';
import { useMessage } from '@/hooks/useMessage';
import Can from '@/components/authz/Can';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import InitialPasswordModal from '@/components/authz/InitialPasswordModal';
import ExpiryTag from '@/components/authz/common/ExpiryTag';
import { vendorApi } from '@/api/vendor';
import { hallApi } from '@/api/hall';
import type { VendorMember, VendorStatus } from '@/types/authz';

const { Text, Paragraph } = Typography;

type TabKey = 'basic' | 'members' | 'contents';

const TABS: PillTab<TabKey>[] = [
  { key: 'basic', label: '基本信息', icon: <IdcardOutlined /> },
  { key: 'members', label: '团队成员', icon: <TeamOutlined /> },
  { key: 'contents', label: '上传内容', icon: <UploadOutlined /> },
];

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

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<TabKey>(() => {
    const t = searchParams.get('tab');
    return TABS.some((x) => x.key === t) ? (t as TabKey) : 'basic';
  }, [searchParams]);
  const setActiveTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'basic') next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm<{ name: string; phone: string; email?: string }>();
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendValue, setExtendValue] = useState<Dayjs | null>(null);
  // Phase 9：邀请成功后一次性展示 SSO 初始密码
  const [invitedPassword, setInvitedPassword] = useState<string>('');
  const [invitedPhone, setInvitedPhone] = useState<string>('');
  const [pwdModalOpen, setPwdModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['authz', 'vendor', id],
    queryFn: () => vendorApi.get(id),
    select: (res) => res.data.data,
    enabled: Number.isFinite(id),
  });

  const inviteMutation = useMutation({
    mutationFn: (body: { name: string; phone: string; email?: string }) => vendorApi.inviteMember(id, body),
    onSuccess: (res, vars) => {
      const resp = res.data.data;
      message.success('子账号已创建');
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', id] });
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

  // Phase 10：默认归属展厅编辑
  const { data: allHalls = [] } = useQuery({
    queryKey: ['halls', { all: true }],
    queryFn: () => hallApi.getHalls({}),
    select: (res) => res.data.data?.list ?? [],
  });
  const [scopeEditing, setScopeEditing] = useState(false);
  const [scopeValue, setScopeValue] = useState<number[]>([]);
  const updateVendorMutation = useMutation({
    mutationFn: (body: { default_hall_scope: number[] }) => vendorApi.update(id, body),
    onSuccess: () => {
      message.success('默认归属展厅已保存');
      qc.invalidateQueries({ queryKey: ['authz', 'vendor', id] });
      setScopeEditing(false);
    },
    onError: (err: Error) => message.error(err.message || '保存失败'),
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

  const primaryMember = members.find((m) => m.is_primary);

  const memberColumns: TableColumnsType<VendorMember> = [
    {
      title: '账号',
      dataIndex: 'name',
      key: 'name',
      render: (_, m) => (
        <div>
          <div>
            <Link to={`/platform/authz/users/${m.user_id}?tab=authz`}>
              <strong>{m.name || `user#${m.user_id}`}</strong>
            </Link>{' '}
            {m.is_primary && <Tag color="gold" style={{ borderColor: '#C29023', color: '#C29023' }}>⭐ 主账号</Tag>}
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
          onClick={() => navigate(`/platform/authz/users/${m.user_id}?tab=authz`)}
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

  /* ============== 渲染 ============== */

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

      <PillTabs
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="供应商详情 tab"
      />

      <div style={{ marginTop: 16 }}>
        {activeTab === 'basic' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card title="供应商信息" size="small">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="代码">{vendor.code}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="租户 id">{vendor.tenant_id}</Descriptions.Item>
                <Descriptions.Item label="授权到期">
                  <ExpiryTag expiresAt={vendor.grant_expires_at} variant="full" />
                </Descriptions.Item>
                <Descriptions.Item label="备注">{vendor.notes || '-'}</Descriptions.Item>
              </Descriptions>

              {/* 默认归属展厅（编辑入口） */}
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: '1px solid var(--ant-color-border-secondary)',
                }}
              >
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary">默认归属展厅</Text>
                </div>
                {scopeEditing ? (
                  <Space wrap>
                    <Select
                      mode="multiple"
                      value={scopeValue}
                      onChange={setScopeValue}
                      options={allHalls.map((h: { id: number; name: string }) => ({
                        value: h.id,
                        label: h.name,
                      }))}
                      style={{ minWidth: 320 }}
                      placeholder="选一个或多个展厅（可留空=总库可见）"
                    />
                    <Button
                      type="primary"
                      loading={updateVendorMutation.isPending}
                      onClick={() => updateVendorMutation.mutate({ default_hall_scope: scopeValue })}
                    >
                      保存
                    </Button>
                    <Button onClick={() => setScopeEditing(false)}>取消</Button>
                  </Space>
                ) : (
                  <Space wrap>
                    {vendor.default_hall_scope && vendor.default_hall_scope.length > 0 ? (
                      vendor.default_hall_scope.map((hid) => {
                        const h = allHalls.find((x: { id: number; name: string }) => x.id === hid);
                        return <Tag key={hid}>{h?.name ?? `hall#${hid}`}</Tag>;
                      })
                    ) : (
                      <Text type="secondary">未设置（总库所有展厅均可见）</Text>
                    )}
                    <Can action="vendor.manage" mode="hide">
                      <Button
                        size="small"
                        onClick={() => {
                          setScopeValue(vendor.default_hall_scope ?? []);
                          setScopeEditing(true);
                        }}
                      >
                        编辑
                      </Button>
                    </Can>
                  </Space>
                )}
              </div>
            </Card>

            <Card
              title={
                <Space>
                  <span>主账号</span>
                  {primaryMember && (
                    <Tag color="gold" style={{ borderColor: '#C29023', color: '#C29023' }}>
                      ⭐ {primaryMember.name || `user#${primaryMember.user_id}`}
                    </Tag>
                  )}
                </Space>
              }
              size="small"
              extra={
                primaryMember && (
                  <Link to={`/platform/authz/users/${primaryMember.user_id}?tab=authz`}>
                    查看权限 →
                  </Link>
                )
              }
            >
              {primaryMember ? (
                <>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="姓名">
                      {primaryMember.name || <Text type="secondary">（未填）</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label={<><MailOutlined /> 邮箱</>}>
                      {primaryMember.email || vendor.contact_email || <Text type="secondary">-</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label={<><PhoneOutlined /> 手机</>}>
                      {primaryMember.phone || vendor.contact_phone || <Text type="secondary">-</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label="user_id">
                      <Link to={`/platform/authz/users/${primaryMember.user_id}`}>
                        <Text code>#{primaryMember.user_id}</Text>
                      </Link>
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">
                      {primaryMember.suspended ? (
                        <Tag color="red">已停用</Tag>
                      ) : (
                        <Tag color="green">活跃</Tag>
                      )}
                    </Descriptions.Item>
                  </Descriptions>

                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 12,
                      borderTop: '1px solid var(--ant-color-border-secondary)',
                      display: 'flex',
                      gap: 24,
                    }}
                  >
                    <Statistic
                      title="团队成员"
                      value={members.length}
                      suffix="人"
                      valueStyle={{ fontSize: 20 }}
                    />
                    <Statistic
                      title="子账号（不含主账号）"
                      value={members.filter((m) => !m.is_primary).length}
                      suffix="人"
                      valueStyle={{ fontSize: 20 }}
                    />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Button size="small" onClick={() => setActiveTab('members')}>
                      查看「团队成员」Tab →
                    </Button>
                  </div>
                </>
              ) : (
                <Empty description="未找到主账号信息" />
              )}
            </Card>
          </div>
        )}

        {activeTab === 'members' && (
          <Card
            title={`团队成员（${members.length}）`}
            size="small"
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
        )}

        {activeTab === 'contents' && (
          <Card size="small">
            <Result
              status="info"
              icon={<UploadOutlined style={{ color: 'var(--ant-color-primary)' }} />}
              title="上传内容浏览（Phase 12 计划）"
              subTitle={
                <span>
                  本 Tab 将展示该供应商上传的全部内容（按状态分组：待接收 / 已绑定 / 已驳回 / 已撤回 / 已归档）。
                  <br />
                  当前可在 <Link to="/contents?vendor_id={id}">内容总库</Link> 按 vendor_id 过滤查看（手动）。
                </span>
              }
            />
          </Card>
        )}
      </div>

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

      {/* Phase 9：邀请成功后一次性展示子账号 SSO 初始密码 */}
      <InitialPasswordModal
        open={pwdModalOpen}
        password={invitedPassword}
        phone={invitedPhone}
        onClose={() => setPwdModalOpen(false)}
      />

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
