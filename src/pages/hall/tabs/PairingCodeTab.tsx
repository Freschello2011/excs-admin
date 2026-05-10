import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Form, Input, Select, Space, Popconfirm, Switch, Tooltip } from 'antd';
import type { AxiosError } from 'axios';
import { useMessage } from '@/hooks/useMessage';
import dayjs from 'dayjs';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import type {
  PairingCodeListItem,
  PairingCodeStatus,
  ExhibitListItem,
  AppInstanceListItem,
  DeviceInfoMetaKnown as DeviceInfo,
  ControlAppSessionItem,
  HallListItem,
  AnnouncedDevice,
} from '@/api/gen/client';
import s from './PairingCodeTab.module.scss';

/**
 * 从 AxiosError 里抠出后端真实消息。
 * 后端约定：{code, message} (response.go) → 取 message；
 * authz reason_required: {error, hint} → 取 hint；
 * 其它 → 用 fallback。
 */
function pickServerMessage(err: unknown, fallback: string): string {
  const ax = err as AxiosError<unknown> | undefined;
  const data = ax?.response?.data as Record<string, unknown> | undefined;
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string' && data.message) return data.message;
    if (typeof data.hint === 'string' && data.hint) return data.hint;
  }
  return fallback;
}

interface PairingCodeTabProps {
  hallId: number;
  isAdmin: boolean;
  /** 限制显示内容：'exhibit' 只展项；'hall' 只展厅码/中控；undefined 默认展项 */
  mode?: 'exhibit' | 'hall';
  /** 仅展项模式下：限定单个展项的配对码卡片（用于展项详情页） */
  exhibitId?: number;
}

const MAX_DEBUG_INSTANCES = 3;

/* ── 状态文案 ── */

const STATUS_LABEL: Record<string, string> = {
  paired: '已配对',
  activeCode: '有效码',
  locked: '已锁定',
  unpaired: '未配对',
  codeExpired: '码已过期',
};

const CODE_STATUS_LABEL: Record<PairingCodeStatus, string> = {
  active: '有效',
  used: '已使用',
  expired: '已过期',
  locked: '已锁定',
};

/* ── Time helpers ── */

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

function formatCountdown(expiresAt: string, now: number): { text: string; cls: string } {
  const diff = dayjs(expiresAt).valueOf() - now;
  if (diff <= 0) return { text: '00:00:00', cls: s.expired };
  const total = Math.floor(diff / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const text = `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  if (diff < 60 * 60 * 1000) return { text, cls: s.danger };
  if (diff < 6 * 60 * 60 * 1000) return { text, cls: s.warn };
  return { text, cls: '' };
}

function formatRelative(iso: string): string {
  const diffMin = dayjs().diff(dayjs(iso), 'minute');
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

function formatShortTime(iso: string): string {
  return dayjs(iso).format('MM-DD HH:mm');
}

/* ── Heartbeat ── */

function formatHeartbeat(ts: string | null | undefined): { text: string; isOnline: boolean } {
  if (!ts) return { text: '未上报', isOnline: false };
  const diff = dayjs().diff(dayjs(ts), 'minute');
  if (diff < 3) return { text: '在线', isOnline: true };
  return { text: formatRelative(ts), isOnline: false };
}

/* ── Device helpers ── */

function getPlatformIcon(os?: string): string {
  if (!os) return 'computer';
  const lower = os.toLowerCase();
  if (lower.includes('windows')) return 'desktop_windows';
  if (lower.includes('mac') || lower.includes('darwin')) return 'laptop_mac';
  return 'computer';
}

function formatNetworkInfo(info?: DeviceInfo | null): string {
  if (!info) return '';
  const parts: string[] = [];
  if (info.local_ip) parts.push(info.local_ip);
  if (info.mac_address) parts.push(info.mac_address);
  return parts.join(' · ');
}

/* ── Code effective status ── */

function isCodeEffective(code: PairingCodeListItem): boolean {
  return code.status === 'active' && dayjs(code.expires_at).isAfter(dayjs());
}

function isCodeLocked(code: PairingCodeListItem): boolean {
  return code.status === 'locked';
}

/* ── Aggregation types ── */

interface ExhibitGroup {
  key: string;
  exhibitId: number;
  exhibitName: string;
  status: string; // paired | activeCode | locked | unpaired | codeExpired
  instance?: AppInstanceListItem;
  debugInstances: AppInstanceListItem[];
  currentCode?: PairingCodeListItem;
  latestCode?: PairingCodeListItem;
  debugCode?: PairingCodeListItem;
  historyCodes: PairingCodeListItem[];
  failedAttempts: number;
}

interface HallCodeGroup {
  key: string;
  hallId: number;
  hallName: string;
  currentCode?: PairingCodeListItem;
  latestCode?: PairingCodeListItem;
  historyCodes: PairingCodeListItem[];
}

/* ── Pure helpers ── */

function splitCode(code?: string): [string, string] {
  if (!code || code.length < 6) return ['———', '———'];
  return [code.slice(0, 3), code.slice(3, 6)];
}

function buildStatusSummary(
  group: ExhibitGroup,
): { icon: string; tone: '' | 'warn' | 'danger' | 'info' | 'muted'; text: string } {
  switch (group.status) {
    case 'paired': {
      const hb = formatHeartbeat(group.instance?.last_heartbeat_at ?? null);
      const hostname = group.instance?.device_info?.hostname ?? '设备';
      if (!group.instance?.last_heartbeat_at) {
        return { icon: 'sync_problem', tone: 'warn', text: '设备已绑定 · 尚未收到心跳上报（可能离线或版本过旧）' };
      }
      if (hb.isOnline) {
        return { icon: 'check_circle', tone: '', text: `设备 ${hostname} 运行正常` };
      }
      return { icon: 'signal_wifi_off', tone: 'warn', text: `设备 ${hostname} 已离线（最近心跳 ${hb.text}）` };
    }
    case 'activeCode':
      return { icon: 'hourglass_top', tone: 'info', text: '码已下发 · 等待设备端输入后自动配对' };
    case 'codeExpired':
      return { icon: 'warning', tone: 'warn', text: '码已失效 · 重新生成下发新码后，设备端可继续配对' };
    case 'locked':
      return { icon: 'lock', tone: 'danger', text: '连续失败 5 次触发锁定 · 冷却结束后自动恢复，或手动解锁' };
    case 'unpaired':
    default:
      return { icon: 'add_circle', tone: 'muted', text: '从未生成配对码 · 点击"生成配对码"开始' };
  }
}

/* ── Legend ── */

const LEGEND_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'paired', label: '已配对' },
  { key: 'activeCode', label: '有效码（待配对）' },
  { key: 'codeExpired', label: '码已过期' },
  { key: 'locked', label: '已锁定' },
  { key: 'unpaired', label: '未配对' },
];

function Legend() {
  return (
    <div className={s.legend}>
      <span className={s.legendLabel}>状态图例</span>
      {LEGEND_ITEMS.map((item, i) => (
        <Fragment key={item.key}>
          {i > 0 && <span className={s.legendDivider}>·</span>}
          <span className={s.legendItem}>
            <span className={`${s.legendSwatch} ${s[item.key]}`} />
            {item.label}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/* ── Main component ── */

export default function PairingCodeTab({ hallId, isAdmin, mode, exhibitId }: PairingCodeTabProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [form] = Form.useForm();
  const tab: 'exhibit' | 'hall' = mode ?? 'exhibit';
  const [showHistory, setShowHistory] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [announceExhibits, setAnnounceExhibits] = useState<Record<string, number>>({});
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [switchingSession, setSwitchingSession] = useState<ControlAppSessionItem | null>(null);
  const [targetHallId, setTargetHallId] = useState<number | null>(null);

  // 跳秒时钟：每秒刷新 now，驱动所有 countdown
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* ── Data queries ── */

  const { data: codes = [], isLoading: codesLoading } = useQuery({
    queryKey: queryKeys.pairingCodes(hallId),
    queryFn: () => hallApi.listPairingCodes(hallId),
    select: (res) => res.data.data,
    enabled: isAdmin,
  });

  const { data: exhibits = [] } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
  });

  const { data: instances = [] } = useQuery({
    queryKey: queryKeys.appInstances(hallId),
    queryFn: () => hallApi.getAppInstances(hallId),
    select: (res) => res.data.data,
    enabled: isAdmin,
  });

  const { data: controlSessions = [] } = useQuery({
    queryKey: queryKeys.controlAppSessions(hallId),
    queryFn: () => hallApi.listControlAppSessions(hallId),
    select: (res) => res.data.data,
    enabled: isAdmin && tab === 'hall',
  });

  const { data: allHalls = [] } = useQuery({
    queryKey: queryKeys.halls({}),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data.list,
    enabled: switchModalOpen,
  });

  const { data: announcedDevices = [] } = useQuery({
    queryKey: queryKeys.announcedDevices,
    queryFn: () => hallApi.listAnnouncedDevices(),
    select: (res) => res.data.data,
    enabled: isAdmin && tab === 'exhibit',
    refetchInterval: 5000,
  });

  /* ── Mutations ── */

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pairingCodes(hallId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.appInstances(hallId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.controlAppSessions(hallId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.announcedDevices });
  };

  const generateMutation = useMutation({
    mutationFn: (vars: { data: { target_type: 'exhibit' | 'hall'; target_id: number }; reason?: string }) =>
      hallApi.generatePairingCode(hallId, vars.data, vars.reason),
    onSuccess: () => {
      message.success('配对码已生成');
      invalidate();
      setGenerateModalOpen(false);
    },
    onError: (err) => message.error(pickServerMessage(err, '生成失败，目标可能已有有效配对码')),
  });

  const batchMutation = useMutation({
    mutationFn: (vars: { reason?: string }) => hallApi.batchGeneratePairingCodes(hallId, vars.reason),
    onSuccess: (res) => {
      const data = res.data.data;
      message.success(`批量生成完成：${data.generated.length} 个成功，${data.skipped.length} 个跳过`);
      invalidate();
    },
    onError: (err) => message.error(pickServerMessage(err, '批量生成失败')),
  });

  const regenerateMutation = useMutation({
    mutationFn: (vars: { codeId: number; reason?: string }) =>
      hallApi.regeneratePairingCode(hallId, vars.codeId, vars.reason),
    onSuccess: () => {
      message.success('配对码已重新生成');
      invalidate();
    },
    onError: (err) => message.error(pickServerMessage(err, '重新生成失败')),
  });

  const unlockMutation = useMutation({
    mutationFn: (vars: { codeId: number; reason?: string }) =>
      hallApi.unlockPairingCode(hallId, vars.codeId, vars.reason),
    onSuccess: () => {
      message.success('配对码已解锁');
      invalidate();
    },
    onError: (err) => message.error(pickServerMessage(err, '解锁失败')),
  });

  const generateDebugMutation = useMutation({
    mutationFn: (vars: { data: { exhibit_id: number; ttl_hours?: number }; reason?: string }) =>
      hallApi.generateDebugPairingCode(hallId, vars.data, vars.reason),
    onSuccess: () => {
      message.success('调试配对码已生成');
      invalidate();
    },
    onError: (err) => message.error(pickServerMessage(err, '生成调试码失败，可能已有有效码或调试实例已达上限')),
  });

  const disconnectDebugMutation = useMutation({
    mutationFn: (instanceId: number) => hallApi.disconnectDebugInstance(hallId, instanceId),
    onSuccess: () => {
      message.success('调试实例已断开');
      invalidate();
    },
  });

  const extendDebugMutation = useMutation({
    mutationFn: ({ instanceId, hours }: { instanceId: number; hours: number }) =>
      hallApi.extendDebugInstance(hallId, instanceId, { extend_hours: hours }),
    onSuccess: () => {
      message.success('调试实例已延长');
      invalidate();
    },
  });

  const unpairMutation = useMutation({
    mutationFn: (instanceId: number) => hallApi.unpairAppInstance(hallId, instanceId),
    onSuccess: () => {
      message.success('解绑成功');
      invalidate();
    },
  });


  const switchHallMutation = useMutation({
    mutationFn: ({ sessionId, newHallId }: { sessionId: number; newHallId: number }) =>
      hallApi.switchControlAppHall(hallId, sessionId, { new_hall_id: newHallId }),
    onSuccess: (res) => {
      // ADR-0026：后端可能返 warning 表示 envelope 链路降级（DB/ACL 已对，但 broker
      // 视角 session 私有 topic 0 订阅者）。warning 非空时弹 warning toast 8s，
      // 让用户知道 App 端会有 60s 内的兜底延迟；空时弹常规 success。
      const data = res.data.data;
      if (data?.warning) {
        message.warning({
          content: data.hint ?? '切换已落库，App 端将通过 reconcile 兜底（60 秒内）',
          duration: 8,
        });
      } else {
        message.success('展厅切换成功');
      }
      invalidate();
      setSwitchModalOpen(false);
    },
    onError: () => message.error('切换失败'),
  });

  const cleanupStaleMutation = useMutation({
    mutationFn: () => hallApi.cleanupStaleControlSessions(hallId),
    onSuccess: (res) => {
      message.success(`已清理 ${res.data.data.deleted} 条离线会话`);
      invalidate();
    },
    onError: () => message.error('清理失败'),
  });

  const pairAnnouncedMutation = useMutation({
    mutationFn: (data: { announce_code: string; exhibit_id: number }) =>
      hallApi.pairAnnouncedDevice(hallId, data),
    onSuccess: () => {
      message.success('设备配对成功');
      invalidate();
    },
    onError: (err) => message.error(pickServerMessage(err, '配对失败，展项可能已有绑定设备')),
  });

  /* ── Aggregation ── */

  const { exhibitGroups, hallCodes } = useMemo(() => {
    const exhibitCodes = codes.filter((c) => c.target_type === 'exhibit');
    const debugCodes = codes.filter((c) => c.target_type === 'exhibit_debug');
    const hallTypeCodes = codes.filter((c) => c.target_type === 'hall');

    const groups: ExhibitGroup[] = exhibits.map((ex: ExhibitListItem) => {
      const exCodes = exhibitCodes
        .filter((c) => c.target_id === ex.id)
        .sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());

      const exDebugCodes = debugCodes
        .filter((c) => c.target_id === ex.id)
        .sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());
      const activeDebugCode = exDebugCodes.find((c) => isCodeEffective(c));

      const inst = instances.find((i) => i.exhibit_id === ex.id && (i.role === 'primary' || !i.role));
      const debugInsts = instances.filter((i) => i.exhibit_id === ex.id && i.role === 'debug');

      const currentCode = exCodes.find((c) => isCodeEffective(c) || isCodeLocked(c));
      const latestCode = exCodes[0];
      const historyCodes = exCodes.filter((c) => c !== (currentCode || latestCode));

      let status = 'unpaired';
      if (inst) {
        status = 'paired';
      } else if (currentCode && isCodeLocked(currentCode)) {
        status = 'locked';
      } else if (currentCode && isCodeEffective(currentCode)) {
        status = 'activeCode';
      } else if (exCodes.length > 0) {
        status = 'codeExpired';
      }

      return {
        key: `exhibit-${ex.id}`,
        exhibitId: ex.id,
        exhibitName: ex.name,
        status,
        instance: inst,
        debugInstances: debugInsts,
        currentCode,
        latestCode,
        debugCode: activeDebugCode,
        historyCodes,
        failedAttempts: currentCode?.failed_attempts ?? 0,
      };
    });

    const hallSorted = hallTypeCodes.sort(
      (a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf(),
    );
    const currentHallCode = hallSorted.find((c) => isCodeEffective(c) || isCodeLocked(c));
    const hallHistory = hallSorted.filter((c) => c !== currentHallCode);

    const latestHallCode = hallSorted[0];
    const hc: HallCodeGroup = {
      key: `hall-${hallId}`,
      hallId,
      hallName: (currentHallCode || latestHallCode)?.target_name ?? '当前展厅',
      currentCode: currentHallCode,
      latestCode: latestHallCode,
      historyCodes: currentHallCode ? hallHistory : hallSorted.slice(1),
    };

    return { exhibitGroups: groups, hallCodes: hc };
  }, [codes, exhibits, instances, hallId]);

  /* ── Interactions ── */

  const handleCopy = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      message.success('已复制');
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      message.error('复制失败');
    }
  }, [message]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleGenerate = (reason?: string) => {
    return form.validateFields().then((values) => {
      return generateMutation.mutateAsync({ data: values, reason });
    });
  };

  const handleExport = async () => {
    try {
      const res = await hallApi.exportPairingCodes(hallId);
      const items = res.data.data;
      if (!items || items.length === 0) {
        message.info('暂无有效配对码');
        return;
      }
      const header = '展项名称\t配对码\t有效期\n';
      const text = items.map((item) => `${item.exhibit_name}\t${item.code}\t${item.expires_at}`).join('\n');
      navigator.clipboard.writeText(header + text);
      message.success(`已复制 ${items.length} 条配对码到剪贴板`);
    } catch {
      message.error('导出失败');
    }
  };

  /* ── Render helpers ── */

  const exhibitOptions = exhibits.map((e: ExhibitListItem) => ({ value: e.id, label: e.name }));
  const unpairedExhibitOptions = exhibits
    .filter((e: ExhibitListItem) => !instances.some((i) => i.exhibit_id === e.id && (i.role === 'primary' || !i.role)))
    .map((e: ExhibitListItem) => ({ value: e.id, label: e.name }));

  const displayGroups = exhibitGroups
    .filter((g) => (exhibitId ? g.exhibitId === exhibitId : true))
    .filter((g) => {
      if (showHistory) return true;
      if (g.status === 'unpaired' && g.historyCodes.length > 0 && !g.currentCode && !g.instance) return false;
      return true;
    });

  // 中控会话：直接读服务端权威 is_online（HTTP 被动续期模型，详见 02-server
  // hall/service.go IsControlSessionOnline；前端不再做客户端 5min stale 兜底）。
  const sessionOnlineCount = controlSessions.filter((sess) => sess.is_online).length;
  const sessionOfflineCount = controlSessions.length - sessionOnlineCount;

  /* ── Sub-renders ── */

  const renderDigitPanel = (
    code: PairingCodeListItem | undefined,
    tone: '' | 'paired' | 'locked' | 'expired' | 'unpaired',
    options?: { onClickCode?: () => void; countdownLabel?: string; countdownOverride?: { text: string; cls: string } },
  ) => {
    const [a, b] = splitCode(code?.code);
    const isCopied = !!code && copiedCode === code.code;
    const panelCls = tone === 'expired' || tone === 'unpaired' ? s.expired : '';
    const countdown = options?.countdownOverride
      ?? (code ? formatCountdown(code.expires_at, nowMs) : { text: '—', cls: s.expired });
    const label = options?.countdownLabel ?? (tone === 'expired' ? '过期于' : tone === 'unpaired' ? '状态' : '倒计时');
    const metaText = tone === 'expired' && code ? formatShortTime(code.expires_at) : countdown.text;
    const metaCls = tone === 'expired' || tone === 'unpaired' ? s.expired : countdown.cls;

    return (
      <div
        className={`${s.digitPanel} ${panelCls}`}
        onClick={code && options?.onClickCode ? options.onClickCode : undefined}
        style={{ cursor: code && options?.onClickCode ? 'pointer' : 'default' }}
      >
        <div className={`${s.digitGroup} ${tone ? s[tone] : ''} ${isCopied ? s.digitCopied : ''}`}>
          <span>{a}</span>
          <span className={s.sep}>·</span>
          <span>{b}</span>
        </div>
        <div className={s.digitMeta}>
          <span className={s.digitLabel}>{label}</span>
          <span className={`${s.countdown} ${metaCls || ''}`}>{metaText}</span>
        </div>
      </div>
    );
  };

  const renderDevice = (instance?: AppInstanceListItem) => {
    if (!instance) return null;
    const info = instance.device_info as DeviceInfo | undefined;
    const icon = getPlatformIcon(info?.os);
    const hostname = info?.hostname || '—';
    const networkInfo = formatNetworkInfo(info);
    const hb = formatHeartbeat(instance.last_heartbeat_at);
    return (
      <div className={s.deviceInfo}>
        <span className={`material-symbols-outlined ${s.platformIcon}`}>{icon}</span>
        <div className={s.deviceDetails}>
          <div className={s.deviceRow}>
            <Tooltip title={hostname}>
              <span className={s.deviceText}>{hostname}</span>
            </Tooltip>
            {instance.is_hall_master && (
              <span className={`${s.statusChip} ${s.activeCode}`} style={{ padding: '1px 6px', fontSize: 11 }}>主控</span>
            )}
            <span className={`${s.heartbeat} ${hb.isOnline ? s.heartbeatOnline : ''}`}>
              <span className={s.heartbeatDot} />
              {hb.text}
            </span>
            {instance.current_version ? (
              <Tooltip title="展厅 App 当前装版（升级状态上报刷新）">
                <span className={s.appVersion}>v{instance.current_version}</span>
              </Tooltip>
            ) : (
              <Tooltip title="展厅 App 未上报版本（v0.9.13 之前的版本不带版本上报）">
                <span className={`${s.appVersion} ${s.appVersionUnknown}`}>版本未上报</span>
              </Tooltip>
            )}
          </div>
          {networkInfo && (
            <Tooltip title="点击复制">
              <span className={s.deviceNetwork} onClick={() => handleCopy(networkInfo)}>
                {info?.os ? `${info.os} · ` : ''}{networkInfo}
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  const renderHistoryRows = (historyCodes: PairingCodeListItem[]) => {
    if (historyCodes.length === 0) return null;
    return (
      <div className={s.historyList}>
        {historyCodes.map((hc) => {
          return (
            <div key={hc.id} className={s.historyRow}>
              <span className={s.historyCode}>{hc.code}</span>
              <span className={`${s.statusChip} ${s[hc.status === 'locked' ? 'locked' : hc.status === 'active' ? 'activeCode' : 'unpaired']}`}>
                {CODE_STATUS_LABEL[hc.status] || '—'}
              </span>
              <span>{formatShortTime(hc.created_at)}</span>
              {hc.used_by_instance_id && (
                <span className={s.historyDevice}>
                  → {(instances.find((i) => i.id === hc.used_by_instance_id)?.device_info as DeviceInfo | undefined)?.hostname || '设备'}
                </span>
              )}
              {hc.failed_attempts > 0 && (
                <span style={{ color: 'var(--color-error)' }}>失败 {hc.failed_attempts} 次</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDebugInstance = (di: AppInstanceListItem) => {
    const info = di.device_info as DeviceInfo | undefined;
    const hostname = info?.hostname || '—';
    const icon = getPlatformIcon(info?.os);
    const remaining = di.debug_expires_at ? formatCountdown(di.debug_expires_at, nowMs) : null;

    return (
      <div key={di.id} className={s.debugRow}>
        <div className={s.deviceInfo} style={{ fontSize: 12 }}>
          <span className={`material-symbols-outlined ${s.platformIcon}`} style={{ fontSize: 14 }}>{icon}</span>
          <div className={s.deviceDetails}>
            <span className={s.deviceRow}>
              <span className={s.deviceText} style={{ fontSize: 12 }}>{hostname}</span>
              {di.current_version && (
                <Tooltip title="调试实例当前装版">
                  <span className={s.appVersion} style={{ fontSize: 10.5 }}>v{di.current_version}</span>
                </Tooltip>
              )}
            </span>
            {info?.local_ip && <span className={s.deviceNetwork}>{info.local_ip}</span>}
          </div>
        </div>
        {remaining && <span className={`${s.countdown} ${remaining.cls}`} style={{ fontSize: 12 }}>{remaining.text}</span>}
        <Space size="small">
          <Popconfirm title="延长 4 小时？" onConfirm={() => extendDebugMutation.mutate({ instanceId: di.id, hours: 4 })}>
            <Button type="link" size="small">延长</Button>
          </Popconfirm>
          <Popconfirm title="确认断开该调试实例？" onConfirm={() => disconnectDebugMutation.mutate(di.id)}>
            <Button type="link" size="small" danger>断开</Button>
          </Popconfirm>
        </Space>
      </div>
    );
  };

  const renderExhibitCard = (group: ExhibitGroup, index: number) => {
    const isExpanded = expandedKeys.has(group.key);
    const visibleHistory = showHistory ? group.historyCodes : [];
    const displayCode = group.currentCode || group.latestCode;
    const actionCode = group.currentCode || group.latestCode;
    const unitNum = String(index + 1).padStart(2, '0');
    const summary = buildStatusSummary(group);

    // 段码 tone + digitPanel label/override
    let digitTone: '' | 'paired' | 'locked' | 'expired' | 'unpaired' = '';
    let countdownLabel = '倒计时';
    let countdownOverride: { text: string; cls: string } | undefined;
    if (group.status === 'paired') {
      digitTone = 'paired';
      if (!displayCode || !isCodeEffective(displayCode)) {
        countdownLabel = '配对码过期于';
        countdownOverride = { text: displayCode ? formatShortTime(displayCode.expires_at) : '—', cls: s.expired };
      }
    } else if (group.status === 'locked') {
      digitTone = 'locked';
      countdownLabel = '解锁倒计时';
    } else if (group.status === 'codeExpired') {
      digitTone = 'expired';
      countdownLabel = '过期于';
      countdownOverride = { text: displayCode ? formatShortTime(displayCode.expires_at) : '—', cls: s.expired };
    } else if (group.status === 'unpaired') {
      digitTone = 'unpaired';
      countdownLabel = '状态';
      countdownOverride = { text: '—', cls: s.expired };
    } else if (group.status === 'activeCode') {
      digitTone = '';
    }

    // data-strip
    let stripClass = '';
    let stripDot: 'online' | 'warn' | 'danger' | '' = '';
    let stripText = '';
    let stripColor: string | undefined;
    if (group.status === 'paired') {
      const hb = formatHeartbeat(group.instance?.last_heartbeat_at ?? null);
      stripText = hb.isOnline ? '设备在线' : (group.instance?.last_heartbeat_at ? '设备离线' : '心跳未上报');
      stripDot = hb.isOnline ? 'online' : '';
      if (hb.isOnline) stripColor = 'var(--color-success)';
    } else if (group.status === 'activeCode') {
      stripText = '等待配对';
      stripDot = '';
    } else if (group.status === 'codeExpired') {
      stripClass = s.warn;
      stripDot = 'warn';
      stripText = '码已过期';
      stripColor = 'var(--color-warning)';
    } else if (group.status === 'locked') {
      stripClass = s.danger;
      stripDot = 'danger';
      stripText = `锁定 · 失败 ${group.failedAttempts}/5`;
      stripColor = 'var(--color-error)';
    } else {
      stripText = '未配对';
    }
    const stripMeta = group.instance?.last_heartbeat_at
      ? `心跳 · ${formatHeartbeat(group.instance.last_heartbeat_at).text}`
      : displayCode
        ? `最近活动 · ${formatRelative(displayCode.created_at)}`
        : '无历史记录';

    return (
      <div key={group.key} className={s.card}>
        {/* 顶部 data-strip */}
        <div className={`${s.dataStrip} ${stripClass}`}>
          <Tooltip title={`展项 ID：${group.exhibitId}（${group.exhibitName}）`}>
            <span className={s.unitId}>UNIT · {unitNum}</span>
          </Tooltip>
          <span className={s.unitMeta}>{stripMeta}</span>
          <span className={s.unitRight}>
            {stripDot && <span className={`${s.stripDot} ${s[stripDot]}`} />}
            {!stripDot && <span className={s.stripDot} />}
            <span style={stripColor ? { color: stripColor } : undefined}>{stripText}</span>
          </span>
        </div>

        {/* 主体 */}
        <div className={s.cardBody}>
          <div className={s.ledCol}>
            <div className={`${s.led} ${s[group.status]}`} />
          </div>

          <div className={s.cardContent}>
            <div className={s.cardHeader}>
              <span className={s.targetName}>{group.exhibitName}</span>
              <span className={`${s.statusChip} ${s[group.status]}`}>
                {STATUS_LABEL[group.status]}{group.failedAttempts > 0 ? ` · ${group.failedAttempts} 次` : ''}
              </span>
            </div>

            {renderDigitPanel(displayCode, digitTone, {
              onClickCode: displayCode ? () => handleCopy(displayCode.code) : undefined,
              countdownLabel,
              countdownOverride,
            })}

            <div className={`${s.statusSummary} ${summary.tone ? s[summary.tone] : ''}`}>
              <span className={`material-symbols-outlined ${s.icon}`}>{summary.icon}</span>
              <span>{summary.text}</span>
            </div>

            {group.instance ? renderDevice(group.instance) : (
              <div className={s.deviceInfo}>
                <span className={`material-symbols-outlined ${s.platformIcon}`}>history</span>
                <div className={s.deviceDetails}>
                  <span className={s.deviceText} style={{ color: 'var(--color-outline)' }}>
                    {group.status === 'unpaired' ? '从未绑定设备' : '无绑定设备'}
                  </span>
                  {group.historyCodes.length > 0 && (
                    <span className={s.deviceNetwork}>历史 {group.historyCodes.length} 条</span>
                  )}
                </div>
              </div>
            )}

            {/* 调试实例区（仅 paired 时显示） */}
            {group.instance && (
              <div className={s.debugSection}>
                <div className={s.debugHeader}>
                  <span className="material-symbols-outlined">bug_report</span>
                  <span>调试实例 · {group.debugInstances.length} / {MAX_DEBUG_INSTANCES}</span>
                </div>
                {group.debugInstances.map(renderDebugInstance)}
                {group.debugCode && (
                  <div className={s.debugCodeRow}>
                    <span style={{ fontSize: 12, color: 'var(--color-outline)' }}>调试码</span>
                    <Tooltip title="点击复制">
                      <span className={s.debugCode} onClick={() => handleCopy(group.debugCode!.code)}>
                        {group.debugCode.code}
                      </span>
                    </Tooltip>
                    <span className={`${s.countdown} ${formatCountdown(group.debugCode.expires_at, nowMs).cls}`} style={{ fontSize: 12 }}>
                      {formatCountdown(group.debugCode.expires_at, nowMs).text}
                    </span>
                  </div>
                )}
                {group.debugInstances.length < MAX_DEBUG_INSTANCES && !group.debugCode && (
                  <div className={s.debugEmpty}>
                    <span className={s.hint}>
                      可另接 {MAX_DEBUG_INSTANCES - group.debugInstances.length} 台调试机（开发/维护用）· 不占用主实例
                    </span>
                    <RiskyActionButton
                      action="pairing.debug"
                      type="link"
                      size="small"
                      confirmTitle="生成调试配对码"
                      confirmContent="为该展项生成调试配对码（默认有效期 10 小时）。请填写操作原因（≥ 5 字，审计用）。"
                      onConfirm={async (reason) => {
                        await generateDebugMutation.mutateAsync({ data: { exhibit_id: group.exhibitId }, reason });
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 2 }}>add</span>
                      添加调试实例
                    </RiskyActionButton>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={s.cardFooter}>
          {showHistory && group.historyCodes.length > 0 && (
            <span className={s.historyToggle} onClick={() => toggleExpand(group.key)}>
              <span className={`${s.arrow} ${isExpanded ? s.arrowOpen : ''}`}>▸</span>
              {group.historyCodes.length} 条历史记录
            </span>
          )}
          <Space size="small" style={{ marginLeft: 'auto' }} split={<span style={{ color: 'var(--color-outline-variant)', fontSize: 11 }}>·</span>}>
            {group.instance && (
              <Popconfirm title="确认解绑？解绑后设备将断开" onConfirm={() => unpairMutation.mutate(group.instance!.id)}>
                <Button type="link" size="small" danger>解绑</Button>
              </Popconfirm>
            )}
            {actionCode && actionCode.status !== 'locked' && (
              <RiskyActionButton
                action="pairing.manage"
                type="link"
                size="small"
                confirmTitle="重新生成配对码"
                confirmContent={`旧码将立即作废，请填写重新生成的原因（≥ 5 字，审计用）。展项：${group.exhibitName}`}
                onConfirm={async (reason) => {
                  await regenerateMutation.mutateAsync({ codeId: actionCode.id, reason });
                }}
              >
                重新生成
              </RiskyActionButton>
            )}
            {group.currentCode?.status === 'locked' && (
              <RiskyActionButton
                action="pairing.manage"
                type="link"
                size="small"
                confirmTitle="解锁配对码"
                confirmContent={`将清除当前 ${group.failedAttempts} 次失败计数并立即恢复 active。请填写解锁原因（≥ 5 字，审计用）。`}
                onConfirm={async (reason) => {
                  await unlockMutation.mutateAsync({ codeId: group.currentCode!.id, reason });
                }}
              >
                解锁
              </RiskyActionButton>
            )}
            {!displayCode && (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  form.setFieldsValue({ target_type: 'exhibit', target_id: group.exhibitId });
                  setGenerateModalOpen(true);
                }}
              >
                生成配对码
              </Button>
            )}
          </Space>
        </div>

        {isExpanded && renderHistoryRows(visibleHistory)}
      </div>
    );
  };

  const renderControlSession = (session: ControlAppSessionItem) => {
    const isOnline = session.is_online;
    return (
      <div key={session.id} className={`${s.sessionRow} ${!isOnline ? s.offline : ''}`}>
        <span className={s.sessionUser}>
          <span className="material-symbols-outlined">person</span>
          <span className={s.sessionName}>{session.user_name}</span>
        </span>
        <Tooltip title={session.device_uuid}>
          <span className={s.sessionDevice}>{session.device_uuid}</span>
        </Tooltip>
        <span className={`${s.heartbeat} ${isOnline ? s.heartbeatOnline : ''}`}>
          <span className={s.heartbeatDot} />
          {isOnline ? '在线' : '离线'}
        </span>
        <span className={s.sessionTime}>
          {formatShortTime(session.last_active_at)} · {formatRelative(session.last_active_at)}
        </span>
        <Space size="small">
          {session.allow_hall_switch && (
            <Button type="link" size="small" onClick={() => { setSwitchingSession(session); setTargetHallId(null); setSwitchModalOpen(true); }}>
              切换展厅
            </Button>
          )}
        </Space>
      </div>
    );
  };

  const renderHallCodeCard = (hc: HallCodeGroup) => {
    const isExpanded = expandedKeys.has(hc.key);
    const visibleHistory = showHistory ? hc.historyCodes : [];
    const displayCode = hc.currentCode || hc.latestCode;
    const actionCode = hc.currentCode || hc.latestCode;
    const codeStatus = hc.currentCode
      ? (isCodeEffective(hc.currentCode) ? 'activeCode' : 'codeExpired')
      : (hc.latestCode ? 'codeExpired' : 'unpaired');

    let digitTone: '' | 'paired' | 'locked' | 'expired' | 'unpaired' = '';
    let countdownLabel = '倒计时';
    let countdownOverride: { text: string; cls: string } | undefined;
    if (codeStatus === 'codeExpired') {
      digitTone = 'expired';
      countdownLabel = '过期于';
      countdownOverride = { text: displayCode ? formatShortTime(displayCode.expires_at) : '—', cls: s.expired };
    } else if (codeStatus === 'unpaired') {
      digitTone = 'unpaired';
      countdownLabel = '状态';
      countdownOverride = { text: '—', cls: s.expired };
    }

    return (
      <div key={hc.key} className={s.card}>
        <div className={`${s.dataStrip} ${s.hub}`}>
          <span className={s.unitId}>HUB · HALL-{String(hc.hallId).padStart(2, '0')}</span>
          <span className={s.unitMeta}>多中控共用 · 配对码可多次使用</span>
          <span className={s.unitRight}>
            <span>会话 {controlSessions.length} / ∞</span>
            <span className={`${s.stripDot} ${s.online}`} />
            <span style={{ color: 'var(--color-success)' }}>展厅码在线</span>
          </span>
        </div>

        <div className={s.cardBody}>
          <div className={s.ledCol}>
            <div className={`${s.led} ${s.activeCode}`} />
          </div>

          <div className={s.cardContent}>
            <div className={s.cardHeader}>
              <span className={s.targetName}>{hc.hallName}（展厅码 · 可复用）</span>
              <span className={`${s.statusChip} ${s[codeStatus]}`}>{STATUS_LABEL[codeStatus]}</span>
            </div>

            {renderDigitPanel(displayCode, digitTone, {
              onClickCode: displayCode ? () => handleCopy(displayCode.code) : undefined,
              countdownLabel,
              countdownOverride,
            })}

            {sessionOfflineCount > 0 && (
              <div className={`${s.statusSummary} ${s.warn}`}>
                <span className={`material-symbols-outlined ${s.icon}`}>cleaning_services</span>
                <span>{sessionOfflineCount} 条离线会话 · 长期不再使用可清理</span>
              </div>
            )}

            {controlSessions.length > 0 && (
              <div className={s.sessionBox}>
                <div className={s.sessionBoxHeader}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>devices</span>
                  <span>已连接中控 · {controlSessions.length} 条 / {sessionOnlineCount} 在线</span>
                  <Popconfirm
                    title={`确认删除 ${sessionOfflineCount} 条离线会话？（不可恢复）`}
                    disabled={sessionOfflineCount === 0}
                    onConfirm={() => cleanupStaleMutation.mutate()}
                  >
                    <button className={s.cleanup} disabled={sessionOfflineCount === 0}>
                      清理离线会话
                    </button>
                  </Popconfirm>
                </div>
                {controlSessions.map(renderControlSession)}
              </div>
            )}
          </div>
        </div>

        <div className={s.cardFooter}>
          {showHistory && hc.historyCodes.length > 0 && (
            <span className={s.historyToggle} onClick={() => toggleExpand(hc.key)}>
              <span className={`${s.arrow} ${isExpanded ? s.arrowOpen : ''}`}>▸</span>
              {hc.historyCodes.length} 条历史记录
            </span>
          )}
          <Space size="small" style={{ marginLeft: 'auto' }}>
            {actionCode && !isCodeLocked(actionCode) && (
              <RiskyActionButton
                action="pairing.manage"
                type="link"
                size="small"
                confirmTitle="重新生成展厅码"
                confirmContent="旧码将立即作废。请填写重新生成的原因（≥ 5 字，审计用）。"
                onConfirm={async (reason) => {
                  await regenerateMutation.mutateAsync({ codeId: actionCode.id, reason });
                }}
              >
                重新生成
              </RiskyActionButton>
            )}
            {hc.currentCode && isCodeLocked(hc.currentCode) && (
              <RiskyActionButton
                action="pairing.manage"
                type="link"
                size="small"
                confirmTitle="解锁展厅码"
                confirmContent="将立即恢复 active 状态。请填写解锁原因（≥ 5 字，审计用）。"
                onConfirm={async (reason) => {
                  await unlockMutation.mutateAsync({ codeId: hc.currentCode!.id, reason });
                }}
              >
                解锁
              </RiskyActionButton>
            )}
            {!displayCode && (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  form.setFieldsValue({ target_type: 'hall', target_id: hallId });
                  setGenerateModalOpen(true);
                }}
              >
                生成展厅码
              </Button>
            )}
          </Space>
        </div>

        {isExpanded && renderHistoryRows(visibleHistory)}
      </div>
    );
  };

  /* ── Guard: non-admin ── */

  if (!isAdmin) {
    return <div className={s.nonAdmin}>仅管理员可管理配对码</div>;
  }

  const loading = codesLoading;

  return (
    <>
      {/* Toolbar */}
      <div className={s.toolbar}>
        <Space size="middle">
          <Space size="small" align="center">
            <Switch size="small" checked={showHistory} onChange={setShowHistory} />
            <span style={{ fontSize: 13, color: 'var(--color-on-surface-variant)' }}>显示历史</span>
          </Space>
        </Space>
        <Space>
          <Button onClick={() => {
            form.resetFields();
            if (mode === 'exhibit' && exhibitId) {
              form.setFieldsValue({ target_type: 'exhibit', target_id: exhibitId });
            } else if (mode === 'hall') {
              form.setFieldsValue({ target_type: 'hall', target_id: hallId });
            }
            setGenerateModalOpen(true);
          }}>
            生成配对码
          </Button>
          {tab === 'exhibit' && !exhibitId && (
            <RiskyActionButton
              action="pairing.manage"
              loading={batchMutation.isPending}
              confirmTitle="批量生成配对码"
              confirmContent="将为所有未配对展项生成新配对码。请填写批量生成的原因（≥ 5 字，审计用）。"
              onConfirm={async (reason) => {
                await batchMutation.mutateAsync({ reason });
              }}
            >
              批量生成
            </RiskyActionButton>
          )}
          {tab === 'exhibit' && <Button onClick={handleExport}>导出</Button>}
        </Space>
      </div>

      {/* 色系图例 */}
      {!exhibitId && <Legend />}

      {/* 待配对设备 */}
      {tab === 'exhibit' && (
        announcedDevices.length > 0 ? (
          <div className={s.announceSection}>
            <div className={s.announceSectionHeader}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-primary)' }}>cell_tower</span>
              <span>待配对设备（{announcedDevices.length}）</span>
              <span className={s.announcePulse} />
            </div>
            {announcedDevices.map((device: AnnouncedDevice) => {
              const info = device.device_info as DeviceInfo | undefined;
              const icon = getPlatformIcon(info?.os);
              const hostname = info?.hostname || device.machine_code;
              const networkInfo = formatNetworkInfo(info);
              const remaining = formatCountdown(device.expires_at, nowMs);
              const selectedExhibit = announceExhibits[device.code];
              return (
                <div key={device.code} className={s.announceCard}>
                  <div className={s.announceDeviceRow}>
                    <div className={s.deviceInfo} style={{ flex: 1 }}>
                      <span className={`material-symbols-outlined ${s.platformIcon}`}>{icon}</span>
                      <div className={s.deviceDetails}>
                        <span className={s.deviceText}>{hostname}</span>
                        {networkInfo && <span className={s.deviceNetwork}>{networkInfo}</span>}
                      </div>
                    </div>
                    <Tooltip title="点击复制">
                      <span className={`${s.digitGroup}`} style={{ fontSize: 18 }} onClick={() => handleCopy(device.code)}>
                        <span>{device.code.slice(0,3)}</span>
                        <span className={s.sep}>·</span>
                        <span>{device.code.slice(3,6)}</span>
                      </span>
                    </Tooltip>
                    <span className={`${s.countdown} ${remaining.cls}`}>{remaining.text}</span>
                  </div>
                  <div className={s.announceActionRow}>
                    <span style={{ fontSize: 13, color: 'var(--color-on-surface-variant)' }}>配对到</span>
                    <Select
                      size="small"
                      style={{ width: 160 }}
                      placeholder="选择展项"
                      options={unpairedExhibitOptions}
                      value={selectedExhibit}
                      onChange={(v) => setAnnounceExhibits((prev) => ({ ...prev, [device.code]: v }))}
                      notFoundContent={<span style={{ fontSize: 12, color: 'var(--color-outline)' }}>所有展项已配对</span>}
                    />
                    <Button
                      type="primary"
                      size="small"
                      disabled={!selectedExhibit}
                      loading={pairAnnouncedMutation.isPending}
                      onClick={() => selectedExhibit && pairAnnouncedMutation.mutate({ announce_code: device.code, exhibit_id: selectedExhibit })}
                    >
                      确认配对
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : !exhibitId && (
          <div className={s.announceEmpty}>
            <span className={s.dot} />
            <span>待配对设备</span>
            <span className={s.tail}>暂无 · 每 5 秒自动刷新</span>
          </div>
        )
      )}

      {/* Card list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-outline)' }}>加载中...</div>
      ) : tab === 'exhibit' ? (
        <div className={`${s.cardList} ${exhibitId ? s.single : ''}`}>
          {displayGroups.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>
                <span className="material-symbols-outlined" style={{ fontSize: 48 }}>inventory_2</span>
              </div>
              <p>当前展厅暂无展项</p>
              <p>
                <a href={`/halls/${hallId}/exhibit-management`}>前往展项管理 →</a>
              </p>
            </div>
          ) : (
            displayGroups.map((g, i) => renderExhibitCard(g, i))
          )}
        </div>
      ) : (
        <div className={`${s.cardList} ${s.single}`}>
          {renderHallCodeCard(hallCodes)}
        </div>
      )}

      {/* Switch Hall Modal */}
      <Modal
        title={`切换展厅 — ${switchingSession?.user_name}`}
        open={switchModalOpen}
        onOk={() => switchingSession && targetHallId && switchHallMutation.mutate({ sessionId: switchingSession.id, newHallId: targetHallId })}
        onCancel={() => setSwitchModalOpen(false)}
        confirmLoading={switchHallMutation.isPending}
        okButtonProps={{ disabled: !targetHallId }}
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          <Select
            style={{ width: '100%' }}
            placeholder="选择目标展厅"
            options={allHalls.filter((h: HallListItem) => h.id !== hallId).map((h: HallListItem) => ({ value: h.id, label: h.name }))}
            value={targetHallId}
            onChange={setTargetHallId}
          />
        </div>
      </Modal>

      {/* Generate Modal */}
      <Modal
        title="生成配对码"
        open={generateModalOpen}
        onOk={() => {
          // pairing.manage 是 critical action，后端要求 reason ≥ 5 字
          form.validateFields(['reason']).then(({ reason }) => {
            handleGenerate(reason);
          });
        }}
        onCancel={() => setGenerateModalOpen(false)}
        confirmLoading={generateMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="target_type"
            label="类型"
            rules={[{ required: true, message: '请选择类型' }]}
            initialValue={mode ?? 'exhibit'}
          >
            <Select
              disabled={!!mode}
              options={[
                { value: 'exhibit', label: '展项配对码（一次性）' },
                { value: 'hall', label: '展厅配对码（可多次使用）' },
              ]}
              onChange={(val) => {
                form.setFieldValue('target_id', val === 'hall' ? hallId : undefined);
              }}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.target_type !== cur.target_type}
          >
            {({ getFieldValue }) =>
              getFieldValue('target_type') === 'exhibit' ? (
                <Form.Item name="target_id" label="展项" rules={[{ required: true, message: '请选择展项' }]}>
                  <Select
                    options={exhibitId ? exhibitOptions.filter((o) => o.value === exhibitId) : exhibitOptions}
                    disabled={!!exhibitId}
                    placeholder="选择展项"
                  />
                </Form.Item>
              ) : (
                <Form.Item name="target_id" label="展厅" initialValue={hallId}>
                  <Select disabled options={[{ value: hallId, label: '当前展厅' }]} />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item
            name="reason"
            label="操作原因（审计用）"
            rules={[
              { required: true, message: '请填写操作原因（≥ 5 字）' },
              { min: 5, message: '操作原因至少 5 个字' },
            ]}
            extra="pairing.manage 为 critical action，后端会校验该原因并写入审计日志。"
          >
            <Input.TextArea
              rows={3}
              placeholder="例：定期更新配对码 / 调试现场设备"
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
