import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Statistic, Table, Tag, Spin } from 'antd';
import type { TableColumnsType } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '@/components/common/PageHeader';
import { useHallStore } from '@/stores/hallStore';
import { analyticsApi } from '@/api/analytics';
import { logApi } from '@/api/log';
import { queryKeys } from '@/api/queryKeys';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import type { OperationDailyStat, OperationLogItem } from '@/api/gen/client';
import dayjs from 'dayjs';

export default function OverviewPage({ embedded }: { embedded?: boolean } = {}) {
  const hallId = useHallStore((s) => s.selectedHallId);
  const tokens = useThemeTokens();

  const today = dayjs().format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');

  // Operation stats (last 7 days)
  const opParams = {
    hall_id: hallId!,
    start_date: weekAgo,
    end_date: today,
  };
  const { data: opStats, isLoading: opLoading } = useQuery({
    queryKey: queryKeys.operationStats(opParams as unknown as Record<string, unknown>),
    queryFn: () => analyticsApi.getOperationStats(opParams),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  // Recent operation logs
  const logParams = {
    page: 1,
    page_size: 10,
    ...(hallId ? { hall_id: hallId } : {}),
  };
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: queryKeys.operationLogs(logParams as Record<string, unknown>),
    queryFn: () => logApi.getLogs(logParams),
    select: (res) => res.data.data,
    refetchInterval: 30000,
  });

  // Aggregate today's op count
  const todayOps = (opStats ?? [])
    .filter((s: OperationDailyStat) => s.date === today)
    .reduce((sum: number, s: OperationDailyStat) => sum + s.op_count, 0);

  // Aggregate total ops for the week
  const totalOps = (opStats ?? []).reduce((sum: number, s: OperationDailyStat) => sum + s.op_count, 0);

  // Build chart data — group by date
  const dateMap = new Map<string, number>();
  (opStats ?? []).forEach((s: OperationDailyStat) => {
    dateMap.set(s.date, (dateMap.get(s.date) ?? 0) + s.op_count);
  });
  const chartDates = Array.from(dateMap.keys()).sort();
  const chartValues = chartDates.map((d) => dateMap.get(d) ?? 0);

  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    grid: { top: 20, right: 20, bottom: 30, left: 50 },
    xAxis: {
      type: 'category' as const,
      data: chartDates.map((d) => dayjs(d).format('MM-DD')),
    },
    yAxis: { type: 'value' as const },
    series: [
      {
        type: 'line',
        data: chartValues,
        smooth: true,
        areaStyle: { opacity: 0.15 },
        itemStyle: { color: tokens.primary },
      },
    ],
  };

  const logColumns: TableColumnsType<OperationLogItem> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户', dataIndex: 'user_name', width: 100 },
    {
      title: '操作',
      dataIndex: 'action',
      width: 120,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    { title: '描述', dataIndex: 'detail', ellipsis: true },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
  ];

  return (
    <div>
      {!embedded && <PageHeader title="运行概览" description="App 在线状态、操作监控与实时日志" />}

      {!hallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅查看运行概览
        </div>
      ) : opLoading ? (
        <Spin style={{ display: 'flex', justifyContent: 'center', marginTop: 60 }} />
      ) : (
        <>
          {/* Stat cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8}>
              <Card>
                <Statistic title="今日操作次数" value={todayOps} valueStyle={{ color: 'var(--color-primary)' }} />
              </Card>
            </Col>
            <Col xs={12} sm={8}>
              <Card>
                <Statistic title="近 7 天操作次数" value={totalOps} />
              </Card>
            </Col>
            <Col xs={12} sm={8}>
              <Card>
                <Statistic
                  title="操作类型数"
                  value={new Set((opStats ?? []).map((s: OperationDailyStat) => s.action_type)).size}
                />
              </Card>
            </Col>
          </Row>

          {/* Operation trend chart */}
          <Card title="操作趋势（近 7 天）" style={{ marginBottom: 24 }}>
            {chartDates.length > 0 ? (
              <ReactECharts option={chartOption} style={{ height: 280 }} />
            ) : (
              <div style={{ color: 'var(--color-outline)', textAlign: 'center', padding: 40 }}>暂无数据</div>
            )}
          </Card>

          {/* Recent operation logs */}
          <Card title="最近操作日志">
            <Table<OperationLogItem>
              columns={logColumns}
              dataSource={logsData?.list ?? []}
              loading={logsLoading}
              pagination={false}
              rowKey="id"
              size="small"
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
