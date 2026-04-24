/**
 * UserProfileCard —— 基本信息 Tab 左栏画像卡（PRD §8.8.2 / §8.8.3）。
 *
 * 职责：summary 只读展示 + 下方 footer 三个快捷操作（+授权 / 切权限 Tab / SSO 外链）。
 * vendor 信息单独走 VendorInfoCard（条件渲染），不塞在这里。
 */
import { Alert, Avatar, Button, Card, Descriptions, Space, Tag, Tooltip } from 'antd';
import { KeyOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import Can from '@/components/authz/Can';
import { resolveAccountType, type UserDetail } from '@/types/auth';

interface Props {
  user: UserDetail;
  isSelf: boolean;
  onSwitchTab: () => void;
  onGrantWizard: () => void;
}

const ACCOUNT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  internal: { label: '内部员工', color: 'blue' },
  vendor: { label: '供应商', color: 'orange' },
  customer: { label: '客户', color: 'purple' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: '活跃', color: 'green' },
  suspended: { label: '已停用', color: 'default' },
  archived: { label: '已归档', color: 'red' },
  inactive: { label: '未激活', color: 'default' },
  disabled: { label: '已禁用', color: 'default' },
};

export default function UserProfileCard({ user, isSelf, onSwitchTab, onGrantWizard }: Props) {
  const accountType = resolveAccountType({
    account_type: user.account_type,
    user_type: user.user_type as 'employee' | 'supplier',
  });
  const accountMeta = ACCOUNT_TYPE_LABELS[accountType] ?? {
    label: accountType,
    color: 'default',
  };
  const statusMeta = STATUS_LABELS[user.status] ?? { label: user.status, color: 'default' };

  return (
    <Card>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Avatar size={80} src={user.avatar} icon={<UserOutlined />} />
        <h3 style={{ marginTop: 12, marginBottom: 8 }}>{user.name}</h3>
        <Space size={4} wrap style={{ justifyContent: 'center' }}>
          <Tag color={accountMeta.color}>{accountMeta.label}</Tag>
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

      <Descriptions column={1} size="small" colon={false} labelStyle={{ width: 80 }}>
        <Descriptions.Item label="邮箱">{user.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="手机">{user.phone || '-'}</Descriptions.Item>
        <Descriptions.Item label="SSO ID">#{user.sso_user_id}</Descriptions.Item>
        <Descriptions.Item label="ExCS ID">#{user.id}</Descriptions.Item>
        <Descriptions.Item label="创建时间">
          {dayjs(user.created_at).format('YYYY-MM-DD HH:mm')}
        </Descriptions.Item>
        <Descriptions.Item label="创建者">
          {user.created_by ? `#${user.created_by}` : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="最近登录">
          {user.last_login_at ? dayjs(user.last_login_at).format('YYYY-MM-DD HH:mm') : '从未登录'}
        </Descriptions.Item>
      </Descriptions>

      <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {isSelf ? (
          <Tooltip title="不能对自己操作">
            <Button type="primary" icon={<KeyOutlined />} disabled>
              + 授权
            </Button>
          </Tooltip>
        ) : (
          <Can action="user.grant">
            <Button type="primary" icon={<KeyOutlined />} onClick={onGrantWizard}>
              + 授权
            </Button>
          </Can>
        )}
        <Button onClick={onSwitchTab}>查看「权限」Tab</Button>
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
