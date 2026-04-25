import { useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Space, Spin } from 'antd';
import { ArrowLeftOutlined, IdcardOutlined, KeyOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';
import UserAuthzPanel from '@/components/authz/UserAuthzPanel';
import BasicTab from '@/components/user/BasicTab';
import { userApi } from '@/api/user';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';

/**
 * UserDetailPage —— P0.5 / P1.1（2026-04-25）：
 *   - 路由迁入 /platform/authz/users/:userId
 *   - 顶栏 「+ 授权」 按钮移除（基本信息卡 / 权限 Tab 内各有入口，不再三处重复）
 *   - antd Tabs → PillTabs 玻璃胶囊（与 StorageOverviewPage / AnalyticsHubPage 一致）
 *   - URL ?tab=basic|authz 深链同步
 */

type TabKey = 'basic' | 'authz';

const TABS: PillTab<TabKey>[] = [
  { key: 'basic', label: '基本信息', icon: <IdcardOutlined /> },
  { key: 'authz', label: '权限', icon: <KeyOutlined /> },
];

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const id = Number(userId);

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
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/platform/authz/users')}
            >
              返回列表
            </Button>
          </Space>
        }
      />

      <PillTabs
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="用户详情 tab"
      />

      <div style={{ marginTop: 16 }}>
        {activeTab === 'basic' && (
          <BasicTab user={user} onSwitchToAuthz={() => setActiveTab('authz')} />
        )}
        {activeTab === 'authz' && (
          <UserAuthzPanel
            userId={id}
            onNavigateGrantWizard={
              isSelf ? undefined : () => navigate(`/platform/authz/users/${id}/grant`)
            }
          />
        )}
      </div>
    </div>
  );
}
