/**
 * Phase 11.4：授权审计日志 · 查询 + 导出。
 *
 * 真相源：02-server/internal/interfaces/api/audit_handler.go 的 AuthzAuditHandler。
 * Tab 占位（Phase 6 AuditLogPlaceholder）在此替换。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  Alert,
  Button,
  DatePicker,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import Can from '@/components/authz/Can';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { authzApi, type AuditLogRow } from '@/api/authz';

const { RangePicker } = DatePicker;

const STATUS_COLOR: Record<string, string> = { success: 'green', failure: 'red' };
const ACCOUNT_LABEL: Record<string, string> = { internal: '内部', vendor: '供应商' };

export default function AuditLogListPage() {
  const [actorUserId, setActorUserId] = useState<string>('');
  const [actionCode, setActionCode] = useState<string>('');
  const [resourceType, setResourceType] = useState<string>('');
  const [resourceId, setResourceId] = useState<string>('');
  const [status, setStatus] = useState<'success' | 'failure' | ''>('');
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const queryParams = useMemo(
    () => ({
      actor_user_id: actorUserId ? Number(actorUserId) : undefined,
      action_code: actionCode || undefined,
      resource_type: resourceType || undefined,
      resource_id: resourceId || undefined,
      status: status || undefined,
      from: range[0] ? range[0].toISOString() : undefined,
      to: range[1] ? range[1].toISOString() : undefined,
      page_size: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [actorUserId, actionCode, resourceType, resourceId, status, range, page, pageSize],
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['authz', 'audit-logs', queryParams],
    queryFn: () => authzApi.queryAuditLogs(queryParams),
    select: (res) => res.data.data,
    placeholderData: (prev) => prev,
  });

  const list = data?.list ?? [];
  const total = data?.total ?? 0;
  const archiveUsed = data?.archive_used ?? false;

  const columns: TableColumnsType<AuditLogRow> = [
    {
      title: '时间',
      dataIndex: 'occurred_at',
      width: 180,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss.SSS'),
    },
    {
      title: '操作者',
      dataIndex: 'actor_user_id',
      width: 120,
      render: (uid: number, row) => (
        <Space size={4}>
          <span>#{uid}</span>
          <Tag color={row.actor_account_type === 'vendor' ? 'orange' : 'blue'}>
            {ACCOUNT_LABEL[row.actor_account_type] ?? row.actor_account_type}
          </Tag>
        </Space>
      ),
    },
    { title: 'IP', dataIndex: 'actor_ip', width: 130 },
    {
      title: 'Action',
      dataIndex: 'action_code',
      width: 220,
      render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
    },
    {
      title: '资源',
      width: 160,
      render: (_, row) => {
        if (!row.resource_type) return <span style={{ color: '#aaa' }}>—</span>;
        return (
          <span>
            {row.resource_type}#{row.resource_id}
          </span>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => <Tag color={STATUS_COLOR[v]}>{v}</Tag>,
    },
    {
      title: '原因 / 错误',
      render: (_, row) => {
        if (row.status === 'failure') {
          return <Tooltip title={row.error_msg}>{row.error_msg || '—'}</Tooltip>;
        }
        return <Tooltip title={row.reason}>{row.reason || '—'}</Tooltip>;
      },
    },
  ];

  const handleExport = async (reason?: string) => {
    // 走完整下载（不加分页）；reason 作为审计自身的 critical 原因（audit.export）
    const url = authzApi.exportAuditLogsUrl({ ...queryParams, page_size: undefined, offset: undefined });
    const urlWithReason = reason ? `${url}&reason=${encodeURIComponent(reason)}` : url;
    const a = document.createElement('a');
    a.href = urlWithReason;
    a.download = `authz_audit_logs_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div>
      <PageHeader
        title="权限审计"
        description="授权变更 / 风险操作 / 登录登出 / 配置变更——近 90 天 DB，跨 90 天 OSS 冷读。与「监控与分析 → 操作日志」（业务事件）区分开。"
      />

      {archiveUsed && (
        <Alert
          type="info"
          showIcon
          message="本次查询命中归档数据，已合并 DB + OSS 冷读结果（可能需要 3-5 秒）。"
          style={{ marginBottom: 12 }}
        />
      )}

      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          placeholder="操作者 user_id"
          style={{ width: 140 }}
          value={actorUserId}
          onChange={(e) => setActorUserId(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <Input
          allowClear
          placeholder="Action（如 content.edit）"
          style={{ width: 220 }}
          value={actionCode}
          onChange={(e) => setActionCode(e.target.value)}
        />
        <Input
          allowClear
          placeholder="资源类型"
          style={{ width: 120 }}
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
        />
        <Input
          allowClear
          placeholder="资源 ID"
          style={{ width: 120 }}
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
        />
        <Select<'success' | 'failure' | ''>
          allowClear
          placeholder="状态"
          style={{ width: 110 }}
          value={status || undefined}
          onChange={(v) => setStatus((v as 'success' | 'failure') ?? '')}
          options={[
            { label: '成功', value: 'success' },
            { label: '失败', value: 'failure' },
          ]}
        />
        <RangePicker
          showTime
          value={range}
          onChange={(vals) => setRange([vals?.[0] ?? null, vals?.[1] ?? null])}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setPage(1);
            refetch();
          }}
        >
          刷新
        </Button>
        <Can action="audit.export" mode="disable">
          <RiskyActionButton
            action="audit.export"
            icon={<DownloadOutlined />}
            onConfirm={handleExport}
            confirmTitle="导出审计日志"
            confirmContent="导出 CSV 属于关键操作，请输入原因后继续。"
          >
            导出 CSV
          </RiskyActionButton>
        </Can>
      </Space>

      <Table<AuditLogRow>
        rowKey="id"
        size="middle"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={list}
        expandable={{
          rowExpandable: (row) => !!(row.before_value || row.after_value),
          expandedRowRender: (row) => (
            <div style={{ padding: 8, background: 'var(--ant-color-fill-alter)' }}>
              {row.before_value !== undefined && (
                <div>
                  <strong>before:</strong>
                  <pre style={{ margin: 0, fontSize: 12 }}>
                    {JSON.stringify(row.before_value, null, 2)}
                  </pre>
                </div>
              )}
              {row.after_value !== undefined && (
                <div style={{ marginTop: 8 }}>
                  <strong>after:</strong>
                  <pre style={{ margin: 0, fontSize: 12 }}>
                    {JSON.stringify(row.after_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100, 200],
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
          showTotal: (t) => `共 ${t} 条`,
        }}
      />
    </div>
  );
}
