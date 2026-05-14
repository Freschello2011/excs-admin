/**
 * 总览（Dashboard v5.1）—— 三 Tab：平台监控 / 业务看板 / 操作审计。
 *
 * 设计源：07-ui/mockup/03-dashboard/dashboard-v2-mockup.html
 * PRD：01-docs/01-contexts/platform-monitor/PRD.md §4
 * DDD：01-docs/01-contexts/platform-monitor/DDD.md §5
 */
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import { useCan } from '@/lib/authz/can';
import styles from './DashboardPage.module.scss';
import PlatformTab from './components/PlatformTab';
import BusinessTab from './components/BusinessTab';
import AuditTab from './components/AuditTab';
import PeriodSwitch from './components/PeriodSwitch';
import type { BusinessPeriod } from '@/api/gen/client';

type TabKey = 'platform' | 'business' | 'audit';

interface TabDef {
  key: TabKey;
  icon: string;
  label: string;
  visible: boolean;
}

export default function DashboardPage() {
  const canPlatform = useCan('platform.monitor.view');
  const canBusiness = useCan('dashboard.view');
  const canAudit = useCan('audit.view');

  const tabs = useMemo<TabDef[]>(
    () => [
      { key: 'platform', icon: '🖥', label: '平台监控', visible: canPlatform },
      { key: 'business', icon: '📊', label: '业务看板', visible: canBusiness },
      { key: 'audit',    icon: '📝', label: '操作审计', visible: canAudit },
    ],
    [canPlatform, canBusiness, canAudit],
  );

  const visibleTabs = tabs.filter((t) => t.visible);
  const defaultTab: TabKey = canBusiness ? 'business' : visibleTabs[0]?.key ?? 'business';

  const [active, setActive] = useState<TabKey>(defaultTab);
  const [period, setPeriod] = useState<BusinessPeriod>('week');

  // 若当前 tab 在权限刷新后不可见，回退到默认
  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === active)) {
      setActive(defaultTab);
    }
  }, [visibleTabs, active, defaultTab]);

  return (
    <div className={styles.page}>
      <PageHeader title="总览" description="平台底座、业务数据与操作审计一览" />

      {visibleTabs.length > 1 && (
        <div className={styles.topBar}>
          <div className={styles.tabBar}>
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`${styles.tabBtn} ${active === t.key ? styles.active : ''}`}
                onClick={() => setActive(t.key)}
              >
                <span className={styles.tabIcon}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          {active === 'business' && canBusiness && (
            <PeriodSwitch value={period} onChange={setPeriod} />
          )}
        </div>
      )}

      {visibleTabs.length === 0 && (
        <div className={styles.empty}>您没有查看任何仪表盘内容的权限，请联系管理员。</div>
      )}

      {active === 'platform' && canPlatform && <PlatformTab active />}
      {active === 'business' && canBusiness && (
        <BusinessTab active period={period} />
      )}
      {active === 'audit' && canAudit && <AuditTab active />}
    </div>
  );
}
