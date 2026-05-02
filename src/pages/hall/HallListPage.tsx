import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  Input,
  Select,
  Space,
  Button,
  Pagination,
  Tag,
  Popover,
  Spin,
  Dropdown,
  Modal,
  Segmented,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType, MenuProps } from 'antd';
import {
  ExclamationCircleFilled,
  SyncOutlined,
  DownOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import type {
  HallListItem,
  HallStatus,
  MasterCandidateDTO,
  OperationMode,
} from '@/api/gen/client';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '正常' },
  { value: 'grace', label: '宽限期' },
  { value: 'expired', label: '已过期' },
];

/* ===================== OperationMode 4 态（PRD §三）===================== */

const OP_MODE_ORDER: OperationMode[] = [
  'commissioning',
  'production',
  'maintenance',
  'paused',
];

interface OpModeMeta {
  label: string;
  /** antd Tag color preset；mockup 1:1 对账 */
  color: 'processing' | 'success' | 'warning' | 'default';
  /** 菜单项 desc — 与 mockup §AFTER Dropdown 对齐 */
  desc: string;
}

const OP_MODE_META: Record<OperationMode, OpModeMeta> = {
  commissioning: {
    label: '调试期',
    color: 'processing',
    desc: 'App 升级实时生效，便于 OTA 联调',
  },
  production: {
    label: '正式运营',
    color: 'success',
    desc: '启动后 30s 内升级 + 非营业时段',
  },
  maintenance: {
    label: '检修期',
    color: 'warning',
    desc: '同调试期，立即升级',
  },
  paused: {
    label: '暂停',
    color: 'default',
    desc: '不升级、不告警',
  },
};

/** 后端默认 commissioning（migration 默认值）；列表项 operation_mode 是 optional，兜底用 commissioning。 */
function resolveOpMode(hall: HallListItem): OperationMode {
  return (hall.operation_mode ?? 'commissioning') as OperationMode;
}

const REASON_ZH: Record<string, string> = {
  bootstrap: '服务启动',
  master_offline: '原主控离线',
  priority_promote: '优先级调整',
  manual_override: '管理员手动',
  no_candidate: '候补全离线',
};

/** Hover 卡片：lazy 拉 master-status 显示候补队列 */
function MasterCandidatesPopover({ hallId }: { hallId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hallMasterStatus(hallId),
    queryFn: () => hallApi.getHallMasterStatus(hallId),
    select: (res) => res.data.data,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <div style={{ width: 240, padding: 8 }}>
        <Spin size="small" /> 加载候补队列...
      </div>
    );
  }
  if (!data) return null;
  return (
    <div style={{ width: 280, maxHeight: 320, overflowY: 'auto' }}>
      <div style={{ marginBottom: 8, color: 'rgba(0,0,0,0.55)', fontSize: 12 }}>
        候补队列（按优先级 / sort_order）
      </div>
      {(data.candidates ?? []).length === 0 ? (
        <div style={{ color: 'rgba(0,0,0,0.45)' }}>该展厅尚无展项</div>
      ) : (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {(data.candidates ?? []).map((c: MasterCandidateDTO) => (
            <div
              key={c.exhibit_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 6px',
                background: c.is_current_master ? 'rgba(22,119,255,0.06)' : undefined,
                borderRadius: 4,
              }}
            >
              <span style={{ flex: 1 }}>{c.exhibit_name}</span>
              {c.is_current_master && <Tag color="blue">主控</Tag>}
              {c.is_online ? <Tag color="green">在线</Tag> : <Tag>离线</Tag>}
            </div>
          ))}
        </Space>
      )}
      {data.last_election_at && (
        <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
          上次切换：{dayjs(data.last_election_at).fromNow()}
          {data.last_election_reason
            ? ` · ${REASON_ZH[data.last_election_reason] ?? data.last_election_reason}`
            : ''}
        </div>
      )}
    </div>
  );
}

interface CurrentMasterCellProps {
  hall: HallListItem;
}

function CurrentMasterCell({ hall }: CurrentMasterCellProps) {
  const masterId = hall.current_master_exhibit_id ?? null;
  const masterName = hall.current_master_exhibit_name ?? '';
  const reason = hall.last_election_reason;
  const noCandidate = reason === 'no_candidate';
  // master_auto_failback 在 v2 后端是 NOT NULL DEFAULT true，但 hall_master v2 部署前
  // 老 list 接口不返该字段（undefined）；这里兜底 true 避免误标"manual"。
  const autoFailback = hall.master_auto_failback ?? true;

  const tooltipReason = reason ? REASON_ZH[reason] ?? reason : '';
  const cell = (
    <Space size={4}>
      {masterId == null ? (
        <Tag color={noCandidate ? 'error' : 'default'}>
          {noCandidate ? <ExclamationCircleFilled style={{ marginRight: 4 }} /> : null}
          无主控
        </Tag>
      ) : (
        <Tag color="blue">{masterName || `#${masterId}`}</Tag>
      )}
      <Tag color={autoFailback ? 'success' : 'warning'}>
        {autoFailback ? 'auto' : 'manual'}
      </Tag>
      {tooltipReason && reason !== 'no_candidate' && (
        <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>{tooltipReason}</span>
      )}
    </Space>
  );

  return (
    <Popover
      content={<MasterCandidatesPopover hallId={hall.id} />}
      trigger={['hover']}
      placement="left"
      mouseEnterDelay={0.2}
    >
      <span style={{ cursor: 'help' }}>{cell}</span>
    </Popover>
  );
}

interface OperationModeCellProps {
  hall: HallListItem;
  onChange: (hall: HallListItem, next: OperationMode) => void;
}

function OperationModeCell({ hall, onChange }: OperationModeCellProps) {
  const current = resolveOpMode(hall);
  const meta = OP_MODE_META[current];

  const items: MenuProps['items'] = OP_MODE_ORDER.map((mode) => {
    const m = OP_MODE_META[mode];
    const isCurrent = mode === current;
    return {
      key: mode,
      label: (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 200, padding: '2px 0' }}>
          <span style={{ fontWeight: 500 }}>
            {m.label}
            {isCurrent && (
              <span style={{ color: 'rgba(0,0,0,0.45)', fontWeight: 400, marginLeft: 6 }}>
                · 当前
              </span>
            )}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', lineHeight: 1.4 }}>
            {m.desc}
          </span>
        </div>
      ),
      disabled: isCurrent,
    };
  });

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    onChange(hall, key as OperationMode);
  };

  return (
    <Dropdown menu={{ items, onClick: onMenuClick, selectedKeys: [current] }} trigger={['click']}>
      <Tag color={meta.color} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {meta.label} <DownOutlined style={{ fontSize: 9, marginLeft: 2, opacity: 0.55 }} />
      </Tag>
    </Dropdown>
  );
}

/* ===================== 切到 production 二次确认 Modal ===================== */

interface ProductionConfirmModalProps {
  open: boolean;
  hall: HallListItem | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  confirmLoading: boolean;
}

function ProductionConfirmModal({
  open,
  hall,
  onCancel,
  onConfirm,
  confirmLoading,
}: ProductionConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  // 切换 hall / 关闭重开时重置
  const hallId = hall?.id ?? null;
  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [hallId, open]);

  const trimmed = reason.trim();
  const reasonError =
    trimmed.length > 0 && trimmed.length < 5
      ? '原因至少 5 个字符'
      : trimmed.length === 0 && touched
      ? '请填写原因'
      : '';

  const handleOk = () => {
    setTouched(true);
    if (trimmed.length < 5) return;
    onConfirm(trimmed);
  };

  const fromLabel = hall ? OP_MODE_META[resolveOpMode(hall)].label : '';
  const onlineCount = hall?.online_instance_count ?? 0;
  const totalCount = hall?.app_instance_count ?? 0;

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确认切换"
      cancelText="取消"
      okButtonProps={{ danger: true, loading: confirmLoading }}
      title={
        <span>
          <ExclamationCircleFilled style={{ color: '#faad14', marginRight: 8 }} />
          切换至「正式运营」？
        </span>
      }
      width={460}
      destroyOnClose
    >
      {hall && (
        <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', lineHeight: 1.65 }}>
          <p style={{ marginTop: 0, marginBottom: 8 }}>
            <span style={{ color: 'rgba(0,0,0,0.88)', fontWeight: 500 }}>{hall.name}</span>
            ·从「{fromLabel}」切换到「正式运营」后将启用：
          </p>
          <ul style={{ marginTop: 0, marginBottom: 8, paddingLeft: 20 }}>
            <li>
              App 升级仅在
              <span style={{ color: 'rgba(0,0,0,0.88)', fontWeight: 500 }}>启动后 30 秒</span>
              内单次检查
            </li>
            <li>
              白天客流时段
              <span style={{ color: 'rgba(0,0,0,0.88)', fontWeight: 500 }}>不主动升级</span>
              ，延迟到 00:00–08:00 非营业时段
            </li>
            <li>
              MQTT 实时升级广播将被忽略（除标记为
              <span style={{ color: 'rgba(0,0,0,0.88)', fontWeight: 500 }}>紧急补丁</span>
              的版本）
            </li>
            <li>
              影响{' '}
              <span style={{ color: 'rgba(0,0,0,0.88)', fontWeight: 500 }}>
                {onlineCount} / {totalCount}
              </span>{' '}
              台在线 App 实例
            </li>
          </ul>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', marginBottom: 6 }}>
              切换原因 <span style={{ color: '#ff4d4f' }}>*</span>（≥ 5 字，将写入审计日志）
            </div>
            <Input.TextArea
              autoFocus
              rows={2}
              value={reason}
              maxLength={200}
              showCount
              placeholder="例：新展厅 12-15 试运营完成，正式开馆"
              onChange={(e) => {
                setReason(e.target.value);
                setTouched(true);
              }}
              status={reasonError ? 'error' : undefined}
            />
            {reasonError && (
              <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>{reasonError}</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ===================== HallListPage ===================== */

const OP_MODE_FILTER_ALL = 'all' as const;
type OpModeFilter = typeof OP_MODE_FILTER_ALL | OperationMode;

export default function HallListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<HallStatus | 'all'>('all');
  const [opModeFilter, setOpModeFilter] = useState<OpModeFilter>(OP_MODE_FILTER_ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 单独拉一份"全量统计"用于 chip 计数（不受当前过滤/分页影响）
  const { data: statsData } = useQuery({
    queryKey: queryKeys.halls({ stats: 1 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 1000 }),
    select: (res) => res.data.data,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const params = {
    page,
    page_size: pageSize,
    ...(keyword ? { keyword } : {}),
    ...(status !== 'all' ? { status } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.halls(params as Record<string, unknown>),
    queryFn: () => hallApi.getHalls(params),
    select: (res) => res.data.data,
    refetchInterval: 30_000, // 跟选举器 30s 兜底定时器同节奏
  });

  const syncMutation = useMutation({
    mutationFn: () => hallApi.syncMdm(),
    onSuccess: (res) => {
      const d = res.data.data;
      message.success(`同步完成：新增 ${d.created}，更新 ${d.updated}`);
      queryClient.invalidateQueries({ queryKey: ['halls'] });
    },
  });

  /* ---- 切换运营模式 mutation（乐观更新 + invalidate）---- */
  type ChangeOpModeVars = { hall: HallListItem; mode: OperationMode; reason?: string };
  const changeOpModeMutation = useMutation({
    mutationFn: ({ hall, mode, reason }: ChangeOpModeVars) =>
      hallApi.changeOperationMode(hall.id, mode, reason),
    onMutate: async ({ hall, mode }) => {
      // 把所有 ['halls', ...] cache 都同步乐观刷成新值
      await queryClient.cancelQueries({ queryKey: ['halls'] });
      const snapshots = queryClient.getQueriesData({ queryKey: ['halls'] });
      snapshots.forEach(([key, old]) => {
        if (!old || typeof old !== 'object' || !('data' in (old as object))) return;
        const o = old as { data: { data: { list: HallListItem[]; total: number } } };
        if (!o.data?.data?.list) return;
        const nextList = o.data.data.list.map((h) =>
          h.id === hall.id ? { ...h, operation_mode: mode } : h,
        );
        queryClient.setQueryData(key, {
          ...o,
          data: { ...o.data, data: { ...o.data.data, list: nextList } },
        });
      });
      return { snapshots };
    },
    onError: (err, _vars, context) => {
      // 回滚
      context?.snapshots.forEach(([key, old]) => {
        queryClient.setQueryData(key, old);
      });
      const msg = err instanceof Error ? err.message : '切换失败';
      message.error(`切换运营模式失败：${msg}`);
    },
    onSuccess: (_res, { mode }) => {
      message.success(`已切换至「${OP_MODE_META[mode].label}」`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['halls'] });
    },
  });

  /* ---- production 切换二次确认 Modal 状态 ---- */
  const [confirmHall, setConfirmHall] = useState<HallListItem | null>(null);

  const handleOpModeChange = (hall: HallListItem, next: OperationMode) => {
    if (next === resolveOpMode(hall)) return;
    if (next === 'production') {
      setConfirmHall(hall);
      return;
    }
    changeOpModeMutation.mutate({ hall, mode: next });
  };

  const handleProductionConfirm = (reason: string) => {
    if (!confirmHall) return;
    changeOpModeMutation.mutate(
      { hall: confirmHall, mode: 'production', reason },
      {
        onSuccess: () => setConfirmHall(null),
      },
    );
  };

  const list = data?.list ?? [];
  const total = data?.total ?? 0;

  /* ---- 客户端过滤运营模式（PRD §五：列表页 client-side filter，统计 chip 走全量）---- */
  const filteredList = useMemo(() => {
    if (opModeFilter === OP_MODE_FILTER_ALL) return list;
    return list.filter((h) => resolveOpMode(h) === opModeFilter);
  }, [list, opModeFilter]);

  /* ---- chip 计数：以全量 statsData 为准；fallback 当前页 ---- */
  const opModeCounts = useMemo(() => {
    const source = statsData?.list ?? list;
    const acc: Record<OperationMode, number> = {
      commissioning: 0,
      production: 0,
      maintenance: 0,
      paused: 0,
    };
    source.forEach((h) => {
      acc[resolveOpMode(h)] += 1;
    });
    return acc;
  }, [statsData, list]);
  const totalChipCount = statsData?.total ?? list.length;

  const columns: TableColumnsType<HallListItem> = [
    {
      title: '编号',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: '展厅名称',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Link to={`/halls/${record.id}`}>{name}</Link>
      ),
    },
    {
      title: '运营模式',
      width: 130,
      align: 'center',
      render: (_: unknown, record) => (
        <OperationModeCell hall={record} onChange={handleOpModeChange} />
      ),
    },
    {
      title: '服务状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <StatusTag status={s === 'active' ? 'normal' : s} />,
    },
    {
      title: '当前主控',
      width: 260,
      render: (_: unknown, record) => <CurrentMasterCell hall={record} />,
    },
    {
      title: '展项数',
      dataIndex: 'exhibit_count',
      width: 80,
      align: 'center',
    },
    {
      title: '设备数',
      dataIndex: 'device_count',
      width: 80,
      align: 'center',
    },
    {
      title: '在线实例',
      width: 100,
      align: 'center',
      render: (_: unknown, record) => (
        <span>{record.online_instance_count ?? 0} / {record.app_instance_count}</span>
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record) => (
        <Link to={`/halls/${record.id}`}>详情</Link>
      ),
    },
  ];

  const handlePageChange = (p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
  };

  return (
    <div>
      <PageHeader
        title="展厅列表"
        description="管理所有展厅"
        extra={
          isAdmin() ? (
            <Button
              icon={<SyncOutlined />}
              loading={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              MDM 同步
            </Button>
          ) : undefined
        }
      />

      <Space wrap size={8} style={{ marginBottom: 16 }}>
        <OpModeChip
          label="全部"
          count={totalChipCount}
          active={opModeFilter === OP_MODE_FILTER_ALL}
          onClick={() => setOpModeFilter(OP_MODE_FILTER_ALL)}
        />
        {OP_MODE_ORDER.map((mode) => (
          <OpModeChip
            key={mode}
            label={OP_MODE_META[mode].label}
            count={opModeCounts[mode]}
            color={OP_MODE_META[mode].color}
            active={opModeFilter === mode}
            onClick={() =>
              setOpModeFilter(opModeFilter === mode ? OP_MODE_FILTER_ALL : mode)
            }
          />
        ))}
      </Space>

      <Space wrap style={{ marginBottom: 16, display: 'flex' }}>
        <Input.Search
          placeholder="搜索展厅名称..."
          allowClear
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          onSearch={() => setPage(1)}
        />
        <Select
          style={{ width: 140 }}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={STATUS_OPTIONS}
        />
        <span style={{ marginLeft: 4, color: 'rgba(0,0,0,0.65)' }}>运营模式：</span>
        <Segmented
          value={opModeFilter}
          onChange={(v) => setOpModeFilter(v as OpModeFilter)}
          options={[
            { label: '全部', value: OP_MODE_FILTER_ALL },
            ...OP_MODE_ORDER.map((mode) => ({
              label: OP_MODE_META[mode].label,
              value: mode,
            })),
          ]}
        />
      </Space>

      <Table<HallListItem>
        columns={columns}
        dataSource={filteredList}
        loading={isLoading}
        pagination={false}
        rowKey="id"
        size="middle"
      />

      {total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            showTotal={(t) => `共 ${t} 条`}
            onChange={handlePageChange}
          />
        </div>
      )}

      <ProductionConfirmModal
        open={confirmHall !== null}
        hall={confirmHall}
        onCancel={() => setConfirmHall(null)}
        onConfirm={handleProductionConfirm}
        confirmLoading={changeOpModeMutation.isPending}
      />
    </div>
  );
}

/* ===================== OpModeChip ===================== */

interface OpModeChipProps {
  label: string;
  count: number;
  color?: 'processing' | 'success' | 'warning' | 'default';
  active: boolean;
  onClick: () => void;
}

function OpModeChip({ label, count, color, active, onClick }: OpModeChipProps) {
  const tagColor = active ? color ?? 'processing' : undefined;
  return (
    <Tag
      color={active ? tagColor : undefined}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        padding: '2px 10px',
        fontSize: 13,
        borderRadius: 14,
        border: active ? undefined : '1px solid rgba(0,0,0,0.1)',
        background: active ? undefined : 'rgba(255,255,255,0.6)',
      }}
    >
      <span style={{ fontWeight: active ? 600 : 500, marginRight: 6 }}>{label}</span>
      <span style={{ color: active ? undefined : 'rgba(0,0,0,0.55)' }}>{count}</span>
    </Tag>
  );
}

