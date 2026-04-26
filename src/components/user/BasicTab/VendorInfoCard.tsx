/**
 * VendorInfoCard —— 基本信息 Tab 右栏第 3 块：vendor 信息（条件渲染）。
 *
 * 仅当 user.account_type === 'vendor' && user.vendor_id != null 时由父组件挂载；
 * 卡片内部再做 vendor 状态兜底（archived / resolver 失败）。
 */
import { useState } from 'react';
import { Alert, Button, Card, Descriptions, Modal, Select, Space, Spin, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SwapOutlined } from '@ant-design/icons';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import ExpiryTag from '@/components/authz/common/ExpiryTag';
import { vendorApi } from '@/api/vendor';
import { useMessage } from '@/hooks/useMessage';
import type { UserDetail } from '@/api/gen/client';

interface Props {
  user: UserDetail;
}

export default function VendorInfoCard({ user }: Props) {
  const vendorId = user.vendor_id!;
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);
  const [nextPrimaryID, setNextPrimaryID] = useState<number | null>(null);
  const [transferReason, setTransferReason] = useState('');

  const { data: vendorDetail, isLoading } = useQuery({
    queryKey: ['vendor', 'detail', vendorId],
    queryFn: () => vendorApi.get(vendorId),
    select: (res) => res.data.data,
    enabled: vendorId > 0,
  });

  const transferMutation = useMutation({
    mutationFn: (payload: { newPrimaryUserID: number; reason?: string }) =>
      vendorApi.transferPrimary(vendorId, payload.newPrimaryUserID, payload.reason),
    onSuccess: () => {
      message.success('主账号已转移');
      queryClient.invalidateQueries({ queryKey: ['vendor', 'detail', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'detail', user.id] });
      setTransferOpen(false);
      setNextPrimaryID(null);
      setTransferReason('');
    },
    onError: (err: Error) => message.error(err.message || '转移失败'),
  });

  if (isLoading) {
    return (
      <Card size="small" title="供应商信息" style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (!vendorDetail || !vendorDetail.vendor) {
    return (
      <Card size="small" title="供应商信息" style={{ marginBottom: 16 }}>
        <Alert
          type="warning"
          showIcon
          message="关联供应商已归档或不可读取"
          description={`vendor_id #${vendorId} 未能解析为有效供应商记录。`}
        />
      </Card>
    );
  }

  const vendor = vendorDetail.vendor;
  const members = vendorDetail.members ?? [];
  const expiresAt = vendor.grant_expires_at;
  const vendorArchived = vendor.status === 'archived';

  const otherMembers = members.filter((m) => m.user_id !== user.id && !m.suspended);

  return (
    <Card
      size="small"
      title={`供应商信息 · ${vendor.name}`}
      extra={<Tag color={vendor.status === 'active' ? 'green' : 'default'}>{vendor.status}</Tag>}
      style={{ marginBottom: 16 }}
    >
      {vendorArchived && (
        <Alert
          type="warning"
          showIcon
          message="该供应商已归档；转移 / 邀请链路已禁用。"
          style={{ marginBottom: 12 }}
        />
      )}

      <Descriptions column={1} size="small" colon={false} labelStyle={{ width: 96 }}>
        <Descriptions.Item label="公司名">
          {vendorArchived ? (
            <span style={{ color: 'var(--ant-color-text-tertiary)' }}>{vendor.name}</span>
          ) : (
            <Link to={`/platform/authz/vendors/${vendor.id}`}>{vendor.name}</Link>
          )}
          <Tag style={{ marginLeft: 8 }}>#{vendor.id}</Tag>
        </Descriptions.Item>

        <Descriptions.Item label="当前身份">
          {user.is_primary ? (
            <Space>
              <Tag color="gold" style={{ borderColor: '#C29023', color: '#C29023' }}>
                ⭐ 主账号
              </Tag>
              <RiskyActionButton
                action="vendor.manage"
                forceRiskLevel="critical"
                size="small"
                type="link"
                icon={<SwapOutlined />}
                confirmTitle="转移主账号"
                confirmContent="转移后本账号变为子账号，新主账号将继承 vendor 管理权限。请输入原因（≥5 字）："
                onConfirm={async (reason) => {
                  // 通过 critical 二次确认后，打开选择 Modal 指定 new primary
                  setTransferReason(reason ?? '');
                  setTransferOpen(true);
                }}
                disabled={vendorArchived}
              >
                转移主账号
              </RiskyActionButton>
            </Space>
          ) : (
            <Space>
              <Tag>子账号</Tag>
              <Tooltip title="仅主账号可转移">
                <Button size="small" type="link" icon={<SwapOutlined />} disabled>
                  转移主账号
                </Button>
              </Tooltip>
            </Space>
          )}
        </Descriptions.Item>

        <Descriptions.Item label="团队成员">
          <Space>
            <span>{members.length} 人</span>
            <Link to={`/platform/authz/vendors/${vendor.id}#members`}>查看名单</Link>
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="公司授权到期">
          <ExpiryTag expiresAt={expiresAt} permanentText="未设置" />
        </Descriptions.Item>

        <Descriptions.Item label="默认展厅范围">
          {vendor.default_hall_scope && vendor.default_hall_scope.length > 0 ? (
            <Space wrap>
              {vendor.default_hall_scope.map((hid) => (
                <Tag key={hid}>展厅 #{hid}</Tag>
              ))}
            </Space>
          ) : (
            <span style={{ color: 'var(--ant-color-text-tertiary)' }}>未设置</span>
          )}
        </Descriptions.Item>
      </Descriptions>

      <Modal
        title="选择新的主账号"
        open={transferOpen}
        onCancel={() => {
          setTransferOpen(false);
          setNextPrimaryID(null);
        }}
        onOk={() => {
          if (!nextPrimaryID) {
            message.warning('请选择一个子账号作为新主账号');
            return;
          }
          transferMutation.mutate({ newPrimaryUserID: nextPrimaryID, reason: transferReason });
        }}
        okText="确认转移"
        okButtonProps={{ loading: transferMutation.isPending, danger: true }}
      >
        <p>
          从下列子账号中选择新的主账号；转移后本账号（#{user.id}）变为子账号。
        </p>
        <Select
          style={{ width: '100%' }}
          placeholder="选择新主账号"
          value={nextPrimaryID ?? undefined}
          onChange={(v) => setNextPrimaryID(v as number)}
          options={otherMembers.map((m) => ({
            value: m.user_id,
            label: `${m.name}（#${m.user_id}${m.phone ? ` · ${m.phone}` : ''}）`,
          }))}
          disabled={otherMembers.length === 0}
          notFoundContent="无可用子账号（可先到 vendor 详情页邀请）"
        />
      </Modal>
    </Card>
  );
}
