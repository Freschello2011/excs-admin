/**
 * UserProfileCard —— 基本信息 Tab 左栏画像卡（PRD §8.8 v1.2，P1.3 重构）。
 *
 * 职责：summary 只读展示 + footer 跳转链接。
 *
 * 重构（2026-04-25）：
 *   - 字段排版套 FieldRow 范式：短中文标题（≤ 6 字）+ ⓘ Tooltip 解释 + 控件灰字
 *   - 「+ 授权」按钮移除 —— 授权入口统一收敛到「权限」Tab 与列表行操作
 *   - 保留：「查看『权限』Tab」次级链接 + 「在 SSO 编辑资料」外链
 */
import { Alert, Avatar, Button, Card, Descriptions, Space, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined, KeyOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import AccountTypeTag from '@/components/authz/common/AccountTypeTag';
import { resolveAccountType, type UserDetail } from '@/types/auth';

interface Props {
  user: UserDetail;
  isSelf: boolean;
  /** 切到「权限」Tab；由 BasicTab → UserDetailPage 注入 */
  onSwitchTab: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: '活跃', color: 'green' },
  suspended: { label: '已停用', color: 'default' },
  archived: { label: '已归档', color: 'red' },
  inactive: { label: '未激活', color: 'default' },
  disabled: { label: '已禁用', color: 'default' },
};

/** 短标题 + ⓘ Tooltip —— 与 sys-config FieldRow 范式视觉对齐 */
function LabelWithHint({ label, hint }: { label: string; hint?: string }) {
  return (
    <Space size={4}>
      <span>{label}</span>
      {hint && (
        <Tooltip title={hint}>
          <InfoCircleOutlined
            style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}
          />
        </Tooltip>
      )}
    </Space>
  );
}

export default function UserProfileCard({ user, isSelf, onSwitchTab }: Props) {
  const accountType = resolveAccountType({
    account_type: user.account_type,
    user_type: user.user_type as 'employee' | 'supplier',
  });
  const statusMeta = STATUS_LABELS[user.status] ?? { label: user.status, color: 'default' };

  return (
    <Card>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Avatar size={80} src={user.avatar} icon={<UserOutlined />} />
        <h3 style={{ marginTop: 12, marginBottom: 8 }}>{user.name}</h3>
        <Space size={4} wrap style={{ justifyContent: 'center' }}>
          <AccountTypeTag accountType={accountType} />
          <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
          {accountType === 'vendor' && user.is_primary && (
            <Tag color="gold" style={{ borderColor: '#C29023', color: '#C29023' }}>
              ⭐ 主账号
            </Tag>
          )}
          {isSelf && <Tag color="warning">⚠ 这是你自己</Tag>}
        </Space>
      </div>

      {user.must_change_pwd && (
        <Alert
          type="warning"
          showIcon
          message="首登需改密"
          description="该用户尚未修改初始密码；登录后将强制弹出改密流程。"
          style={{ marginBottom: 16 }}
        />
      )}

      <Descriptions
        column={1}
        size="small"
        colon={false}
        labelStyle={{ width: 96, color: 'var(--ant-color-text-secondary)' }}
      >
        <Descriptions.Item label={<LabelWithHint label="邮箱" hint="SSO 同步字段；如需修改请去 SSO 后台" />}>
          {user.email || <span style={{ color: 'var(--ant-color-text-tertiary)' }}>-</span>}
        </Descriptions.Item>
        <Descriptions.Item label={<LabelWithHint label="手机" hint="SSO 注册手机号 + 短信登录用" />}>
          {user.phone || <span style={{ color: 'var(--ant-color-text-tertiary)' }}>-</span>}
        </Descriptions.Item>
        <Descriptions.Item label={<LabelWithHint label="SSO ID" hint="单点登录系统中的用户主键" />}>
          <span style={{ fontFamily: 'monospace' }}>#{user.sso_user_id}</span>
        </Descriptions.Item>
        <Descriptions.Item label={<LabelWithHint label="ExCS ID" hint="本系统数据库主键 / Grant 关联键" />}>
          <span style={{ fontFamily: 'monospace' }}>#{user.id}</span>
        </Descriptions.Item>
        <Descriptions.Item label={<LabelWithHint label="创建时间" hint="导入到 ExCS 的时间，非 SSO 注册时间" />}>
          {dayjs(user.created_at).format('YYYY-MM-DD HH:mm')}
        </Descriptions.Item>
        <Descriptions.Item label={<LabelWithHint label="创建者" hint="谁导入了这个账号；从审计日志反查（可空）" />}>
          {user.created_by ? (
            <span style={{ fontFamily: 'monospace' }}>#{user.created_by}</span>
          ) : (
            <span style={{ color: 'var(--ant-color-text-tertiary)' }}>-</span>
          )}
        </Descriptions.Item>
        <Descriptions.Item label={<LabelWithHint label="最近登录" hint="最近一次成功登录 ExCS 的时间" />}>
          {user.last_login_at ? (
            dayjs(user.last_login_at).format('YYYY-MM-DD HH:mm')
          ) : (
            <span style={{ color: 'var(--ant-color-text-tertiary)' }}>从未登录</span>
          )}
        </Descriptions.Item>
      </Descriptions>

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--ant-color-border-secondary)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Button type="primary" icon={<KeyOutlined />} onClick={onSwitchTab}>
          查看「权限」Tab
        </Button>
        <Tooltip title="跳转到 SSO 后台修改姓名 / 手机 / 邮箱 / 头像（ExCS 不持有写权）">
          <Button
            icon={<SettingOutlined />}
            onClick={() => {
              // SSO 后台外链未配置时仅提示，后续由 deploy-guide 配 SSO admin URL
              window.open('about:blank', '_blank', 'noopener');
            }}
          >
            在 SSO 编辑资料
          </Button>
        </Tooltip>
      </div>
    </Card>
  );
}
