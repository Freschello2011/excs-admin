import { lazy, Suspense, useMemo } from 'react';
import { Spin } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { CloudOutlined, FolderOpenOutlined, PayCircleOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';

const OSSStatsPage = lazy(() => import('@/pages/content/OSSStatsPage'));
const OssBrowserPage = lazy(() => import('@/pages/analytics/OssBrowserPage'));
const CostPage = lazy(() => import('@/pages/analytics/CostPage'));

type TabKey = 'usage' | 'browse' | 'cost';

const TABS: PillTab<TabKey>[] = [
  { key: 'usage', label: '用量总览', icon: <CloudOutlined /> },
  { key: 'browse', label: '文件浏览', icon: <FolderOpenOutlined /> },
  { key: 'cost', label: '费用分析', icon: <PayCircleOutlined /> },
];

function TabFallback() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <Spin />
    </div>
  );
}

export default function StorageOverviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<TabKey>(() => {
    const t = searchParams.get('tab');
    return TABS.some((x) => x.key === t) ? (t as TabKey) : 'usage';
  }, [searchParams]);

  const setActive = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const renderActive = () => {
    if (activeTab === 'usage') return <OSSStatsPage embedded />;
    if (activeTab === 'browse') return <OssBrowserPage embedded />;
    return <CostPage embedded />;
  };

  return (
    <div>
      <PageHeader
        title="存储与费用"
        description="OSS 6 桶 + NAS 归档容量（展厅可分摊 / 平台公共开销分区）/ 文件级浏览 / AI Token 与 OSS 月度费用"
      />
      <PillTabs tabs={TABS} active={activeTab} onChange={setActive} ariaLabel="存储与费用 tab" />
      <Suspense fallback={<TabFallback />}>{renderActive()}</Suspense>
    </div>
  );
}
