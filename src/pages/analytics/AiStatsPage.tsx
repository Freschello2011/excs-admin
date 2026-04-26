import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Statistic, Space, Spin, Table, DatePicker } from 'antd';
import type { TableColumnsType } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '@/components/common/PageHeader';
import { useHallStore } from '@/stores/hallStore';
import { analyticsApi } from '@/api/analytics';
import { queryKeys } from '@/api/queryKeys';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import type { AiInteractionDailyStat, AiKeywordStat } from '@/api/gen/client';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

export default function AiStatsPage({ embedded }: { embedded?: boolean } = {}) {
  const hallId = useHallStore((s) => s.selectedHallId);
  const tokens = useThemeTokens();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');

  const params = { hall_id: hallId!, start_date: startDate, end_date: endDate, top_n: 20 };
  const { data: aiStats, isLoading } = useQuery({
    queryKey: queryKeys.aiStats(params as unknown as Record<string, unknown>),
    queryFn: () => analyticsApi.getAiStats(params),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  const interactions = aiStats?.interactions ?? [];
  const topKeywords = aiStats?.top_keywords ?? [];

  // Aggregations
  const totalSessions = interactions.reduce((s: number, r: AiInteractionDailyStat) => s + r.session_count, 0);
  const totalRounds = interactions.reduce((s: number, r: AiInteractionDailyStat) => s + r.total_rounds, 0);
  const avgRounds = totalSessions > 0 ? (totalRounds / totalSessions).toFixed(1) : '-';
  const avgDuration = interactions.length > 0
    ? (interactions.reduce((s: number, r: AiInteractionDailyStat) => s + r.avg_duration_sec, 0) / interactions.length).toFixed(1)
    : '-';

  // Daily trend — group by date
  const dateMap = new Map<string, { sessions: number; rounds: number }>();
  interactions.forEach((s: AiInteractionDailyStat) => {
    const prev = dateMap.get(s.date) ?? { sessions: 0, rounds: 0 };
    dateMap.set(s.date, {
      sessions: prev.sessions + s.session_count,
      rounds: prev.rounds + s.total_rounds,
    });
  });
  const chartDates = Array.from(dateMap.keys()).sort();

  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['会话数', '对话轮次'] },
    grid: { top: 40, right: 60, bottom: 30, left: 60 },
    xAxis: {
      type: 'category' as const,
      data: chartDates.map((d) => dayjs(d).format('MM-DD')),
    },
    yAxis: [
      { type: 'value' as const, name: '会话数' },
      { type: 'value' as const, name: '轮次', splitLine: { show: false } },
    ],
    series: [
      {
        name: '会话数',
        type: 'line',
        data: chartDates.map((d) => dateMap.get(d)!.sessions),
        smooth: true,
        itemStyle: { color: tokens.primary },
      },
      {
        name: '对话轮次',
        type: 'line',
        yAxisIndex: 1,
        data: chartDates.map((d) => dateMap.get(d)!.rounds),
        smooth: true,
        itemStyle: { color: tokens.warning },
      },
    ],
  };

  // Keywords table
  const keywordColumns: TableColumnsType<AiKeywordStat> = [
    {
      title: '排名',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    { title: '关键词', dataIndex: 'keyword' },
    { title: '命中次数', dataIndex: 'hit_count', width: 100, sorter: (a, b) => a.hit_count - b.hit_count },
  ];

  return (
    <div>
      {!embedded && <PageHeader title="AI 互动统计" description="AI 会话数据与热门关键词" />}

      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker
          value={dateRange}
          onChange={(dates) => {
            if (dates?.[0] && dates?.[1]) {
              setDateRange([dates[0], dates[1]]);
            }
          }}
        />
      </Space>

      {!hallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅查看 AI 互动统计
        </div>
      ) : isLoading ? (
        <Spin style={{ display: 'flex', justifyContent: 'center', marginTop: 60 }} />
      ) : (
        <>
          {/* Summary cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic title="总会话数" value={totalSessions} valueStyle={{ color: 'var(--color-primary)' }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic title="总对话轮次" value={totalRounds} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic title="平均轮次/会话" value={avgRounds} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card>
                <Statistic title="平均时长(秒)" value={avgDuration} />
              </Card>
            </Col>
          </Row>

          {/* AI interaction trend chart */}
          <Card title="互动趋势" style={{ marginBottom: 24 }}>
            {chartDates.length > 0 ? (
              <ReactECharts option={chartOption} style={{ height: 300 }} />
            ) : (
              <div style={{ color: 'var(--color-outline)', textAlign: 'center', padding: 40 }}>暂无数据</div>
            )}
          </Card>

          {/* Top keywords */}
          <Card title={`热门关键词 Top ${topKeywords.length}`}>
            <Table<AiKeywordStat>
              columns={keywordColumns}
              dataSource={topKeywords}
              pagination={false}
              rowKey={(r) => `${r.keyword}-${r.hit_count}`}
              size="small"
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
