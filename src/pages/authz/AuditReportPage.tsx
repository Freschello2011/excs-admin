/**
 * Phase 11.7：合规报表页。
 *
 * 5 个指标卡：
 *   1. 近 30 天权限变更次数（user.grant / user.manage / vendor.manage）
 *   2. 近 30 天风险操作次数（按 action 分布饼图）
 *   3. 近 30 天供应商上传量（按天折线）
 *   4. 授权分布（按模板柱）
 *   5. 快到期 Grant 数量 + 列表
 *
 * 图表库：echarts-for-react（全局已引；analytics 页也用）。
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Row, Statistic, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import PageHeader from '@/components/common/PageHeader';
import {
  authzApi,
  type GrantExpiringSummary,
  type KeyCount,
  type DatePointInt,
} from '@/api/authz';
import { useCan } from '@/lib/authz/can';
import type { RoleTemplate, ScopeType } from '@/api/gen/client';
import { useActionsMap } from '@/lib/authz/useActionsMap';
import ScopeTag from '@/components/authz/common/ScopeTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';

const DAYS = 30;

function PieCard({ title, data }: { title: string; data?: KeyCount[] }) {
  if (!data || data.length === 0) {
    return (
      <Card title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
      </Card>
    );
  }
  const option = {
    tooltip: { trigger: 'item' as const },
    series: [
      {
        type: 'pie' as const,
        radius: ['35%', '68%'],
        data: data.map((d) => ({ name: d.key, value: d.count })),
        label: { formatter: '{b}: {c}' },
      },
    ],
  };
  return (
    <Card title={title}>
      <ReactECharts option={option} style={{ height: 280 }} notMerge lazyUpdate />
    </Card>
  );
}

function LineCard({ title, data }: { title: string; data?: DatePointInt[] }) {
  if (!data || data.length === 0) {
    return (
      <Card title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
      </Card>
    );
  }
  const option = {
    tooltip: { trigger: 'axis' as const },
    xAxis: { type: 'category' as const, data: data.map((d) => d.date) },
    yAxis: { type: 'value' as const },
    series: [{ type: 'line' as const, smooth: true, data: data.map((d) => d.value) }],
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
  };
  return (
    <Card title={title}>
      <ReactECharts option={option} style={{ height: 280 }} notMerge lazyUpdate />
    </Card>
  );
}

function BarCard({ title, data }: { title: string; data?: KeyCount[] }) {
  if (!data || data.length === 0) {
    return (
      <Card title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
      </Card>
    );
  }
  const option = {
    tooltip: { trigger: 'axis' as const },
    xAxis: { type: 'category' as const, data: data.map((d) => d.key) },
    yAxis: { type: 'value' as const },
    series: [{ type: 'bar' as const, data: data.map((d) => d.count) }],
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
  };
  return (
    <Card title={title}>
      <ReactECharts option={option} style={{ height: 280 }} notMerge lazyUpdate />
    </Card>
  );
}

export default function AuditReportPage() {
  const actionsMap = useActionsMap();
  // 守门：模板列表归 user.view 域，hall_admin 不持有此 action，无权时跳过请求，
  // 下游柱图自动回退到显示 raw template_code（templateCodeMap.get() 返 undefined）。
  const canViewUsers = useCan('user.view');

  const { data: templates } = useQuery({
    queryKey: ['authz', 'role-templates'],
    queryFn: () => authzApi.listTemplates(),
    select: (res) => res.data.data?.list ?? [],
    enabled: canViewUsers,
  });

  const { data: halls } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 200 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 200 }),
    select: (res) => res.data.data?.list ?? [],
  });

  const templateCodeMap = useMemo(() => {
    const m = new Map<string, RoleTemplate>();
    (templates ?? []).forEach((t) => m.set(t.code, t));
    return m;
  }, [templates]);

  const hallNameMap = useMemo(() => {
    const m = new Map<number, string>();
    (halls ?? []).forEach((h) => m.set(h.id, h.name));
    return m;
  }, [halls]);

  const grantChangesQ = useQuery({
    queryKey: ['authz', 'reports', 'grant-changes', DAYS],
    queryFn: () => authzApi.reportGrantChanges(DAYS),
    select: (r) => r.data.data,
  });
  const riskyQ = useQuery({
    queryKey: ['authz', 'reports', 'risky', DAYS],
    queryFn: () => authzApi.reportRiskyActions(DAYS),
    select: (r) => r.data.data,
  });
  const uploadsQ = useQuery({
    queryKey: ['authz', 'reports', 'uploads', DAYS],
    queryFn: () => authzApi.reportVendorUploads(DAYS),
    select: (r) => r.data.data,
  });
  const distQ = useQuery({
    queryKey: ['authz', 'reports', 'distribution'],
    queryFn: () => authzApi.reportGrantDistribution(),
    select: (r) => r.data.data,
  });
  const expiringQ = useQuery({
    queryKey: ['authz', 'reports', 'expiring', DAYS],
    queryFn: () => authzApi.reportGrantsExpiring(DAYS),
    select: (r) => r.data.data,
  });

  // 把 risky 饼图的 key（action_code）映射为业主可读的中文名
  const riskyPretty = useMemo<KeyCount[] | undefined>(() => {
    if (!riskyQ.data?.per_kind) return undefined;
    return riskyQ.data.per_kind.map((d) => {
      const def = actionsMap.get(d.key);
      return { key: def?.name_zh ? `${def.name_zh}` : d.key, count: d.count };
    });
  }, [riskyQ.data?.per_kind, actionsMap]);

  // 把模板分布柱图的 key（template_code）映射为模板中文名
  const distPretty = useMemo<KeyCount[] | undefined>(() => {
    if (!distQ.data?.per_template) return undefined;
    return distQ.data.per_template.map((d) => {
      const t = templateCodeMap.get(d.key);
      return { key: t?.name_zh ? t.name_zh : d.key, count: d.count };
    });
  }, [distQ.data?.per_template, templateCodeMap]);

  return (
    <div>
      <PageHeader
        title="合规报表"
        description={`近 ${DAYS} 天授权变更 / 风险操作 / 供应商上传 · 授权模板分布 · 快到期 Grant 清单`}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card loading={grantChangesQ.isLoading}>
            <Statistic
              title={`近 ${DAYS} 天权限变更次数`}
              value={grantChangesQ.data?.total ?? 0}
              suffix="次"
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={riskyQ.isLoading}>
            <Statistic
              title={`近 ${DAYS} 天风险操作次数`}
              value={riskyQ.data?.total ?? 0}
              suffix="次"
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={uploadsQ.isLoading}>
            <Statistic
              title={`近 ${DAYS} 天供应商上传`}
              value={uploadsQ.data?.total ?? 0}
              suffix="次"
            />
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <PieCard title="风险操作分布" data={riskyPretty} />
        </Col>
        <Col xs={24} md={12}>
          <LineCard title="供应商上传趋势（按天）" data={uploadsQ.data?.per_day} />
        </Col>

        <Col xs={24} md={12}>
          <BarCard title="授权模板分布（当前生效授权）" data={distPretty} />
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={`即将到期的授权（未来 ${DAYS} 天）共 ${expiringQ.data?.total ?? 0} 条`}
            loading={expiringQ.isLoading}
          >
            <Table<GrantExpiringSummary>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={expiringQ.data?.list ?? []}
              scroll={{ y: 230 }}
              columns={[
                { title: '授权编号', dataIndex: 'id', width: 90 },
                { title: '用户', dataIndex: 'user_id', width: 90, render: (v) => `#${v}` },
                {
                  title: '角色模板',
                  dataIndex: 'template_code',
                  render: (v: string) => {
                    const t = templateCodeMap.get(v);
                    const label = t?.name_zh ?? v;
                    return (
                      <Tooltip title={label !== v ? `代码：${v}` : ''}>
                        <Tag color="blue">{label}</Tag>
                      </Tooltip>
                    );
                  },
                },
                {
                  title: '授权范围',
                  render: (_, row) => (
                    <ScopeTag
                      scopeType={row.scope_type as ScopeType}
                      scopeId={row.scope_id}
                      hallNameMap={hallNameMap}
                    />
                  ),
                },
                {
                  title: '到期时间',
                  dataIndex: 'expires_at',
                  render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
