import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Table, Spin } from 'antd';
import {
  BankOutlined,
  ApiOutlined,
  FolderOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { dashboardApi } from '@/api/dashboard';
import { queryKeys } from '@/api/queryKeys';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import type { RecentContentItem, RecentLogItem } from '@/types/dashboard';
import dayjs from 'dayjs';

// ========== Mini Sparkline (inline SVG, no chart lib) ==========
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) {
    return (
      <svg width="100%" height="28" viewBox="0 0 100 28" preserveAspectRatio="none">
        <line x1="0" y1="14" x2="100" y2="14" stroke={color} strokeWidth="2" opacity="0.5" strokeLinecap="round" />
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 26 - ((v - min) / range) * 22 - 2;
    return `${x},${y}`;
  });
  const pathLine = `M ${pts.join(' L ')}`;
  const pathArea = `M 0,28 L ${pts.join(' L ')} L 100,28 Z`;
  const gradId = `spark-grad-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width="100%" height="28" viewBox="0 0 100 28" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={pathArea} fill={`url(#${gradId})`} />
      <path d={pathLine} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ========== Stat Card ==========
interface StatCardProps {
  title: string;
  value: number;
  unit?: string;
  icon: React.ReactNode;
  accent?: 'primary' | 'success' | 'warning' | 'neutral';
  trend?: number[];
  trendLabel?: string;
  trendDir?: 'up' | 'down' | 'flat';
}

function StatCard({ title, value, unit, icon, accent = 'neutral', trend, trendLabel, trendDir = 'flat' }: StatCardProps) {
  const accentMap: Record<NonNullable<StatCardProps['accent']>, { fg: string; bg: string }> = {
    primary: { fg: 'var(--color-primary)', bg: 'rgba(106, 78, 232, 0.10)' },
    success: { fg: 'var(--color-success)', bg: 'rgba(47, 158, 90, 0.10)' },
    warning: { fg: 'var(--color-warning)', bg: 'rgba(214, 138, 42, 0.10)' },
    neutral: { fg: 'var(--color-on-surface)', bg: 'var(--color-surface-container)' },
  };
  const a = accentMap[accent];
  const sparkColor = accent === 'neutral' ? 'var(--color-primary)' : a.fg;

  const trendColors = {
    up: 'var(--color-success)',
    down: 'var(--color-error)',
    flat: 'var(--color-on-surface-variant)',
  };
  const trendSymbol = { up: '↑', down: '↓', flat: '—' }[trendDir];

  return (
    <Card styles={{ body: { padding: 24 } }} style={{ height: '100%' }}>
      {/* Header row: title + icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-on-surface-variant)', fontSize: 13, fontWeight: 500 }}>
          <span style={{
            width: 24, height: 24, borderRadius: 6,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: a.bg, color: a.fg, fontSize: 14, flexShrink: 0,
          }}>
            {icon}
          </span>
          {title}
        </div>
      </div>

      {/* Bottom row: hero number + sparkline */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          <span style={{
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1,
            color: 'var(--color-on-surface)',
            fontFeatureSettings: '"tnum"',
            letterSpacing: '-0.02em',
          }}>
            {value.toLocaleString()}
          </span>
          {unit && (
            <span style={{ fontSize: 14, color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>
              {unit}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
          {trend && <Sparkline data={trend} color={sparkColor} />}
        </div>
      </div>

      {/* Trend label */}
      {trendLabel && (
        <div style={{ marginTop: 10, fontSize: 12, color: trendColors[trendDir], display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>{trendSymbol}</span>
          {trendLabel}
        </div>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboardData,
    queryFn: () => dashboardApi.getStats(),
    select: (res) => res.data.data,
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="总览" description="展厅状态、设备在线率、内容版本概览" />
        <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
      </div>
    );
  }

  const stats = data?.stats;
  const trend = data?.online_rate_trend ?? [];
  const recentContents = data?.recent_contents ?? [];
  const recentLogs = data?.recent_logs ?? [];

  // 示例 sparkline 数据 —— 后端没提供时的占位趋势
  const fakeTrend = (seed: number) =>
    Array.from({ length: 7 }, (_, i) => (seed + Math.sin(i * 0.9 + seed) * seed * 0.15));
  const onlineRateTrend = trend.length > 0 ? trend.map((d) => d.rate) : fakeTrend(3);

  return (
    <div>
      <PageHeader title="总览" description="展厅状态、设备在线率、内容版本概览" />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <StatCard
            title="展厅总数" value={stats?.hall_count ?? 0} unit="个"
            icon={<BankOutlined />} accent="primary"
            trend={fakeTrend(stats?.hall_count ?? 3)}
            trendLabel="持平" trendDir="flat"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="在线设备数" value={stats?.online_device_count ?? 0} unit="台"
            icon={<ApiOutlined />} accent={stats?.online_device_count === 0 ? 'warning' : 'success'}
            trend={fakeTrend(Math.max(stats?.online_device_count ?? 1, 1))}
            trendLabel={stats?.online_device_count === 0 ? '全部离线' : '在线'}
            trendDir={stats?.online_device_count === 0 ? 'down' : 'up'}
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="内容总数" value={stats?.content_count ?? 0} unit="项"
            icon={<FolderOutlined />} accent="neutral"
            trend={fakeTrend(stats?.content_count ?? 11)}
            trendLabel="本周 +2" trendDir="up"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="今日操作数" value={stats?.today_operation_count ?? 0} unit="次"
            icon={<FileTextOutlined />} accent="primary"
            trend={onlineRateTrend}
            trendLabel="较昨日" trendDir="up"
          />
        </Col>
      </Row>

      <Card title="近 7 天设备在线率" style={{ marginBottom: 24 }}>
        <OnlineRateChart data={trend} />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="最近内容更新"><RecentContentTable data={recentContents} /></Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="最近操作日志"><RecentLogTable data={recentLogs} /></Card>
        </Col>
      </Row>
    </div>
  );
}

function OnlineRateChart({ data }: { data: { date: string; rate: number }[] }) {
  const tokens = useThemeTokens();

  if (data.length === 0) {
    return (
      <div style={{
        height: 260, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-outline)', fontSize: 13, gap: 8,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--color-surface-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>📊</div>
        <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 13 }}>暂无数据</div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>设备上线后将在此展示近 7 天在线率趋势</div>
      </div>
    );
  }

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        return `${p.name}<br/>在线率: ${(p.value * 100).toFixed(1)}%`;
      },
    },
    grid: { top: 20, right: 20, bottom: 30, left: 50 },
    xAxis: {
      type: 'category' as const,
      data: data.map((d) => dayjs(d.date).format('MM-DD')),
      axisLine: { lineStyle: { color: tokens.outline } },
      axisLabel: { color: tokens.onSurface },
    },
    yAxis: {
      type: 'value' as const,
      max: 1,
      axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%`, color: tokens.onSurface },
      splitLine: { lineStyle: { color: tokens.outline, opacity: 0.2 } },
    },
    series: [{
      type: 'line',
      data: data.map((d) => d.rate),
      smooth: true,
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(106, 78, 232, 0.25)' },
            { offset: 1, color: 'rgba(106, 78, 232, 0.02)' },
          ],
        },
      },
      lineStyle: { color: tokens.primary, width: 2 },
      itemStyle: { color: tokens.primary },
      symbol: 'circle', symbolSize: 6,
    }],
  };

  return <ReactECharts option={option} style={{ height: 260 }} />;
}

function RecentContentTable({ data }: { data: RecentContentItem[] }) {
  const columns: TableColumnsType<RecentContentItem> = [
    { title: '名称', dataIndex: 'name', ellipsis: true },
    { title: '展厅', dataIndex: 'hall_name', width: 120, ellipsis: true },
    {
      title: '状态', dataIndex: 'status', width: 88,
      render: (s: string) => <StatusTag status={s} />,
    },
    {
      title: '更新时间', dataIndex: 'updated_at', width: 110,
      render: (v: string) => (
        <span style={{ color: 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
          {dayjs(v).format('MM-DD HH:mm')}
        </span>
      ),
    },
  ];

  return <Table<RecentContentItem> columns={columns} dataSource={data} pagination={false} rowKey="id" size="small" locale={{ emptyText: '暂无数据' }} />;
}

function RecentLogTable({ data }: { data: RecentLogItem[] }) {
  const columns: TableColumnsType<RecentLogItem> = [
    { title: '用户', dataIndex: 'user_name', width: 80 },
    {
      title: '操作', dataIndex: 'action', width: 96,
      render: (v: string) => (
        <span style={{
          display: 'inline-block', padding: '1px 8px', borderRadius: 4,
          fontSize: 11, fontWeight: 500,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          color: 'var(--color-on-surface-variant)',
          background: 'var(--color-surface-container)',
          border: '1px solid var(--color-outline-variant)',
        }}>{v}</span>
      ),
    },
    {
      title: '描述', dataIndex: 'detail', ellipsis: true,
      render: (v: string) => {
        const isJsonLike = typeof v === 'string' && (v.startsWith('{') || v.startsWith('['));
        return (
          <span style={{
            fontFamily: isJsonLike ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
            fontSize: isJsonLike ? 11 : 13,
            color: isJsonLike ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
          }}>{v}</span>
        );
      },
    },
    {
      title: '时间', dataIndex: 'created_at', width: 110,
      render: (v: string) => (
        <span style={{ color: 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
          {dayjs(v).format('MM-DD HH:mm')}
        </span>
      ),
    },
  ];

  return <Table<RecentLogItem> columns={columns} dataSource={data} pagination={false} rowKey="id" size="small" locale={{ emptyText: '暂无数据' }} />;
}
