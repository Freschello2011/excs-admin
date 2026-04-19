import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Form, Select, Space, Tag, Popconfirm, Segmented, Switch, Tooltip } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import dayjs from 'dayjs';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type {
  PairingCodeListItem,
  PairingCodeStatus,
  ExhibitListItem,
  AppInstanceListItem,
  DeviceInfo,
  ControlAppSessionItem,
  HallListItem,
  AnnouncedDevice,
} from '@/types/hall';
import s from './PairingCodeTab.module.scss';

interface PairingCodeTabProps {
  hallId: number;
  isAdmin: boolean;
  /** 限制显示内容：'exhibit' 只展项；'hall' 只展厅码/中控；undefined 全显（兼容旧用法） */
  mode?: 'exhibit' | 'hall';
  /** 仅展项模式下：限定单个展项的配对码卡片（用于展项详情页） */
  exhibitId?: number;
}

const maxDebugInstances = 3;

/* ── Status helpers ── */

const STATUS_TAG: Record<string, { text: string; color: string }> = {
  paired: { text: '已配对', color: 'green' },
  activeCode: { text: '有效码', color: 'blue' },
  locked: { text: '已锁定', color: 'red' },
  unpaired: { text: '未配对', color: 'default' },
  codeExpired: { text: '码已过期', color: 'orange' },
};

const CODE_STATUS: Record<PairingCodeStatus, { text: string; color: string }> = {
  active: { text: '有效', color: 'green' },
  used: { text: '已使用', color: 'default' },
  expired: { text: '已过期', color: 'default' },
  locked: { text: '已锁定', color: 'red' },
};

/* ── Time helpers ── */

function formatRemaining(expiresAt: string): { text: string; className: string } {
  const diff = dayjs(expiresAt).diff(dayjs(), 'minute');
  if (diff <= 0) return { text: '已过期', className: s.timeExpired };
  if (diff < 60) return { text: `剩余 ${diff}min`, className: s.timeDanger };
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours < 6) return { text: `剩余 ${hours}h ${mins}min`, className: s.timeWarn };
  return { text: `剩余 ${hours}h`, className: s.timeInfo };
}

function formatShortTime(iso: string): string {
  return dayjs(iso).format('MM-DD HH:mm');
}

/* ── Heartbeat helpers ── */

function formatHeartbeat(ts: string | null): { text: string; isOnline: boolean } {
  if (!ts) return { text: '未上报', isOnline: false };
  const diff = dayjs().diff(dayjs(ts), 'minute');
  if (diff < 3) return { text: '在线', isOnline: true };
  if (diff < 60) return { text: `${diff}分钟前`, isOnline: false };
  const hours = Math.floor(diff / 60);
  if (hours < 24) return { text: `${hours}小时前`, isOnline: false };
  return { text: dayjs(ts).format('MM-DD HH:mm'), isOnline: false };
}

/* ── Device helpers ── */

function getPlatformIcon(os?: string): string {
  if (!os) return 'computer';
  const lower = os.toLowerCase();
  if (lower.includes('windows')) return 'desktop_windows';
  if (lower.includes('mac') || lower.includes('darwin')) return 'laptop_mac';
  return 'computer';
}

function formatNetworkInfo(info?: DeviceInfo): string {
  if (!info) return '';
  const parts: string[] = [];
  if (info.local_ip) parts.push(info.local_ip);
  if (info.mac_address) parts.push(info.mac_address);
  return parts.join(' · ');
}

/* ── Code effective status (considers expires_at) ── */

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
  currentCode?: PairingCodeListItem;      // active or locked code
  latestCode?: PairingCodeListItem;       // most recent code of any status (for display)
  debugCode?: PairingCodeListItem;        // active debug pairing code
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

/* ── Main component ── */

export default function PairingCodeTab({ hallId, isAdmin, mode, exhibitId }: PairingCodeTabProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [form] = Form.useForm();
  // 固定模式时锁定 tab 值；无 mode 时保留原 Segmented 切换
  const [innerTab, setInnerTab] = useState<'exhibit' | 'hall'>(mode ?? 'exhibit');
  const tab: 'exhibit' | 'hall' = mode ?? innerTab;
  const setTab = (v: 'exhibit' | 'hall') => {
    if (!mode) setInnerTab(v);
  };
  const [showHistory, setShowHistory] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [announceExhibits, setAnnounceExhibits] = useState<Record<string, number>>({});
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [switchingSession, setSwitchingSession] = useState<ControlAppSessionItem | null>(null);
  const [targetHallId, setTargetHallId] = useState<number | null>(null);

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
    mutationFn: (data: { target_type: 'exhibit' | 'hall'; target_id: number }) =>
      hallApi.generatePairingCode(hallId, data),
    onSuccess: () => {
      message.success('配对码已生成');
      invalidate();
      setGenerateModalOpen(false);
    },
    onError: () => message.error('生成失败，目标可能已有有效配对码'),
  });

  const batchMutation = useMutation({
    mutationFn: () => hallApi.batchGeneratePairingCodes(hallId),
    onSuccess: (res) => {
      const data = res.data.data;
      message.success(`批量生成完成：${data.generated.length} 个成功，${data.skipped.length} 个跳过`);
      invalidate();
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (codeId: number) => hallApi.regeneratePairingCode(hallId, codeId),
    onSuccess: () => {
      message.success('配对码已重新生成');
      invalidate();
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (codeId: number) => hallApi.unlockPairingCode(hallId, codeId),
    onSuccess: () => {
      message.success('配对码已解锁');
      invalidate();
    },
  });

  const generateDebugMutation = useMutation({
    mutationFn: (data: { exhibit_id: number; ttl_hours?: number }) =>
      hallApi.generateDebugPairingCode(hallId, data),
    onSuccess: () => {
      message.success('调试配对码已生成');
      invalidate();
    },
    onError: () => message.error('生成调试码失败，可能已有有效码或调试实例已达上限'),
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

  const switchMasterMutation = useMutation({
    mutationFn: (newMasterExhibitId: number) =>
      hallApi.switchMaster(hallId, { new_master_exhibit_id: newMasterExhibitId }),
    onSuccess: () => {
      message.success('主控切换成功');
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hallId) });
    },
  });

  const switchHallMutation = useMutation({
    mutationFn: ({ sessionId, newHallId }: { sessionId: number; newHallId: number }) =>
      hallApi.switchControlAppHall(hallId, sessionId, { new_hall_id: newHallId }),
    onSuccess: () => {
      message.success('展厅切换成功');
      invalidate();
      setSwitchModalOpen(false);
    },
    onError: () => message.error('切换失败'),
  });

  const pairAnnouncedMutation = useMutation({
    mutationFn: (data: { announce_code: string; exhibit_id: number }) =>
      hallApi.pairAnnouncedDevice(hallId, data),
    onSuccess: () => {
      message.success('设备配对成功');
      invalidate();
    },
    onError: () => message.error('配对失败，展项可能已有绑定设备'),
  });

  /* ── Aggregation ── */

  const { exhibitGroups, hallCodes } = useMemo(() => {
    const exhibitCodes = codes.filter((c) => c.target_type === 'exhibit');
    const debugCodes = codes.filter((c) => c.target_type === 'exhibit_debug');
    const hallTypeCodes = codes.filter((c) => c.target_type === 'hall');

    // Build exhibit groups
    const groups: ExhibitGroup[] = exhibits.map((ex: ExhibitListItem) => {
      const exCodes = exhibitCodes
        .filter((c) => c.target_id === ex.id)
        .sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());

      // Debug codes for this exhibit
      const exDebugCodes = debugCodes
        .filter((c) => c.target_id === ex.id)
        .sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());
      const activeDebugCode = exDebugCodes.find((c) => isCodeEffective(c));

      // Primary instance
      const inst = instances.find((i) => i.exhibit_id === ex.id && (i.role === 'primary' || !i.role));
      // Debug instances
      const debugInsts = instances.filter((i) => i.exhibit_id === ex.id && i.role === 'debug');

      // Current code = truly active (not expired) or locked; latestCode = most recent of any status
      const currentCode = exCodes.find((c) => isCodeEffective(c) || isCodeLocked(c));
      const latestCode = exCodes[0]; // already sorted desc
      const historyCodes = exCodes.filter((c) => c !== (currentCode || latestCode));

      // Determine status: instance exists → paired (regardless of code expiry)
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

    // Hall codes
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
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleGenerate = () => {
    form.validateFields().then((values) => {
      generateMutation.mutate(values);
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
  // 仅未配对展项（用于反向配对的展项选择）
  const unpairedExhibitOptions = exhibits
    .filter((e: ExhibitListItem) => !instances.some((i) => i.exhibit_id === e.id && (i.role === 'primary' || !i.role)))
    .map((e: ExhibitListItem) => ({ value: e.id, label: e.name }));
  const exhibitCount = exhibitGroups.length;
  // const hallCount = (hallCodes.currentCode || hallCodes.latestCode) ? 1 : 0;

  // Filter exhibit groups: single exhibit (if exhibitId) + showHistory rules
  const displayGroups = exhibitGroups
    .filter((g) => (exhibitId ? g.exhibitId === exhibitId : true))
    .filter((g) => {
      if (showHistory) return true;
      // Hide exhibits that have no current code, no instance, and only expired history
      if (g.status === 'unpaired' && g.historyCodes.length > 0 && !g.currentCode && !g.instance) return false;
      return true;
    });

  /* ── Sub-renders ── */

  const renderCodeCell = (code?: PairingCodeListItem) => {
    if (!code) return <span className={s.noCode}>—</span>;
    const isCopied = copiedCode === code.code;
    return (
      <Tooltip title="点击复制">
        <span
          className={`${s.code} ${isCopied ? s.codeCopied : ''}`}
          onClick={() => handleCopy(code.code)}
        >
          {code.code}
        </span>
      </Tooltip>
    );
  };

  const renderTime = (code?: PairingCodeListItem) => {
    if (!code) return <span className={s.noCode}>—</span>;
    const { text, className } = formatRemaining(code.expires_at);
    return <span className={className}>{text}</span>;
  };

  const renderDevice = (instance?: AppInstanceListItem) => {
    if (!instance) return <div className={s.deviceInfo}>—</div>;
    const info = instance.device_info;
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
            {instance.is_hall_master && <Tag color="blue" style={{ fontSize: 11, lineHeight: '18px', padding: '0 4px', marginLeft: 4 }}>主控</Tag>}
            <span className={`${s.heartbeat} ${hb.isOnline ? s.heartbeatOnline : ''}`}>
              <span className={s.heartbeatDot} />
              {hb.text}
            </span>
          </div>
          {networkInfo && (
            <Tooltip title="点击复制">
              <span className={s.deviceNetwork} onClick={() => handleCopy(networkInfo)}>
                {networkInfo}
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  const renderStatusTag = (status: string, failedAttempts?: number) => {
    const info = STATUS_TAG[status] || STATUS_TAG.unpaired;
    const label = failedAttempts && failedAttempts > 0 ? `${info.text} · ${failedAttempts}次` : info.text;
    return <Tag color={info.color}>{label}</Tag>;
  };

  const renderHistoryRows = (historyCodes: PairingCodeListItem[]) => {
    if (historyCodes.length === 0) return null;
    return (
      <div className={s.historyList}>
        {historyCodes.map((hc) => {
          const codeInfo = CODE_STATUS[hc.status] || CODE_STATUS.expired;
          return (
            <div key={hc.id} className={s.historyRow}>
              <span className={s.historyCode}>{hc.code}</span>
              <Tag color={codeInfo.color} style={{ fontSize: 12 }}>{codeInfo.text}</Tag>
              <span>{formatShortTime(hc.created_at)}</span>
              {hc.used_by_instance_id && (
                <span className={s.historyDevice}>
                  → {instances.find((i) => i.id === hc.used_by_instance_id)?.device_info?.hostname || '设备'}
                </span>
              )}
              {hc.failed_attempts > 0 && (
                <span style={{ color: 'var(--color-error, #ff4d4f)' }}>失败 {hc.failed_attempts}次</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDebugInstance = (di: AppInstanceListItem) => {
    const hostname = di.device_info?.hostname || '—';
    const networkInfo = formatNetworkInfo(di.device_info);
    const icon = getPlatformIcon(di.device_info?.os);
    const remaining = di.debug_expires_at ? formatRemaining(di.debug_expires_at) : null;

    return (
      <div key={di.id} className={s.debugRow}>
        <div className={s.deviceInfo}>
          <span className={`material-symbols-outlined ${s.platformIcon}`}>{icon}</span>
          <div className={s.deviceDetails}>
            <span className={s.deviceText}>{hostname}</span>
            {networkInfo && <span className={s.deviceNetwork}>{networkInfo}</span>}
          </div>
        </div>
        {remaining && <span className={remaining.className}>{remaining.text}</span>}
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

  const renderExhibitCard = (group: ExhibitGroup) => {
    const isExpanded = expandedKeys.has(group.key);
    const visibleHistory = showHistory ? group.historyCodes : [];
    // Display code: prefer active/locked, fallback to latest (for showing expired codes)
    const displayCode = group.currentCode || group.latestCode;
    // Actionable code for regenerate
    const actionCode = group.currentCode || group.latestCode;
    const hasDebug = group.debugInstances.length > 0 || group.debugCode;

    return (
      <div key={group.key} className={s.card}>
        {/* Row 1: Name + Status */}
        <div className={s.cardHeader}>
          <span className={s.targetName}>{group.exhibitName}</span>
          {renderStatusTag(group.status, group.failedAttempts)}
        </div>

        {/* Row 2: Primary Device | Code | Time */}
        <div className={s.cardBody}>
          {renderDevice(group.instance)}
          <div className={s.codeWrap}>{renderCodeCell(displayCode)}</div>
          {renderTime(displayCode)}
        </div>

        {/* Debug section */}
        {(hasDebug || group.instance) && (
          <div className={s.debugSection}>
            {group.debugInstances.length > 0 && (
              <div className={s.debugHeader}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bug_report</span>
                <span>调试实例 ({group.debugInstances.length}/{maxDebugInstances})</span>
              </div>
            )}
            {group.debugInstances.map(renderDebugInstance)}
            {group.debugCode && (
              <div className={s.debugCodeRow}>
                <span style={{ fontSize: 12, color: 'var(--color-outline)' }}>调试码</span>
                <span className={s.code} style={{ fontSize: 14 }} onClick={() => handleCopy(group.debugCode!.code)}>
                  {group.debugCode.code}
                </span>
                {renderTime(group.debugCode)}
              </div>
            )}
            {group.instance && group.debugInstances.length < maxDebugInstances && !group.debugCode && (
              <Popconfirm
                title="生成调试配对码？默认有效期 10 小时"
                onConfirm={() => generateDebugMutation.mutate({ exhibit_id: group.exhibitId })}
              >
                <Button
                  type="dashed"
                  size="small"
                  icon={<span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>}
                  className={s.addDebugBtn}
                >
                  添加调试实例
                </Button>
              </Popconfirm>
            )}
          </div>
        )}

        {/* Row 3: History toggle + Actions */}
        <div className={s.cardFooter}>
          <div>
            {(showHistory && group.historyCodes.length > 0) && (
              <span className={s.historyToggle} onClick={() => toggleExpand(group.key)}>
                <span className={`${s.arrow} ${isExpanded ? s.arrowOpen : ''}`}>▸</span>
                {group.historyCodes.length} 条历史记录
              </span>
            )}
          </div>
          <Space size="small" split={<span style={{ color: 'var(--color-outline-variant)', fontSize: 11 }}>·</span>}>
            {group.instance && !group.instance.is_hall_master && (
              <Popconfirm title="确认设为主控？" onConfirm={() => switchMasterMutation.mutate(group.exhibitId)}>
                <Button type="link" size="small">设为主控</Button>
              </Popconfirm>
            )}
            {group.instance && (
              <Popconfirm title="确认解绑？解绑后设备将断开" onConfirm={() => unpairMutation.mutate(group.instance!.id)}>
                <Button type="link" size="small" danger>解绑</Button>
              </Popconfirm>
            )}
            {actionCode && (actionCode.status !== 'locked') && (
              <Popconfirm title="确认重新生成？旧码将作废" onConfirm={() => regenerateMutation.mutate(actionCode.id)}>
                <Button type="link" size="small">重新生成</Button>
              </Popconfirm>
            )}
            {group.currentCode?.status === 'locked' && (
              <Button type="link" size="small" onClick={() => unlockMutation.mutate(group.currentCode!.id)}>
                解锁
              </Button>
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

        {/* History rows */}
        {isExpanded && renderHistoryRows(visibleHistory)}
      </div>
    );
  };

  const renderControlSession = (session: ControlAppSessionItem) => {
    const isOnline = session.status === 'online';
    return (
      <div key={session.id} className={s.sessionRow}>
        <div className={s.sessionUser}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-on-surface-variant)' }}>person</span>
          <span className={s.sessionName}>{session.user_name}</span>
          <span className={`${s.heartbeat} ${isOnline ? s.heartbeatOnline : ''}`}>
            <span className={s.heartbeatDot} />
            {isOnline ? '在线' : '离线'}
          </span>
        </div>
        <Tooltip title={session.device_uuid}>
          <span className={s.sessionDevice}>{session.device_uuid.slice(0, 18)}...</span>
        </Tooltip>
        <span className={s.sessionTime}>活跃 {formatShortTime(session.last_active_at)}</span>
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

    return (
      <div key={hc.key} className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.targetName}>{hc.hallName}（展厅码 · 可复用）</span>
          {renderStatusTag(codeStatus, hc.currentCode?.failed_attempts)}
        </div>

        <div className={s.cardBody}>
          <div className={s.deviceInfo} style={{ minWidth: 200 }}>
            <span style={{ fontSize: 13, color: 'var(--color-on-surface-variant)' }}>多中控共用</span>
          </div>
          <div className={s.codeWrap}>{renderCodeCell(displayCode)}</div>
          {renderTime(displayCode)}
        </div>

        {/* 中控会话列表 */}
        {controlSessions.length > 0 && (
          <div className={s.debugSection}>
            <div className={s.debugHeader}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>devices</span>
              <span>已连接中控（{controlSessions.length}）</span>
            </div>
            {controlSessions.map(renderControlSession)}
          </div>
        )}

        <div className={s.cardFooter}>
          <div>
            {(showHistory && hc.historyCodes.length > 0) && (
              <span className={s.historyToggle} onClick={() => toggleExpand(hc.key)}>
                <span className={`${s.arrow} ${isExpanded ? s.arrowOpen : ''}`}>▸</span>
                {hc.historyCodes.length} 条历史记录
              </span>
            )}
          </div>
          <Space size="small">
            {actionCode && !isCodeLocked(actionCode) && (
              <Popconfirm title="确认重新生成？旧码将作废" onConfirm={() => regenerateMutation.mutate(actionCode.id)}>
                <Button type="link" size="small">重新生成</Button>
              </Popconfirm>
            )}
            {hc.currentCode && isCodeLocked(hc.currentCode) && (
              <Button type="link" size="small" onClick={() => unlockMutation.mutate(hc.currentCode!.id)}>
                解锁
              </Button>
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
                生成配对码
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

  /* ── Main render ── */

  const loading = codesLoading;

  return (
    <>
      {/* Toolbar */}
      <div className={s.toolbar}>
        <Space size="middle">
          {!mode && (
            <Segmented
              value={tab}
              onChange={(v) => setTab(v as 'exhibit' | 'hall')}
              options={[
                { value: 'exhibit', label: `展项 · ${exhibitCount}` },
                { value: 'hall', label: `展厅码与中控 · ${controlSessions.length}` },
              ]}
            />
          )}
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
            <Popconfirm title="为所有未配对展项批量生成配对码？" onConfirm={() => batchMutation.mutate()}>
              <Button loading={batchMutation.isPending}>批量生成</Button>
            </Popconfirm>
          )}
          {tab === 'exhibit' && <Button onClick={handleExport}>导出</Button>}
        </Space>
      </div>

      {/* Announced devices (reverse pairing) */}
      {tab === 'exhibit' && announcedDevices.length > 0 && (
        <div className={s.announceSection}>
          <div className={s.announceSectionHeader}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-primary)' }}>cell_tower</span>
            <span>待配对设备（{announcedDevices.length}）</span>
            <span className={s.announcePulse} />
          </div>
          {announcedDevices.map((device: AnnouncedDevice) => {
            const info = device.device_info;
            const icon = getPlatformIcon(info?.os);
            const hostname = info?.hostname || device.machine_code;
            const networkInfo = formatNetworkInfo(info);
            const remaining = formatRemaining(device.expires_at);
            const selectedExhibit = announceExhibits[device.code];
            return (
              <div key={device.code} className={s.announceCard}>
                <div className={s.announceDeviceRow}>
                  <div className={s.deviceInfo}>
                    <span className={`material-symbols-outlined ${s.platformIcon}`}>{icon}</span>
                    <div className={s.deviceDetails}>
                      <span className={s.deviceText}>{hostname}</span>
                      {networkInfo && <span className={s.deviceNetwork}>{networkInfo}</span>}
                    </div>
                  </div>
                  <Tooltip title="点击复制">
                    <span className={s.code} style={{ fontSize: 16 }} onClick={() => handleCopy(device.code)}>
                      {device.code}
                    </span>
                  </Tooltip>
                  <span className={remaining.className}>{remaining.text}</span>
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
      )}

      {/* Card list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-outline)' }}>加载中...</div>
      ) : tab === 'exhibit' ? (
        <div className={s.cardList}>
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
            displayGroups.map(renderExhibitCard)
          )}
        </div>
      ) : (
        <div className={s.cardList}>
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
        onOk={handleGenerate}
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
        </Form>
      </Modal>
    </>
  );
}
