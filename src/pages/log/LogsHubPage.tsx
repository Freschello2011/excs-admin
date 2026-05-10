import { lazy, Suspense, useMemo } from 'react';
import { Spin } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { HistoryOutlined, AuditOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';

const OperationLogPage = lazy(() => import('@/pages/log/OperationLogPage'));
const AuditLogListPage = lazy(() => import('@/pages/authz/AuditLogListPage'));

type TabKey = 'business' | 'authz-audit';

const TABS: PillTab<TabKey>[] = [
  { key: 'business', label: '业务日志', icon: <HistoryOutlined /> },
  { key: 'authz-audit', label: '权限审计', icon: <AuditOutlined /> },
];

function TabFallback() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <Spin />
    </div>
  );
}

export default function LogsHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<TabKey>(() => {
    const t = searchParams.get('tab');
    return TABS.some((x) => x.key === t) ? (t as TabKey) : 'business';
  }, [searchParams]);

  const setActive = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="日志"
        description="业务事件流（操作记录）与权限审计流（授权变更 / 风险操作）合并视图。"
      />
      <PillTabs tabs={TABS} active={activeTab} onChange={setActive} ariaLabel="日志 tab" />
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'business' ? <OperationLogPage embedded /> : <AuditLogListPage embedded />}
      </Suspense>
    </div>
  );
}
