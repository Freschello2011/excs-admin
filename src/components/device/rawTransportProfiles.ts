/**
 * ADR-0030 §D4 — admin 命令编辑器 profile chips：4 种业务画像 + 完全自定义。
 *
 * 关键约束（D4）：profile 不入库 —— 仅作前端"快捷填充 + 当前形态识别"的纯函数。
 * 落 DB 的永远是展开后的 connection_mode / heartbeat / 每条命令的 expect_response。
 *
 * 业务命名（feedback_excs_ui_plain_chinese 红线）：
 *   chip 文案 / 描述 / 推荐说明都用「灯光盒 / 命令-响应 / 融合软件 / 状态机」这类业务词，
 *   不直接暴露 short/persistent/match/echo 给部署员看。表单内部值仍存原 enum。
 */

import type {
  ConnectionMode,
  ExpectResponseMode,
  HeartbeatConfig,
} from '@/types/deviceConnector';

/** profile 标识键 —— 选中 chip 后存的内部 key（不入库） */
export type RawTransportProfileKey = 'lightbox' | 'request_reply' | 'media_engine' | 'stateful' | 'custom';

/** profile 推荐默认（D4 表 + PRD §3.8 表） */
export interface RawTransportProfile {
  key: RawTransportProfileKey;
  /** chip 上显示的业务词（红线：不要 short / persistent 这种术语） */
  label: string;
  /** 选中后下方副文案，部署员视角的"什么场景用这个" */
  hint: string;
  /** 典型设备列表（tooltip 用） */
  examples: string;
  /** 推荐 connection_mode，custom 不填 */
  connection_mode?: ConnectionMode;
  /** 推荐 heartbeat 子对象，custom 不填 */
  heartbeat?: HeartbeatConfig;
  /** 推荐每条命令的 expect_response.mode 默认值，custom 不填 */
  expect_response_mode?: ExpectResponseMode;
}

export const RAW_TRANSPORT_PROFILES: ReadonlyArray<RawTransportProfile> = [
  {
    key: 'lightbox',
    label: '灯光盒',
    hint: '发完就走，不管设备回不回',
    examples: 'Arduino / ESP32 / 单片机继电器盒',
    connection_mode: 'short',
    heartbeat: { enabled: false },
    expect_response_mode: 'none',
  },
  {
    key: 'request_reply',
    label: '命令-响应',
    hint: '每发一条命令，等设备回话再算成功',
    examples: 'DMX 网关 / 矩阵切换器 / PJ-Link 投影',
    connection_mode: 'short',
    heartbeat: { enabled: false },
    expect_response_mode: 'match',
  },
  {
    key: 'media_engine',
    label: '融合软件',
    hint: '一直挂着连接、每 30 秒探一下设备活着没',
    examples: 'Watchout / Resolume / Dataton / MadMapper',
    connection_mode: 'persistent',
    heartbeat: { enabled: true, interval_ms: 30000, miss_threshold: 3 },
    expect_response_mode: 'match',
  },
  {
    key: 'stateful',
    label: '状态机',
    hint: '一直挂着连接、每 10 秒高频探活',
    examples: '自研中控网关 / KNX over IP',
    connection_mode: 'persistent',
    heartbeat: { enabled: true, interval_ms: 10000, miss_threshold: 3 },
    expect_response_mode: 'match',
  },
  {
    key: 'custom',
    label: '完全自定义',
    hint: '上面 4 种都不像 —— 三个字段都自己拉',
    examples: '不规范协议 / 临时调试 / 在用的特殊设备',
  },
];

/** 给定当前 connection_mode + heartbeat + 全部命令 mode 集合，反推命中哪一个 profile（不命中=custom） */
export function detectProfile(
  connectionMode: ConnectionMode | undefined,
  heartbeat: HeartbeatConfig | undefined,
  commandModes: ReadonlyArray<ExpectResponseMode | undefined>,
): RawTransportProfileKey {
  // 命令 mode 必须全部一致才可能命中某 profile，否则视为自定义
  const distinct = new Set(commandModes.filter((m): m is ExpectResponseMode => !!m));
  if (commandModes.length > 0 && distinct.size !== 1) return 'custom';
  const onlyMode = distinct.size === 1 ? Array.from(distinct)[0] : undefined;

  for (const p of RAW_TRANSPORT_PROFILES) {
    if (p.key === 'custom') continue;
    if (p.connection_mode !== (connectionMode ?? 'short')) continue;
    const hbEnabled = heartbeat?.enabled === true;
    const expectedHbEnabled = p.heartbeat?.enabled === true;
    if (hbEnabled !== expectedHbEnabled) continue;
    // heartbeat enabled 时 interval 也得对上
    if (expectedHbEnabled) {
      const interval = heartbeat?.interval_ms ?? 30000;
      if (interval !== (p.heartbeat?.interval_ms ?? 30000)) continue;
    }
    // commandModes 空 → 仅按 connection 判定（新设备无命令）
    if (commandModes.length === 0 || onlyMode === p.expect_response_mode) {
      return p.key;
    }
  }
  return 'custom';
}
