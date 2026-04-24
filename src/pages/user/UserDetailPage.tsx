import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Space, Spin, Tabs, Tooltip } from 'antd';
import { ArrowLeftOutlined, KeyOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import Can from '@/components/authz/Can';
import UserAuthzPanel from '@/components/authz/UserAuthzPanel';
import BasicTab from '@/components/user/BasicTab';
import { userApi } from '@/api/user';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';

// v1.1（PRD §8.8）：基本信息 Tab 重构为 summary 5 块（画像 / Grant / 能做什么 / vendor / 危险区），
// 「权限」Tab 维持 UserAuthzPanel 不动；Grant 三步向导入口不变。

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const id = Number(userId);
  const activeTab = searchParams.get('tab') ?? 'basic';
  const currentUser = useAuthStore((s) => s.user);
  const isSelf = currentUser?.id === id;

  const { data: user, isLoading } = useQuery({
    queryKey: queryKeys.userDetail(id),
    queryFn: () => userApi.getUser(id),
    select: (res) => res.data.data,
    enabled: !!id,
  });

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  if (!user) {
    return <div>用户不存在</div>;
  }

  return (
    <div>
      <PageHeader
        title="用户详情"
        extra={
          <Space>
            {isSelf ? (
              <Tooltip title="不能对自己授权">
                <Button type="primary" icon={<KeyOutlined />} disabled>
                  + 授权
                </Button>
              </Tooltip>
            ) : (
              <Can action="user.grant">
                <Button
                  type="primary"
                  icon={<KeyOutlined />}
                  onClick={() => navigate(`/platform/users/${id}/grant`)}
                >
                  + 授权
                </Button>
              </Can>
            )}
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/platform/users')}>
              返回列表
            </Button>
          </Space>
        }
      />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          if (key === 'basic') {
            setSearchParams({});
          } else {
            setSearchParams({ tab: key });
          }
        }}
        items={[
          { key: 'basic', label: '基本信息', children: <BasicTab user={user} /> },
          {
            key: 'authz',
            label: '权限',
            children: (
              <UserAuthzPanel
                userId={id}
                onNavigateGrantWizard={() => navigate(`/platform/users/${id}/grant`)}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
