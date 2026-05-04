import { lazy, Suspense, useMemo } from 'react';
import { Spin, Empty } from 'antd';
import { useSearchParams } from 'react-router-dom';
import {
  ApiOutlined, AppstoreOutlined, ControlOutlined,
  FileTextOutlined, WarningOutlined,
} from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import PillTabs, { type PillTab } from '@/components/common/PillTabs';
import { hasAnyAction } from '@/lib/authz/can';

const GatewaysPage = lazy(() => import('@/pages/smarthome/GatewaysPage'));
const DeviceHealthPage = lazy(() => import('@/pages/smarthome/DeviceHealthPage'));
const RulesPage = lazy(() => import('@/pages/smarthome/RulesPage'));
const TriggerLogsPage = lazy(() => import('@/pages/smarthome/TriggerLogsPage'));
const AlertsPage = lazy(() => import('@/pages/smarthome/AlertsPage'));

type TabKey = 'gateways' | 'health' | 'rules' | 'trigger-logs' | 'alerts';

interface TabDef extends PillTab<TabKey> {
  requireActions: string[];
}

const ALL_TABS: TabDef[] = [
  { key: 'gateways', label: '网关管理', icon: <ApiOutlined />, requireActions: ['smarthome.manage_gateway', 'smarthome.view'] },
  { key: 'health', label: '设备全景', icon: <AppstoreOutlined />, requireActions: ['smarthome.view'] },
  { key: 'rules', label: '规则管理', icon: <ControlOutlined />, requireActions: ['smarthome.manage_rule', 'smarthome.view'] },
  { key: 'trigger-logs', label: '触发日志', icon: <FileTextOutlined />, requireActions: ['smarthome.view'] },
  { key: 'alerts', label: '告警列表', icon: <WarningOutlined />, requireActions: ['smarthome.alert_ack', 'smarthome.view'] },
];

function TabFallback() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <Spin />
    </div>
  );
}

/**
 * 「智能家居」聚合页 — 把网关 / 设备全景 / 规则 / 触发日志 / 告警 五个原本独立的 sidebar 项合并成单页 5 Tab。
 *
 * - 玻璃胶囊 PillTabs（与 AnalyticsHubPage / ExhibitDetail 风格一致）
 * - URL `?tab=gateways|health|rules|trigger-logs|alerts` 支持深链；旧 5 路径加 redirect 兜底
 * - Suspense lazy：未切到的 Tab 不发 API
 * - Tab 按权限过滤：用户无某 tab 的任一 action 则不显示该 tab
 * - 各子页统一带 `embedded` prop 以隐藏自身 PageHeader（沿用 OverviewPage 模式）
 */
export default function SmartHomeHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = useMemo<TabDef[]>(
    () => ALL_TABS.filter((t) => hasAnyAction(t.requireActions)),
    [],
  );

  const activeTab = useMemo<TabKey | null>(() => {
    if (tabs.length === 0) return null;
    const t = searchParams.get('tab');
    if (tabs.some((x) => x.key === t)) return t as TabKey;
    return tabs[0].key;
  }, [searchParams, tabs]);

  const setActive = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const renderActive = () => {
    if (activeTab === 'gateways') return <GatewaysPage embedded />;
    if (activeTab === 'health') return <DeviceHealthPage embedded />;
    if (activeTab === 'rules') return <RulesPage embedded />;
    if (activeTab === 'trigger-logs') return <TriggerLogsPage embedded />;
    if (activeTab === 'alerts') return <AlertsPage embedded />;
    return null;
  };

  return (
    <div>
      <PageHeader
        title="智能家居"
        description="网关 / 设备全景 / 规则 / 触发日志 / 告警"
      />
      {activeTab === null ? (
        <Empty description="无智能家居模块访问权限" style={{ padding: '60px 0' }} />
      ) : (
        <>
          <PillTabs tabs={tabs} active={activeTab} onChange={setActive} ariaLabel="智能家居 tab" />
          <Suspense fallback={<TabFallback />}>{renderActive()}</Suspense>
        </>
      )}
    </div>
  );
}
