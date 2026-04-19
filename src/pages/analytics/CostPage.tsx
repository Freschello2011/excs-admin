import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Statistic, Space, Spin, Table, DatePicker } from 'antd';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { useHallStore } from '@/stores/hallStore';
import { analyticsApi } from '@/api/analytics';
import { queryKeys } from '@/api/queryKeys';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

function formatCost(cny: number): string {
  return `¥ ${cny.toFixed(4)}`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

export default function CostPage() {
  const hallId = useHallStore((s) => s.selectedHallId);
  const [monthValue, setMonthValue] = useState<Dayjs>(dayjs());

  const year = monthValue.year();
  const month = monthValue.month() + 1;

  const params = { hall_id: hallId!, year, month };
  const { data: overview, isLoading } = useQuery({
    queryKey: queryKeys.usageOverview(params as unknown as Record<string, unknown>),
    queryFn: () => analyticsApi.getUsageOverview(params),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  // AI Token detail — single row for the month
  const aiDetail = overview ? [{
    key: 'month',
    period: `${year}-${String(month).padStart(2, '0')}`,
    prompt_tokens: overview.ai_token.prompt_tokens,
    completion_tokens: overview.ai_token.completion_tokens,
    total_tokens: overview.ai_token.total_tokens,
    cost: overview.ai_token.estimated_cost_cny,
  }] : [];

  const aiColumns: TableColumnsType<typeof aiDetail[0]> = [
    { title: '周期', dataIndex: 'period', width: 100 },
    { title: 'Prompt Tokens', dataIndex: 'prompt_tokens', width: 140 },
    { title: 'Completion Tokens', dataIndex: 'completion_tokens', width: 160 },
    { title: 'Total Tokens', dataIndex: 'total_tokens', width: 120 },
    {
      title: '费用',
      dataIndex: 'cost',
      width: 120,
      render: (v: number) => formatCost(v),
    },
  ];

  // OSS detail — single row
  const ossDetail = overview ? [{
    key: 'oss',
    total_size: overview.oss_usage.total_size_bytes,
    total_gb: overview.oss_usage.total_size_gb,
    cost: overview.oss_usage.estimated_cost_cny,
  }] : [];

  const ossColumns: TableColumnsType<typeof ossDetail[0]> = [
    {
      title: '存储大小',
      dataIndex: 'total_size',
      render: (v: number) => formatSize(v),
    },
    {
      title: '存储 (GB)',
      dataIndex: 'total_gb',
      width: 120,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: '费用',
      dataIndex: 'cost',
      width: 120,
      render: (v: number) => formatCost(v),
    },
  ];

  return (
    <div>
      <PageHeader title="费用分析" description="AI 模型费用与 OSS 存储费用估算" />

      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker
          picker="month"
          value={monthValue}
          onChange={(v) => v && setMonthValue(v)}
        />
      </Space>

      {!hallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅查看费用分析
        </div>
      ) : isLoading ? (
        <Spin style={{ display: 'flex', justifyContent: 'center', marginTop: 60 }} />
      ) : overview ? (
        <>
          {/* Cost overview cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="AI 模型费用"
                  value={overview.ai_token.estimated_cost_cny}
                  precision={4}
                  prefix="¥"
                  valueStyle={{ color: 'var(--color-primary)' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="OSS 存储费用"
                  value={overview.oss_usage.estimated_cost_cny}
                  precision={4}
                  prefix="¥"
                  valueStyle={{ color: 'var(--color-success)' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="合计费用"
                  value={overview.total_cost_cny}
                  precision={4}
                  prefix="¥"
                  valueStyle={{ color: 'var(--color-warning)' }}
                />
              </Card>
            </Col>
          </Row>

          {/* AI Token detail */}
          <Card title="AI Token 明细" style={{ marginBottom: 24 }}>
            <Table
              columns={aiColumns}
              dataSource={aiDetail}
              pagination={false}
              rowKey="key"
              size="small"
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>

          {/* OSS storage detail */}
          <Card title="OSS 存储明细">
            <Table
              columns={ossColumns}
              dataSource={ossDetail}
              pagination={false}
              rowKey="key"
              size="small"
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
