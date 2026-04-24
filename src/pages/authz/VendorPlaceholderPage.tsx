import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/**
 * 供应商专属 UI 占位页（Phase 8 版）。
 *
 * Phase 8 完成：SSO 侧 account_type='vendor' + ExCS 创建供应商的全链路；
 * Phase 9 规划：在此路径下建完整的「我的内容 / 团队成员 / 消息 / 设置」导航，
 * 暂时用这个占位页让 vendor 账号登录后有"落地页"，防止跳 /dashboard 报 403。
 */
export default function VendorPlaceholderPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div style={{ padding: 32 }}>
      <Result
        status="info"
        title="供应商后台正在建设中"
        subTitle={
          <div>
            欢迎回来{user?.name ? `，${user.name}` : ''}！您的账号已完成登录。
            <br />
            供应商专属界面（上传内容 / 团队成员 / 消息）将在 ExCS Authz Phase 9 上线。
          </div>
        }
        extra={[
          <Button key="logout" type="primary" onClick={async () => {
            await logout();
            navigate('/login/callback', { replace: true });
          }}>
            退出登录
          </Button>,
        ]}
      />
    </div>
  );
}
