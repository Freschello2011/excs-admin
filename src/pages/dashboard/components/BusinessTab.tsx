import { Link } from 'react-router-dom';
import styles from '../DashboardPage.module.scss';
import { PctChart, ValueChart } from './charts';
import TodoBanner from './TodoBanner';
import { fmtBytes, fmtNum, fmtPct, prevPeriodLabel } from './formatters';
import { useBusinessDashboard } from '../hooks/useBusinessDashboard';
import type {
  AiInteractionDTO,
  BusinessPeriod,
  CostCardDTO,
  CostTrendDTO,
  RunningCardDTO,
  RunningStatsDTO,
  StorageBucketDTO,
  StorageCapacityDTO,
} from '@/api/gen/client';

interface BusinessTabProps {
  active: boolean;
  period: BusinessPeriod;
}

/** Tab B · 业务看板（Todo / 运行 / 存储 / 费用 / AI 互动）
 *  period / PeriodSwitch 由父 DashboardPage 顶栏统一管理。*/
export default function BusinessTab({ active, period }: BusinessTabProps) {
  const { todos, running, storage, cost, ai } = useBusinessDashboard(period, active);

  return (
    <>
      <TodoBanner items={todos.data?.items ?? []} loading={todos.isLoading && !todos.data} />

      <RunningRow dto={running.data} period={period} loading={running.isLoading && !running.data} />
      <StorageRow dto={storage.data} loading={storage.isLoading && !storage.data} />
      <CostRow dto={cost.data} period={period} loading={cost.isLoading && !cost.data} />
      <AiInteractionRow dto={ai.data} period={period} loading={ai.isLoading && !ai.data} />
    </>
  );
}

// ============================================================================
// 运行状态行
// ============================================================================

function RunningRow({ dto, period, loading }: { dto?: RunningStatsDTO; period: BusinessPeriod; loading: boolean }) {
  return (
    <>
      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>运行状态</div>
        <Link to="/halls" className={styles.sectionLink}>查看详情 →</Link>
      </div>
      <div className={styles.row}>
        <RunningCard
          card={dto?.hall_count}
          iconCls={styles.icPrimary}
          icon="🏛"
          color="#6A4EE8"
          period={period}
          loading={loading}
          placeholderSub="长期稳定值"
          flatline
        />
        <RunningCard
          card={dto?.online_devices}
          iconCls={styles.icSuccess}
          icon="📡"
          color="#2F9E5A"
          period={period}
          loading={loading}
        />
        <RunningCard
          card={dto?.content_count}
          iconCls={styles.icNeutral}
          icon="📁"
          color="#6A4EE8"
          period={period}
          loading={loading}
        />
        <RunningCard
          card={dto?.today_ops}
          iconCls={styles.icPrimary}
          icon="📝"
          color="#6A4EE8"
          period={period}
          loading={loading}
        />
      </div>
    </>
  );
}

function RunningCard({
  card,
  iconCls,
  icon,
  color,
  period,
  loading,
  placeholderSub,
  flatline,
}: {
  card?: RunningCardDTO;
  iconCls: string;
  icon: string;
  color: string;
  period: BusinessPeriod;
  loading: boolean;
  placeholderSub?: string;
  flatline?: boolean;
}) {
  const title = card?.title || '—';
  const unit = card?.unit || '';
  const value = fmtNum(card?.value);
  const sub = card?.sub || placeholderSub || '';
  const trend = card?.trend;
  const series = trend?.Series ?? [];
  const direction = (trend?.Direction || 'flat') as 'up' | 'down' | 'flat';
  const delta = trend?.Delta || '';
  const first = trend?.FirstVal ?? 0;
  const last = trend?.LastVal ?? 0;

  return (
    <div className={styles.card}>
      <div className={styles.statHead}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${iconCls}`}>{icon}</span>
          {title}
        </div>
      </div>
      <div className={styles.statBody}>
        <div>
          <div>
            <span className={styles.statValue}>{loading ? '—' : value}</span>
            {unit && <span className={styles.statUnit}>{unit}</span>}
          </div>
          {sub && <div className={styles.statValueSub}>{sub}</div>}
        </div>
        <div className={styles.chartWrap}>
          {flatline ? (
            <svg className={styles.sparkline} viewBox="0 0 100 40" preserveAspectRatio="none">
              <line x1="0" y1="20" x2="100" y2="20" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="100" cy="20" r="2.5" fill={color} />
            </svg>
          ) : (
            <ValueChart data={series} color={color} />
          )}
          <div className={styles.chartAxis}>
            <span>{flatline ? '—' : fmtNum(first)}</span>
            <span className={styles.lastVal}>{flatline ? '—' : fmtNum(last)}</span>
          </div>
        </div>
      </div>
      <div className={`${styles.statFoot} ${styles[direction]}`}>
        <span style={{ fontWeight: 600 }}>{symbolFor(direction)}</span>
        {flatline ? '无环比波动' : `${prevPeriodLabel(period)} ${delta}`}
      </div>
    </div>
  );
}

// ============================================================================
// 存储容量行
// ============================================================================

function StorageRow({ dto, loading }: { dto?: StorageCapacityDTO; loading: boolean }) {
  return (
    <>
      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>存储容量（全展厅合计）</div>
        <Link to="/analytics/storage?tab=browse" className={styles.sectionLink}>存储浏览 →</Link>
      </div>
      <div className={styles.row}>
        <StorageCard
          b={dto?.nas}
          icon="💾"
          iconCls={styles.icInfo}
          barColor="var(--color-info, #3178D0)"
          loading={loading}
          fallbackName="NAS 归档"
        />
        <StorageCard
          b={dto?.raw}
          icon="📦"
          iconCls={styles.icCyan}
          barColor="#1994AE"
          loading={loading}
          fallbackName="原始桶"
        />
        <StorageCard
          b={dto?.encrypted}
          icon="🔐"
          iconCls={styles.icPrimary}
          barColor="var(--color-primary)"
          loading={loading}
          fallbackName="加密桶"
        />
        <StorageCard
          b={dto?.thumbnail}
          icon="🖼"
          iconCls={styles.icPink}
          barColor="#C3448F"
          loading={loading}
          fallbackName="缩略图桶"
        />
      </div>
    </>
  );
}

function StorageCard({
  b,
  icon,
  iconCls,
  barColor,
  loading,
  fallbackName,
}: {
  b?: StorageBucketDTO;
  icon: string;
  iconCls: string;
  barColor: string;
  loading: boolean;
  fallbackName: string;
}) {
  const name = b?.name || fallbackName;
  const size = b?.total_bytes ?? 0;
  const obj = b?.object_count ?? 0;
  const pct = b?.percent ?? 0;
  const capacityBytes = b?.capacity_bytes ?? 0;
  const { value, unit } = fmtBytes(size);
  const cap = fmtBytes(capacityBytes);

  return (
    <div className={styles.card}>
      <div className={styles.statHead}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${iconCls}`}>{icon}</span>
          {name}
          {b?.bucket && (
            <span
              style={{
                color: 'var(--color-outline)',
                fontWeight: 400,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11,
              }}
            >
              {b.bucket}
            </span>
          )}
        </div>
      </div>
      <div className={styles.statBody}>
        <div>
          <div>
            <span className={styles.statValue}>{loading ? '—' : value}</span>
            <span className={styles.statUnit}>{unit}</span>
          </div>
          <div className={styles.statValueSub}>{fmtNum(obj)} {b?.name?.startsWith('NAS') ? '文件' : '对象'}</div>
        </div>
      </div>
      <div className={styles.progressWrap}>
        <div
          className={styles.progressBar}
          style={{ width: `${Math.min(100, pct)}%`, background: barColor }}
        />
      </div>
      <div className={styles.progressMeta}>
        <span>已用 {pct.toFixed(1)}%</span>
        <span>容量 {cap.value} {cap.unit}</span>
      </div>
    </div>
  );
}

// ============================================================================
// 费用行
// ============================================================================

function CostRow({
  dto,
  period,
  loading,
}: {
  dto?: CostTrendDTO;
  period: BusinessPeriod;
  loading: boolean;
}) {
  return (
    <>
      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>本月费用（全展厅合计）</div>
        <Link to="/analytics/storage?tab=cost" className={styles.sectionLink}>费用分析 →</Link>
      </div>
      <div className={styles.row}>
        <CostCard card={dto?.ai} iconCls={styles.icPrimary} icon="🤖" color="#6A4EE8" period={period} loading={loading} />
        <CostCard card={dto?.oss} iconCls={styles.icSuccess} icon="☁️" color="#2F9E5A" period={period} loading={loading} />
        <CostCard card={dto?.total} iconCls={styles.icWarning} icon="💰" color="#D68A2A" period={period} loading={loading} total />
        <div />
      </div>
    </>
  );
}

function CostCard({
  card,
  iconCls,
  icon,
  color,
  period,
  loading,
  total,
}: {
  card?: CostCardDTO;
  iconCls: string;
  icon: string;
  color: string;
  period: BusinessPeriod;
  loading: boolean;
  total?: boolean;
}) {
  const trend = card?.pct_trend;
  const series = trend?.Series ?? [];
  const first = trend?.FirstVal ?? 0;
  const last = trend?.LastVal ?? 0;
  const delta = trend?.Delta || '';
  const direction = (trend?.Direction || 'flat') as 'up' | 'down' | 'flat';
  const month = card?.month_cny ?? 0;

  return (
    <div className={`${styles.card} ${total ? styles.cardTotal : ''}`}>
      <div className={styles.statHead}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${iconCls}`}>{icon}</span>
          {card?.title || '—'}
        </div>
      </div>
      <div className={styles.statBody}>
        <div>
          <div>
            <span className={styles.statUnit} style={{ marginLeft: 0, marginRight: 2 }}>¥</span>
            <span
              className={styles.statValue}
              style={total ? { color: 'var(--color-warning)' } : undefined}
            >
              {loading ? '—' : month.toFixed(2)}
            </span>
          </div>
          <div className={styles.statValueSub}>{card?.sub || ''}</div>
        </div>
        <div className={styles.chartWrap}>
          <PctChart data={series} color={color} />
          <div className={styles.chartAxis}>
            <span className={first >= 0 ? styles.pctUp : styles.pctDown}>{fmtPct(first)}</span>
            <span className={last >= 0 ? styles.pctUp : styles.pctDown}>{fmtPct(last)}</span>
          </div>
        </div>
      </div>
      <div className={`${styles.statFoot} ${styles[direction]}`}>
        <span style={{ fontWeight: 600 }}>{symbolFor(direction)}</span>
        {prevPeriodLabel(period)} {delta}
      </div>
    </div>
  );
}

// ============================================================================
// AI 互动行
// ============================================================================

function AiInteractionRow({
  dto,
  period,
  loading,
}: {
  dto?: AiInteractionDTO;
  period: BusinessPeriod;
  loading: boolean;
}) {
  return (
    <>
      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>AI 互动（全展厅合计）</div>
        <Link to="/analytics/ai-stats" className={styles.sectionLink}>AI 互动统计 →</Link>
      </div>
      <div className={styles.row}>
        <RunningCard
          card={dto?.session_count}
          iconCls={styles.icPrimary}
          icon="💬"
          color="#6A4EE8"
          period={period}
          loading={loading}
        />
        <RunningCard
          card={dto?.total_rounds}
          iconCls={styles.icInfo}
          icon="🔁"
          color="#3178D0"
          period={period}
          loading={loading}
        />
        <RunningCard
          card={dto?.avg_rounds_session}
          iconCls={styles.icCyan}
          icon="📊"
          color="#1994AE"
          period={period}
          loading={loading}
        />
        <RunningCard
          card={dto?.avg_duration_sec}
          iconCls={styles.icWarning}
          icon="⏱"
          color="#D68A2A"
          period={period}
          loading={loading}
        />
      </div>
    </>
  );
}

function symbolFor(dir: 'up' | 'down' | 'flat'): string {
  if (dir === 'up') return '↑';
  if (dir === 'down') return '↓';
  return '—';
}
