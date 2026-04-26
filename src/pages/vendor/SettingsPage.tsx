/**
 * 供应商「设置」页 —— Phase 9 / steps §9.6。
 *
 * 策略（轻量）：
 *   - 只读展示账号基本信息（姓名 / 手机 / 邮箱 / 公司 / 角色），这些字段的修改权威在
 *     SSO；本页提供跳转按钮引导到 SSO 个人中心，避免在 ExCS 重复实现验证码流程。
 *   - 改密码同理：跳 SSO /user/change-password。
 *   - "通知偏好" 预留一个分类开关骨架，后端 API 到位前只是 UI 占位。
 */
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Space, Switch, Typography } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { useAuthStore } from '@/stores/authStore';
// OpenAPI Phase 1：从 yaml 生成的 typed client；改 yaml 字段名 IDE 立即抓到不一致。
import { authClient, type LoginUser } from '@/api/gen/client';

const { Text } = Typography;

const SSO_PROFILE_URL = 'https://sso.crossovercg.com.cn/user/profile';
const SSO_CHANGE_PASSWORD_URL = 'https://sso.crossovercg.com.cn/user/change-password';

export default function SettingsPage() {
  const stored = useAuthStore((s) => s.user);
  // Pilot：进入页面时主动拉一次 /auth/me（typed），让本页拿到的字段走的是 yaml 契约。
  // store 里 user 是登录瞬间的快照，可能落后；典型场景如主账号刚被移交。
  const [user, setUser] = useState<LoginUser | null>(stored);
  useEffect(() => {
    authClient
      .getAuthMe()
      .then((u) => setUser(u))
      .catch(() => {
        /* axios 拦截器已 emitError，本页继续用 store 兜底 */
      });
  }, []);

  return (
    <div>
      <PageHeader
        title="账号设置"
        description="姓名 / 手机 / 邮箱等在 SSO 统一管理；点击下方按钮跳转 SSO 个人中心修改。"
      />

      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={1}>
          <Descriptions.Item label="姓名">{user?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="手机">
            {user?.phone || '-'}
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              （登录账号，修改需走 SSO 验证码）
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="邮箱">{user?.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="所属供应商">
            {user?.vendor_name || '-'}
            {user?.vendor_id && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                vendor_id={user.vendor_id}
              </Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="角色">
            {user?.is_primary ? '主账号（可管理团队成员）' : '子账号'}
          </Descriptions.Item>
        </Descriptions>
        <Space style={{ marginTop: 12 }}>
          <Button type="primary" onClick={() => window.open(SSO_PROFILE_URL, '_blank', 'noopener')}>
            前往 SSO 个人中心
          </Button>
          <Button onClick={() => window.open(SSO_CHANGE_PASSWORD_URL, '_blank', 'noopener')}>
            修改密码
          </Button>
        </Space>
      </Card>

      <Card title="通知偏好">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="通知偏好 v1 仅本地生效；Phase 10/11 会接入服务端 user_settings 表持久化。"
        />
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>授权到期提醒</div>
              <Text type="secondary" style={{ fontSize: 12 }}>在 7 / 3 / 1 天到期前收到站内消息</Text>
            </div>
            <Switch defaultChecked disabled />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>团队成员变更</div>
              <Text type="secondary" style={{ fontSize: 12 }}>主账号转移 / 子账号状态变化时通知</Text>
            </div>
            <Switch defaultChecked disabled />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>内容审核结果</div>
              <Text type="secondary" style={{ fontSize: 12 }}>（Phase 10 启用）内容驳回/通过时通知</Text>
            </div>
            <Switch defaultChecked disabled />
          </div>
        </Space>
      </Card>
    </div>
  );
}
