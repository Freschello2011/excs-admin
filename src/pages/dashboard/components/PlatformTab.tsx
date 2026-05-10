import { Spin } from 'antd';
import styles from '../DashboardPage.module.scss';
import { Ring, Trend24Chart } from './charts';
import {
  fmtBytes,
  fmtDate,
  fmtShortDateTime,
  fmtUptime,
} from './formatters';
import { usePlatformDashboard } from '../hooks/usePlatformDashboard';
import type {
  BackupJobStatus,
  BackupStatusResult,
  CertInfoDTO,
  DependencyHealth,
  ECSHostInfo,
  PlatformDashboardResp,
  ResourceMetricResult,
} from '@/api/gen/client';

const RESOURCE_COLOR: Record<'cpu' | 'mem' | 'disk', string> = {
  cpu: '#2F9E5A',
  mem: '#3178D0',
  disk: '#6A4EE8',
};

const RESOURCE_ICON_CLASS: Record<'cpu' | 'mem' | 'disk', string> = {
  cpu: styles.icSuccess,
  mem: styles.icInfo,
  disk: styles.icPrimary,
};

const RESOURCE_TITLE: Record<'cpu' | 'mem' | 'disk', string> = {
  cpu: 'CPU 使用率',
  mem: '内存使用率',
  disk: '云盘使用率',
};

const RESOURCE_EMOJI: Record<'cpu' | 'mem' | 'disk', string> = {
  cpu: '🧠',
  mem: '💾',
  disk: '📀',
};

interface PlatformTabProps {
  active: boolean;
}

/** Tab A · 平台监控（4 行：资源 / 依赖 / 备份 / SSL 证书）。 */
export default function PlatformTab({ active }: PlatformTabProps) {
  const { data, isLoading, isError } = usePlatformDashboard(active);

  if (isLoading && !data) {
    return (
      <div className={styles.empty}>
        <Spin /> <span style={{ marginLeft: 8 }}>正在加载平台监控数据…</span>
      </div>
    );
  }

  if (isError || !data) {
    return <div className={styles.empty}>平台监控数据加载失败，请稍后重试</div>;
  }

  return (
    <>
      <ResourceRow data={data} />
      <DependencyRow deps={data.deps} />
      <BackupRow backups={data.backups} />
      <CertRow certs={data.certs} />
    </>
  );
}

// ============================================================================
// Row 1 · 资源使用率 + ECS 主机信息
// ============================================================================

function ResourceRow({ data }: { data: PlatformDashboardResp }) {
  return (
    <>
      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>资源使用率 · 近 24h（阈值线 80%）</div>
        <a
          className={styles.sectionLink}
          href="https://ecs.console.aliyun.com"
          target="_blank"
          rel="noreferrer"
        >
          阿里云控制台 →
        </a>
      </div>
      <div className={styles.row}>
        <ResourceCard kind="cpu" result={data.cpu} />
        <ResourceCard kind="mem" result={data.mem} />
        <ResourceCard kind="disk" result={data.disk} />
        <HostCard result={data.host} />
      </div>
    </>
  );
}

function ResourceCard({
  kind,
  result,
}: {
  kind: 'cpu' | 'mem' | 'disk';
  result: ResourceMetricResult;
}) {
  const m = result.metric;
  const color = RESOURCE_COLOR[kind];
  // gen.ResourceMetric.Level 是 free-form string；service 层填 ok/warn/danger，前端窄化给 LevelPill。
  const level = (m?.Level as 'ok' | 'warn' | 'danger') ?? 'ok';
  const current = m?.Current ?? 0;
  const series = m?.Series24h ?? [];
  const peak = m?.PeakValue ?? 0;

  return (
    <div className={styles.card}>
      <div className={styles.statHead}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${RESOURCE_ICON_CLASS[kind]}`}>
            {RESOURCE_EMOJI[kind]}
          </span>
          {RESOURCE_TITLE[kind]}
        </div>
        <LevelPill level={level} />
      </div>
      <div className={styles.ringWrap}>
        <Ring percent={current} color={color} />
        <div>
          <div>
            <span className={styles.ringValue}>{formatRingValue(current)}</span>
            <span className={styles.ringUnit}>%</span>
          </div>
          {result.degraded && <div className={styles.statValueSub}>数据延迟</div>}
        </div>
      </div>
      <div className={styles.trend24Wrap}>
        <Trend24Chart data={series} color={color} />
        <div className={styles.trend24Axis}>
          <span>00:00</span>
          <span className={styles.peak}>{peak > 0 ? `峰值 ${formatRingValue(peak)}%` : ''}</span>
          <span>现在</span>
        </div>
      </div>
      {result.degraded && result.reason && (
        <div className={styles.degraded}>⚠ {result.reason}</div>
      )}
    </div>
  );
}

function HostCard({ result }: { result: { host?: ECSHostInfo | null; degraded: boolean; reason?: string } }) {
  const h = result.host;
  const running = h?.Status === 'Running';

  return (
    <div className={styles.card}>
      <div className={styles.statHead}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${styles.icNeutral}`}>🖥</span>
          ECS 主机
        </div>
        <LevelPill level={running ? 'ok' : 'warn'} okLabel="运行中" warnLabel={h?.Status || '—'} />
      </div>
      <div style={{ marginTop: 2 }}>
        <KvRow k="公网 IP" v={h?.PublicIP || '—'} />
        <KvRow k="地域" v={h?.Region || '—'} />
        <KvRow k="规格" v={h?.Spec || '—'} />
        <KvRow k="运行时长" v={fmtUptime(h?.UptimeSec ?? 0)} />
      </div>
      {result.degraded && result.reason && (
        <div className={styles.degraded}>⚠ {result.reason}</div>
      )}
    </div>
  );
}

// ============================================================================
// Row 2 · 依赖健康
// ============================================================================

const DEP_META: Record<
  DependencyHealth['Kind'],
  { title: string; icon: string; iconCls: string; extra: Array<{ key: string; label: string }> }
> = {
  mysql: {
    title: 'MySQL',
    icon: '🗄',
    iconCls: styles.icCyan,
    extra: [
      { key: 'connections', label: '活动连接' },
      { key: 'qps', label: 'QPS' },
      { key: 'version', label: '版本' },
    ],
  },
  redis: {
    title: 'Redis',
    icon: '🔴',
    iconCls: styles.icError,
    extra: [
      { key: 'used_memory', label: '已用内存' },
      { key: 'hit_rate', label: '命中率' },
      { key: 'version', label: '版本' },
    ],
  },
  emqx: {
    title: 'EMQX',
    icon: '📡',
    iconCls: styles.icInfo,
    extra: [
      { key: 'connections', label: '活动连接' },
      { key: 'rate_in', label: '消息入/秒' },
      { key: 'rate_out', label: '消息出/秒' },
    ],
  },
  oss: {
    title: 'OSS 业务桶',
    icon: '☁️',
    iconCls: styles.icSuccess,
    extra: [
      { key: 'raw', label: 'excs-raw' },
      { key: 'encrypted', label: 'excs-encrypted' },
      { key: 'thumbnail', label: 'excs-thumbnail' },
      { key: 'releases', label: 'excs-releases' },
      { key: 'ai-assets', label: 'excs-ai-assets' },
    ],
  },
};

function DependencyRow({ deps }: { deps: DependencyHealth[] }) {
  // 固定顺序：mysql/redis/emqx/oss；后端返回的可能顺序乱或缺，这里兜底
  const byKind: Partial<Record<DependencyHealth['Kind'], DependencyHealth>> = {};
  for (const d of deps || []) byKind[d.Kind] = d;
  const order: Array<DependencyHealth['Kind']> = ['mysql', 'redis', 'emqx', 'oss'];

  return (
    <>
      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>依赖健康 · 心跳 30s</div>
      </div>
      <div className={styles.row}>
        {order.map((kind) => (
          <DependencyCard key={kind} kind={kind} dep={byKind[kind]} />
        ))}
      </div>
    </>
  );
}

function DependencyCard({ kind, dep }: { kind: DependencyHealth['Kind']; dep?: DependencyHealth }) {
  const meta = DEP_META[kind];
  const level = dep ? depLevel(dep) : 'warn';
  const latency = dep?.LatencyMs ?? 0;
  const available = dep?.Available ?? false;
  const extraMap = dep?.ExtraMetrics ?? {};

  const primaryUnit = kind === 'oss' ? 'ms 平均延迟' : 'ms 响应';

  return (
    <div className={styles.card}>
      <div className={styles.depTop}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${meta.iconCls}`}>{meta.icon}</span>
          {meta.title}
        </div>
        <LevelPill
          level={level}
          okLabel={available ? '可用' : '—'}
          warnLabel={available ? '延迟' : '失败'}
          errLabel="失败"
        />
      </div>
      <div className={styles.depMain}>
        <span className={styles.v}>{latency.toFixed(1)}</span>
        <span className={styles.u}>{primaryUnit}</span>
      </div>
      <div>
        {meta.extra.map((e) => (
          <KvRow key={e.key} k={e.label} v={extraMap?.[e.key] || '—'} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Row 3 · 备份（快照 + 文件）
// ============================================================================

function BackupRow({ backups }: { backups: BackupStatusResult[] }) {
  const snapshot = backups?.find((b) => b.status?.Kind === 'snapshot') ?? backups?.[0];
  const file = backups?.find((b) => b.status?.Kind === 'file') ?? backups?.[1];

  return (
    <>
      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>备份</div>
        <a
          className={styles.sectionLink}
          href="https://hbr.console.aliyun.com"
          target="_blank"
          rel="noreferrer"
        >
          HBR 控制台 →
        </a>
      </div>
      <div className={styles.row}>
        <BackupCard title="快照备份" icon="📸" iconCls={styles.icInfo} result={snapshot} />
        <BackupCard title="文件备份" icon="🗂" iconCls={styles.icPrimary} result={file} />
        <div />
        <div />
      </div>
    </>
  );
}

function BackupCard({
  title,
  icon,
  iconCls,
  result,
}: {
  title: string;
  icon: string;
  iconCls: string;
  result?: BackupStatusResult;
}) {
  const st = result?.status;
  const pill = backupPill(st);

  return (
    <div className={styles.card}>
      <div className={styles.statHead}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${iconCls}`}>{icon}</span>
          {title}
        </div>
        <span className={`${styles.pill} ${styles[pill.cls]}`}>{pill.label}</span>
      </div>
      <div style={{ marginTop: 2 }}>
        <KvRow k="上次备份" v={fmtShortDateTime(st?.LastSuccessAt)} />
        <KvRow k="下次备份" v={fmtShortDateTime(st?.NextScheduledAt)} />
        <KvRow k="保留策略" v={st?.RetentionPolicy || '—'} />
        {st?.Kind === 'snapshot'
          ? <KvRow k="快照大小" v={st?.LatestSize ? formatBackupSize(st.LatestSize) : '—'} />
          : <KvRow k="备份历史" v={st?.HistoryCount ? `${st.HistoryCount} 份` : '—'} />}
      </div>
      {result?.degraded && result.reason && (
        <div className={styles.degraded}>⚠ {result.reason}</div>
      )}
      {st?.LastError && (
        <div className={styles.degraded}>⚠ {st.LastError}</div>
      )}
    </div>
  );
}

// ============================================================================
// Row 4 · SSL 证书（3 张 + 续签提示）
// ============================================================================

function CertRow({ certs }: { certs: CertInfoDTO[] }) {
  const sorted = [...(certs || [])].sort((a, b) => a.days_remaining - b.days_remaining);
  const earliest = sorted[0];
  const hint = computeRenewalHint(sorted);

  return (
    <>
      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>
          SSL 证书 · {sorted.length ? `${sorted.length} 张` : '未发现证书文件'}
        </div>
      </div>
      <div className={styles.row}>
        {sorted.slice(0, 3).map((c) => (
          <CertCard key={c.subject + c.not_after} cert={c} />
        ))}
        {sorted.length < 3 && Array.from({ length: 3 - sorted.length }).map((_, i) => <div key={`gap-${i}`} />)}
        <RenewalHintCard hint={hint} earliest={earliest} />
      </div>
    </>
  );
}

function CertCard({ cert }: { cert: CertInfoDTO }) {
  const level = cert.level || 'ok';
  const shortName = extractCertShortName(cert.subject);

  return (
    <div className={styles.card}>
      <div className={styles.statHead}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${styles.icSuccess}`}>🔒</span>
          SSL · {shortName}
        </div>
        <span className={`${styles.pill} ${styles[level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : 'err']}`}>
          {level === 'ok' ? '有效' : level === 'warn' ? '将到期' : '即将到期'}
        </span>
      </div>
      <div className={styles.kvRow} style={{ border: 0, paddingTop: 0 }}>
        <span className={styles.kvKey}>域名</span>
        <span className={`${styles.kvVal} ${styles.kvValMono}`}>{cert.subject}</span>
      </div>
      <div className={styles.certDays}>
        <span className={`${styles.num} ${styles[level]}`}>{cert.days_remaining}</span>
        <span className={styles.lbl}>天后到期</span>
      </div>
      <div>
        <KvRow k="签发日" v={fmtDate(cert.not_before)} />
        <KvRow k="到期日" v={fmtDate(cert.not_after)} />
        <KvRow k="签发 CA" v={cert.issuer || '—'} mono />
      </div>
    </div>
  );
}

function RenewalHintCard({ hint, earliest }: { hint: string; earliest?: CertInfoDTO }) {
  return (
    <div className={`${styles.card} ${styles.cardDashedWarn}`}>
      <div className={styles.statHead}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${styles.icWarning}`}>📅</span>
          续签提示
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-on-surface-variant)',
          lineHeight: 1.7,
          marginTop: 2,
        }}
      >
        {hint || '证书状态正常，暂无续签建议'}
      </div>
      {earliest && (
        <div style={{ marginTop: 14 }}>
          <KvRow k="最早到期" v={`${extractCertShortName(earliest.subject)} · ${fmtDate(earliest.not_after)}`} />
          <KvRow
            k="建议续签日"
            v={`≤ ${fmtDate(shiftBackDays(earliest.not_after, 30))}`}
            valueStyle={{ color: 'var(--color-warning)' }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatRingValue(v: number): string {
  return v >= 10 ? v.toFixed(2) : v.toFixed(3);
}

function formatBackupSize(bytes: number): string {
  const { value, unit } = fmtBytes(bytes);
  return `${value} ${unit}`;
}

function depLevel(d: DependencyHealth): 'ok' | 'warn' | 'err' {
  if (!d.Available && d.FailStreak >= 3) return 'err';
  if (d.LatencyMs > 500) return 'warn';
  return 'ok';
}

function backupPill(st?: BackupJobStatus | null): { cls: 'ok' | 'warn' | 'err' | 'run'; label: string } {
  if (!st) return { cls: 'warn', label: '未启用' };
  switch (st.State) {
    case 'done': return { cls: 'ok', label: '完成' };
    case 'running': return { cls: 'run', label: '备份中' };
    case 'failed': return { cls: 'err', label: '失败' };
    case 'delayed': return { cls: 'warn', label: '延迟' };
    case 'not_configured': return { cls: 'warn', label: '未配置' };
    case 'not_enabled': return { cls: 'warn', label: '未启用' };
    default: return { cls: 'warn', label: String(st.State) };
  }
}

function extractCertShortName(subject: string): string {
  const s = subject.replace('*.', '');
  if (s.includes('1panel')) return '1panel';
  if (s.startsWith('cocg')) return 'cocg';
  if (s.startsWith('crossovercg')) return 'crossovercg';
  const firstDot = s.indexOf('.');
  return firstDot > 0 ? s.slice(0, firstDot) : s;
}

function shiftBackDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function computeRenewalHint(sorted: CertInfoDTO[]): string {
  if (!sorted.length) return '';
  const anyWarn = sorted.some((c) => c.level === 'warn' || c.level === 'danger');
  if (anyWarn) {
    const nearest = sorted[0];
    return `「${extractCertShortName(nearest.subject)}」将在 ${nearest.days_remaining} 天后到期，请尽快续签。`;
  }
  // 若 3 张都在 30 天内连续到期则提示批量续签
  if (sorted.length >= 3) {
    const diff =
      (new Date(sorted[sorted.length - 1].not_after).getTime() -
        new Date(sorted[0].not_after).getTime()) /
      86_400_000;
    if (diff < 30) {
      const startMonth = fmtDate(sorted[0].not_after).slice(0, 7);
      return `三张证书将于 ${startMonth} 月连续到期（相差 ${Math.round(diff)} 天内），建议提前 30-60 天批量续签。`;
    }
  }
  return '证书状态正常，距最早到期 ' + sorted[0].days_remaining + ' 天。';
}

// ============================================================================
// 小组件
// ============================================================================

function LevelPill({
  level,
  okLabel = '正常',
  warnLabel = '警告',
  errLabel = '危险',
  runLabel,
}: {
  level: 'ok' | 'warn' | 'danger' | 'err' | 'run';
  okLabel?: string;
  warnLabel?: string;
  errLabel?: string;
  runLabel?: string;
}) {
  const normalized = level === 'danger' ? 'err' : level;
  const label =
    normalized === 'ok' ? okLabel
    : normalized === 'warn' ? warnLabel
    : normalized === 'run' ? (runLabel ?? '运行中')
    : errLabel;
  return <span className={`${styles.pill} ${styles[normalized]}`}>{label}</span>;
}

function KvRow({
  k,
  v,
  mono,
  valueStyle,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className={styles.kvRow}>
      <span className={styles.kvKey}>{k}</span>
      <span className={`${styles.kvVal} ${mono ? styles.kvValMono : ''}`} style={valueStyle}>
        {v}
      </span>
    </div>
  );
}
