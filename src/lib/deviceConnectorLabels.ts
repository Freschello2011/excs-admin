/**
 * device-mgmt-v2 P6 — 业务术语映射（PM 化）
 *
 * 视觉契约红线：admin 主流程 UI 不暴露 schema 字段名 / 枚举字面值。把
 * connector_kind / pattern_kind / transport / EventKind / schedule_kind /
 * action.kind 全部映射成业务话。详见 mockup README §修订轮次记录第 2 轮 "B"。
 */
import type {
  ConnectorKind,
  PatternKind,
  TransportKind,
  EventKind,
  ScheduleKind,
  ActionKind,
  ResourceKind,
} from '@/types/deviceConnector';

export const CONNECTOR_KIND_LABEL: Record<ConnectorKind, string> = {
  preset: '已支持型号',
  protocol: '标准协议',
  raw_transport: '自定义',
  plugin: '插件',
};

export const CONNECTOR_KIND_ICON: Record<ConnectorKind, string> = {
  preset: '⛀',
  protocol: '⛁',
  raw_transport: '⛂',
  plugin: '⛃',
};

export const CONNECTOR_KIND_DESC: Record<ConnectorKind, string> = {
  preset: '从已支持的型号库挑一个，命令清单 / 心跳全自动配好',
  protocol: '设备走标准协议（如 PJLink / Modbus / Art-Net）',
  raw_transport: '自研 / 非标设备，自己定义命令和监听规则',
  plugin: '通过插件接入复杂会话型设备（如智能开关、自动化平台）',
};

export const TRANSPORT_LABEL: Record<TransportKind, string> = {
  tcp: '网线 (TCP)',
  udp: '网线 (UDP)',
  serial: '串口 (COM/USB转串口)',
  osc: 'OSC 控制',
  artnet: 'DMX 灯控 (Art-Net)',
  modbus: '工控 (Modbus TCP)',
  http: 'HTTP',
  smyoo: '闪优 Smyoo 云网关',
};

export const PATTERN_KIND_LABEL: Record<PatternKind, string> = {
  exact: '完全相等',
  regex: '模糊匹配',
  bytes: '二进制',
};

export const PATTERN_KIND_HELP: Record<PatternKind, string> = {
  exact: '完整字符串一字不差，例：STAGE_START',
  regex: '用正则表达式描述，例：^STAGE_(\\d+)$',
  bytes: '十六进制字节序列，例：FF 01 02 0A',
};

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  outbound: '发出',
  inbound: '收到',
  listener_hit: '命中',
  listener_miss: '没命中',
  trigger_fire: '触发',
  poll_cycle: '轮询',
  error: '错误',
};

export const EVENT_KIND_COLOR: Record<EventKind, string> = {
  outbound: '#1677ff',
  inbound: '#13c2c2',
  listener_hit: '#52c41a',
  listener_miss: '#fa8c16',
  trigger_fire: '#722ed1',
  poll_cycle: '#8c8c8c',
  error: '#ff4d4f',
};

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  cron: '周期（每天 / 每周）',
  once_at: '单次时刻',
  interval: '间隔重复',
};

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  scene: '🎬 切场景',
  command: '⚙ 下发命令',
  media: '▶ 播放媒体',
  query: '🔍 查询设备',
  webhook: '🌐 调外部接口',
};

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  tcp_port: 'TCP 端口',
  udp_port: 'UDP 端口',
  osc_port: 'OSC 端口',
  serial_port: '串口',
  artnet_universe: 'DMX 灯控 (Art-Net)',
  modbus_unit: 'Modbus 设备',
};

/** Resource identifier 格式（mockup §"Resource 标识符格式"） */
export function formatResourceIdentifier(
  kind: ResourceKind,
  bind: Record<string, unknown>,
): string {
  switch (kind) {
    case 'tcp_port':
    case 'udp_port':
    case 'osc_port':
      return `:${bind.port ?? '?'}`;
    case 'serial_port':
      return String(bind.com ?? bind.path ?? '?');
    case 'artnet_universe':
      return `universe:${bind.universe ?? '?'}`;
    case 'modbus_unit':
      return `unit:${bind.unit_id ?? 1}@${bind.host ?? '?'}:${bind.port ?? 502}`;
    default:
      return '?';
  }
}

/** transport → resource_kind（用于 _check_conflict 调用） */
export function transportToResourceKind(t: TransportKind): ResourceKind | null {
  switch (t) {
    case 'tcp':
      return 'tcp_port';
    case 'udp':
      return 'udp_port';
    case 'osc':
      return 'osc_port';
    case 'serial':
      return 'serial_port';
    case 'artnet':
      return 'artnet_universe';
    case 'modbus':
      return 'modbus_unit';
    default:
      return null;
  }
}
