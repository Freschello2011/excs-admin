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
import type { PlaybackDailyStat } from '@/api/gen/client';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h} 时 ${m} 分`;
}

export default function ContentStatsPage({ embedded }: { embedded?: boolean } = {}) {
  const hallId = useHallStore((s) => s.selectedHallId);
  const tokens = useThemeTokens();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');

  const params = { hall_id: hallId!, start_date: startDate, end_date: endDate };
  const { data: stats, isLoading } = useQuery({
    queryKey: queryKeys.playbackStats(params as unknown as Record<string, unknown>),
    queryFn: () => analyticsApi.getPlaybackStats(params),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  // Aggregations
  const totalPlayCount = (stats ?? []).reduce((s: number, r: PlaybackDailyStat) => s + r.play_count, 0);
  const totalDuration = (stats ?? []).reduce((s: number, r: PlaybackDailyStat) => s + r.total_duration_sec, 0);

  // Daily trend — group by date
  const dateMap = new Map<string, { plays: number; duration: number }>();
  (stats ?? []).forEach((s: PlaybackDailyStat) => {
    const prev = dateMap.get(s.date) ?? { plays: 0, duration: 0 };
    dateMap.set(s.date, {
      plays: prev.plays + s.play_count,
      duration: prev.duration + s.total_duration_sec,
    });
  });
  const chartDates = Array.from(dateMap.keys()).sort();

  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['播放次数', '播放时长(分)'] },
    grid: { top: 40, right: 60, bottom: 30, left: 60 },
    xAxis: {
      type: 'category' as const,
      data: chartDates.map((d) => dayjs(d).format('MM-DD')),
    },
    yAxis: [
      { type: 'value' as const, name: '次数' },
      { type: 'value' as const, name: '分钟', splitLine: { show: false } },
    ],
    series: [
      {
        name: '播放次数',
        type: 'line',
        data: chartDates.map((d) => dateMap.get(d)!.plays),
        smooth: true,
        itemStyle: { color: tokens.primary },
      },
      {
        name: '播放时长(分)',
        type: 'line',
        yAxisIndex: 1,
        data: chartDates.map((d) => Math.round(dateMap.get(d)!.duration / 60)),
        smooth: true,
        itemStyle: { color: tokens.success },
      },
    ],
  };

  // Hot content — group by content_id, rank by play_count
  const contentMap = new Map<number, { content_id: number; play_count: number; total_duration_sec: number }>();
  (stats ?? []).forEach((s: PlaybackDailyStat) => {
    const prev = contentMap.get(s.content_id) ?? { content_id: s.content_id, play_count: 0, total_duration_sec: 0 };
    contentMap.set(s.content_id, {
      content_id: s.content_id,
      play_count: prev.play_count + s.play_count,
      total_duration_sec: prev.total_duration_sec + s.total_duration_sec,
    });
  });
  const hotContent = Array.from(contentMap.values())
    .sort((a, b) => b.play_count - a.play_count)
    .slice(0, 10);

  const hotColumns: TableColumnsType<typeof hotContent[0]> = [
    {
      title: '排名',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    { title: '内容 ID', dataIndex: 'content_id', width: 100 },
    { title: '播放次数', dataIndex: 'play_count', width: 100, sorter: (a, b) => a.play_count - b.play_count },
    {
      title: '总时长',
      dataIndex: 'total_duration_sec',
      width: 120,
      render: (v: number) => formatDuration(v),
    },
  ];

  return (
    <div>
      {!embedded && <PageHeader title="内容统计" description="播放数据统计与热门内容排行" />}

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
          请先在顶栏选择展厅查看内容统计
        </div>
      ) : isLoading ? (
        <Spin style={{ display: 'flex', justifyContent: 'center', marginTop: 60 }} />
      ) : (
        <>
          {/* Summary cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8}>
              <Card>
                <Statistic title="总播放次数" value={totalPlayCount} valueStyle={{ color: 'var(--color-primary)' }} />
              </Card>
            </Col>
            <Col xs={12} sm={8}>
              <Card>
                <Statistic title="总播放时长" value={formatDuration(totalDuration)} />
              </Card>
            </Col>
            <Col xs={12} sm={8}>
              <Card>
                <Statistic title="内容数量" value={contentMap.size} />
              </Card>
            </Col>
          </Row>

          {/* Playback trend chart */}
          <Card title="播放趋势" style={{ marginBottom: 24 }}>
            {chartDates.length > 0 ? (
              <ReactECharts option={chartOption} style={{ height: 300 }} />
            ) : (
              <div style={{ color: 'var(--color-outline)', textAlign: 'center', padding: 40 }}>暂无数据</div>
            )}
          </Card>

          {/* Hot content ranking */}
          <Card title="热门内容 Top 10">
            <Table
              columns={hotColumns}
              dataSource={hotContent}
              pagination={false}
              rowKey="content_id"
              size="small"
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
