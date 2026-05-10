/**
 * Phase 11.4：授权审计日志 · 查询 + 导出。
 *
 * 真相源：02-server/internal/interfaces/api/audit_handler.go 的 AuthzAuditHandler。
 * Tab 占位（Phase 6 AuditLogPlaceholder）在此替换。
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Typography,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import Can from '@/components/authz/Can';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { authzApi, type AuditLogRow } from '@/api/authz';
import { useActionsMap } from '@/lib/authz/useActionsMap';
import { DOMAIN_LABELS } from '@/lib/authz/actionMeta';
import { formatResourceText, RESOURCE_TYPE_LABELS } from '@/lib/authz/resourceMeta';
import {
  ACCOUNT_TYPE_LABELS,
  formatActionDisplay,
} from '@/lib/authz/auditFormatters';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export default function AuditLogListPage({ embedded }: { embedded?: boolean } = {}) {
  const actionsMap = useActionsMap();
  // URL 同步 filter，便于「按人视角」深链跳转：?actor_user_id=4&action_code=user.grant
  const [searchParams, setSearchParams] = useSearchParams();
  const [actorUserId, setActorUserId] = useState<string>(
    () => searchParams.get('actor_user_id') ?? '',
  );
  const [actionCode, setActionCode] = useState<string>(
    () => searchParams.get('action_code') ?? '',
  );
  const [resourceType, setResourceType] = useState<string>(
    () => searchParams.get('resource_type') ?? '',
  );
  const [resourceId, setResourceId] = useState<string>(
    () => searchParams.get('resource_id') ?? '',
  );
  const [status, setStatus] = useState<'success' | 'failure' | ''>(() => {
    const v = searchParams.get('status');
    return v === 'success' || v === 'failure' ? v : '';
  });
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null]>(() => {
    const f = searchParams.get('from');
    const t = searchParams.get('to');
    return [f ? dayjs(f) : null, t ? dayjs(t) : null];
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // filter → URL 反向同步（去掉空值；不写 page/pageSize 避免污染历史栈）
  // 保留外部传入的非自身 key（例如父级 LogsHubPage 的 ?tab=authz-audit），
  // 只增删自己负责的 7 个 filter 键，避免在 embedded 模式下抹掉父级 tab 状态。
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDelete = (k: string, v: string) => { v ? next.set(k, v) : next.delete(k); };
    setOrDelete('actor_user_id', actorUserId);
    setOrDelete('action_code', actionCode);
    setOrDelete('resource_type', resourceType);
    setOrDelete('resource_id', resourceId);
    setOrDelete('status', status);
    setOrDelete('from', range[0] ? range[0].toISOString() : '');
    setOrDelete('to', range[1] ? range[1].toISOString() : '');
    setSearchParams(next, { replace: true });
    // searchParams 故意从依赖里排除：当 setSearchParams 写回时会触发 hook 重跑死循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorUserId, actionCode, resourceType, resourceId, status, range, setSearchParams]);

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
      width: 200,
      render: (uid: number, row) => {
        const accountLabel = ACCOUNT_TYPE_LABELS[row.actor_account_type] ?? row.actor_account_type;
        // 文本主显 "用户 #5"，账号类型用彩色 Tag 单独区分（避免和文本里的"内部"重复）
        return (
          <Space size={4}>
            <span>{`用户 #${uid}`}</span>
            {accountLabel && (
              <Tag
                color={row.actor_account_type === 'vendor' ? 'orange' : 'blue'}
                style={{ marginInlineEnd: 0 }}
              >
                {accountLabel}
              </Tag>
            )}
          </Space>
        );
      },
    },
    { title: 'IP', dataIndex: 'actor_ip', width: 130 },
    {
      title: '操作',
      dataIndex: 'action_code',
      width: 220,
      render: (v: string) => {
        const display = formatActionDisplay(v, actionsMap, DOMAIN_LABELS);
        const tooltipParts: string[] = [`代码：${v}`];
        if (display.domainLabel) tooltipParts.push(`所属域：${display.domainLabel}`);
        if (display.risk) tooltipParts.push(`风险：${display.risk}`);
        if (display.coveredApis.length > 0) {
          tooltipParts.push(`覆盖：${display.coveredApis.join(' / ')}`);
        }
        return (
          <Tooltip title={tooltipParts.join('\n')} overlayStyle={{ whiteSpace: 'pre-line' }}>
            <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span>{display.label}</span>
              {display.label !== v && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  <code>{v}</code>
                </Text>
              )}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '资源',
      width: 160,
      render: (_, row) => {
        if (!row.resource_type) return <span style={{ color: '#aaa' }}>—</span>;
        const text = formatResourceText(row.resource_type, row.resource_id);
        const tooltipText = `代码：${row.resource_type}${row.resource_id ? `#${row.resource_id}` : ''}`;
        return (
          <Tooltip title={tooltipText}>
            <span>{text}</span>
          </Tooltip>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'success' ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>
          {v === 'success' ? '成功' : v === 'failure' ? '失败' : v}
        </Tag>
      ),
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

  /** 操作选择器选项：按业务域分组（"操作日志查询" / "授权用户" 这种业主可读名优先） */
  const actionOptions = useMemo(() => {
    const groups = new Map<string, { label: string; value: string }[]>();
    actionsMap.forEach((def) => {
      const domainLabel = DOMAIN_LABELS[def.domain] ?? def.domain;
      const arr = groups.get(domainLabel) ?? [];
      arr.push({ label: `${def.name_zh}（${def.code}）`, value: def.code });
      groups.set(domainLabel, arr);
    });
    return Array.from(groups.entries())
      .map(([label, options]) => ({ label, options: options.sort((a, b) => a.value.localeCompare(b.value)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [actionsMap]);

  /** 资源类型选择器选项 */
  const resourceTypeOptions = useMemo(
    () =>
      Object.entries(RESOURCE_TYPE_LABELS)
        .map(([value, label]) => ({ label: `${label}（${value}）`, value }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    [],
  );

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
      {!embedded && (
        <PageHeader
          title="权限审计"
          description="谁在什么时间、对什么资源做了什么——含授权变更、风险操作、登录登出、配置变更。近 90 天数据可即时查询，更早的从归档自动合并。"
        />
      )}

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
          placeholder="操作者用户 ID"
          style={{ width: 150 }}
          value={actorUserId}
          onChange={(e) => setActorUserId(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <Select
          allowClear
          showSearch
          placeholder="操作（按域分组）"
          style={{ width: 280 }}
          value={actionCode || undefined}
          onChange={(v) => setActionCode(v ?? '')}
          options={actionOptions}
          optionFilterProp="label"
          filterOption={(input, option) => {
            // 同时按中文名 / code 搜索
            const text = String(option?.label ?? '').toLowerCase();
            return text.includes(input.toLowerCase());
          }}
        />
        <Select
          allowClear
          showSearch
          placeholder="资源类型"
          style={{ width: 180 }}
          value={resourceType || undefined}
          onChange={(v) => setResourceType(v ?? '')}
          options={resourceTypeOptions}
          optionFilterProp="label"
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
