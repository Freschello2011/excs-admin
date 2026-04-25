import { lazy, Suspense, useMemo } from 'react';
import { Spin } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { DashboardOutlined, BarChartOutlined, RobotOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';

const OverviewPage = lazy(() => import('@/pages/analytics/OverviewPage'));
const ContentStatsPage = lazy(() => import('@/pages/analytics/ContentStatsPage'));
const AiStatsPage = lazy(() => import('@/pages/analytics/AiStatsPage'));

type TabKey = 'overview' | 'content' | 'ai';

const TABS: PillTab<TabKey>[] = [
  { key: 'overview', label: '运行概览', icon: <DashboardOutlined /> },
  { key: 'content', label: '内容统计', icon: <BarChartOutlined /> },
  { key: 'ai', label: 'AI 互动', icon: <RobotOutlined /> },
];

function TabFallback() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <Spin />
    </div>
  );
}

/**
 * 「运营分析」聚合页 — 把运行概览 / 内容统计 / AI 互动统计 三个原本独立的 sidebar 项合并成单页 3 Tab。
 *
 * - 玻璃胶囊 PillTabs（与 ExhibitDetail / StorageOverview 风格一致）
 * - URL `?tab=overview|content|ai` 支持深链；旧 3 路径加 redirect 兜底
 * - Suspense lazy：未切到的 Tab 不发 API
 * - 各 Tab 内部各自维护时间范围 / 筛选器（不强求外层统一）
 */
export default function AnalyticsHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<TabKey>(() => {
    const t = searchParams.get('tab');
    return TABS.some((x) => x.key === t) ? (t as TabKey) : 'overview';
  }, [searchParams]);

  const setActive = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const renderActive = () => {
    if (activeTab === 'overview') return <OverviewPage embedded />;
    if (activeTab === 'content') return <ContentStatsPage embedded />;
    return <AiStatsPage embedded />;
  };

  return (
    <div>
      <PageHeader
        title="运营分析"
        description="运行操作监控 / 内容播放统计 / AI 会话与关键词"
      />
      <PillTabs tabs={TABS} active={activeTab} onChange={setActive} ariaLabel="运营分析 tab" />
      <Suspense fallback={<TabFallback />}>{renderActive()}</Suspense>
    </div>
  );
}
