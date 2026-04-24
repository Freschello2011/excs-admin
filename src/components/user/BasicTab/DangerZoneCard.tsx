/**
 * DangerZoneCard —— 基本信息 Tab 右栏最后一块：停用 / 软删入口（PRD §8.8.7）。
 *
 * 职责：
 *   - 停用（high）：普通 Modal 确认，不走 RiskyActionButton 的 critical 分支；
 *     archived → active 的恢复也走此按钮（根据当前 status 切标签）。
 *   - 软删（critical）：RiskyActionButton forceRiskLevel='critical'，强制原因 ≥ 5 字。
 *   - isSelf=true：全部 disabled + 顶部 Alert 提示防自锁。
 *   - vendor 主账号额外提醒：先转移再停用 / 删除。
 */
import { Alert, Button, Card, Input, Modal, Space, Tooltip } from 'antd';
import { DeleteOutlined, PoweroffOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import Can from '@/components/authz/Can';
import { userApi } from '@/api/user';
import { useMessage } from '@/hooks/useMessage';
import type { UserDetail } from '@/types/auth';

interface Props {
  user: UserDetail;
  isSelf: boolean;
  onSuccess: () => void;
}

export default function DangerZoneCard({ user, isSelf, onSuccess }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const isVendorPrimary = user.account_type === 'vendor' && user.is_primary;
  const isArchived = user.status === 'archived';
  const isSuspended = user.status === 'suspended';
  const canOperate = !isSelf && !isArchived;

  const patchMutation = useMutation({
    mutationFn: (body: { status: 'active' | 'suspended'; reason?: string }) =>
      userApi.patchStatus(user.id, body),
    onSuccess: () => {
      message.success('操作成功');
      queryClient.invalidateQueries({ queryKey: ['user', 'detail', user.id] });
      queryClient.invalidateQueries({ queryKey: ['authz', 'user-view', user.id] });
      setSuspendOpen(false);
      setSuspendReason('');
      onSuccess();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
      const code = axiosErr.response?.data?.error;
      if (code === 'self_op_forbidden') {
        message.error('不能对自己执行该操作');
      } else if (code === 'last_super_admin_protected') {
        message.error('不能停用最后一个超级管理员');
      } else {
        message.error(axiosErr.response?.data?.message || axiosErr.message || '操作失败');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (reason: string) => userApi.deleteUser(user.id, { reason }),
    onSuccess: () => {
      message.success('用户已归档');
      queryClient.invalidateQueries({ queryKey: ['user', 'detail', user.id] });
      queryClient.invalidateQueries({ queryKey: ['authz', 'user-view', user.id] });
      onSuccess();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
      const code = axiosErr.response?.data?.error;
      if (code === 'self_op_forbidden') {
        message.error('不能对自己执行该操作');
      } else if (code === 'last_super_admin_protected') {
        message.error('不能删除最后一个超级管理员');
      } else {
        message.error(axiosErr.response?.data?.message || axiosErr.message || '删除失败');
      }
    },
  });

  return (
    <Card
      size="small"
      title="危险区"
      style={{
        marginBottom: 16,
        borderColor: 'var(--ant-color-error)',
      }}
      styles={{
        header: {
          background: 'var(--ant-color-error-bg)',
          color: 'var(--ant-color-error)',
        },
      }}
    >
      {isSelf && (
        <Alert
          type="error"
          showIcon
          message="不可对自己操作"
          description="防自锁约束：本账号的停用 / 删除 / 自授权按钮均被禁用。"
          style={{ marginBottom: 12 }}
        />
      )}

      {!isSelf && isVendorPrimary && (
        <Alert
          type="warning"
          showIcon
          message="该账号是供应商主账号"
          description="停用 / 删除前请先转移主账号（见上方「供应商信息」卡片）；否则 vendor 管理功能将无可用主账号。"
          style={{ marginBottom: 12 }}
        />
      )}

      {isArchived && (
        <Alert
          type="info"
          showIcon
          message="该用户已归档"
          description="archived 不可在前台恢复；如需恢复请联系运维 / DBA。"
          style={{ marginBottom: 12 }}
        />
      )}

      <Space wrap>
        {isSuspended ? (
          <Can action="user.manage">
            <Tooltip title={canOperate ? '恢复账号至 active' : '已归档账号不可恢复'}>
              <Button
                icon={<PoweroffOutlined />}
                loading={patchMutation.isPending}
                disabled={!canOperate}
                onClick={() =>
                  Modal.confirm({
                    title: '恢复账号',
                    content: `确认把 ${user.name} 恢复为活跃状态？`,
                    okText: '恢复',
                    onOk: () => patchMutation.mutateAsync({ status: 'active' }),
                  })
                }
              >
                恢复账号
              </Button>
            </Tooltip>
          </Can>
        ) : (
          <Can action="user.manage">
            <Tooltip title={isSelf ? '不能对自己操作' : '停用后无法登录；可在此页面恢复'}>
              <Button
                danger
                icon={<PoweroffOutlined />}
                disabled={!canOperate}
                onClick={() => setSuspendOpen(true)}
              >
                停用账号
              </Button>
            </Tooltip>
          </Can>
        )}

        <Can action="user.manage">
          <Tooltip title={isSelf ? '不能对自己操作' : '软删：状态 → archived，不物理删除'}>
            <span>
              <RiskyActionButton
                action="user.manage"
                forceRiskLevel="critical"
                danger
                icon={<DeleteOutlined />}
                disabled={!canOperate}
                confirmTitle="删除账号（软删）"
                confirmContent="此操作将把账号置为 archived。不物理删除 / 不级联撤销 Grant / 不联动 SSO；前台不可恢复。请输入原因（≥5 字）："
                onConfirm={async (reason) => {
                  if (!reason) return;
                  await deleteMutation.mutateAsync(reason);
                }}
              >
                删除账号
              </RiskyActionButton>
            </span>
          </Tooltip>
        </Can>
      </Space>

      {/* 停用确认（high 风险，普通 Modal） */}
      <Modal
        title="停用账号"
        open={suspendOpen}
        onCancel={() => {
          setSuspendOpen(false);
          setSuspendReason('');
        }}
        onOk={() =>
          patchMutation.mutate({ status: 'suspended', reason: suspendReason || undefined })
        }
        okText="确认停用"
        okButtonProps={{ danger: true, loading: patchMutation.isPending }}
      >
        <p>
          停用后 {user.name}（#{user.id}）将立即无法登录；可在本页面随时恢复。
        </p>
        <Input.TextArea
          rows={3}
          placeholder="操作原因（选填，≤500 字）"
          value={suspendReason}
          maxLength={500}
          onChange={(e) => setSuspendReason(e.target.value)}
        />
      </Modal>
    </Card>
  );
}
