import { lazy, Suspense, useMemo } from 'react';
import { Spin } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { TeamOutlined, KeyOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';

const UserListPage = lazy(() => import('@/pages/user/UserListPage'));
const GrantListPage = lazy(() => import('@/pages/authz/GrantListPage'));

type TabKey = 'users' | 'grants';

const TABS: PillTab<TabKey>[] = [
  { key: 'users', label: '用户', icon: <TeamOutlined /> },
  { key: 'grants', label: '授权总览', icon: <KeyOutlined /> },
];

function TabFallback() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <Spin />
    </div>
  );
}

export default function PeopleAuthzHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<TabKey>(() => {
    const t = searchParams.get('tab');
    return TABS.some((x) => x.key === t) ? (t as TabKey) : 'users';
  }, [searchParams]);

  const setActive = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="人员与授权"
        description="按人查看用户与状态，或按记录追溯授权变更——同一池数据的两种视图。"
      />
      <PillTabs tabs={TABS} active={activeTab} onChange={setActive} ariaLabel="人员与授权 tab" />
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'users' ? <UserListPage embedded /> : <GrantListPage embedded />}
      </Suspense>
    </div>
  );
}
