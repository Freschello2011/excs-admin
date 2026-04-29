/**
 * device-mgmt-v2 P9-E.2 — 扫描发现 / 直连兜底 前端类型。
 *
 * 大部分 schema 来自 OpenAPI 单源（DiscoveryScanRequest / DiscoveryResultItem 等），
 * 这里只 re-export + UI 渲染辅助常量（icon / 协议中文名 / 协议→connector 映射）。
 *
 * 详见 PRD-field-deployment §3.5 / DDD-field-deployment §五 / ADR-0016。
 */
import type { components } from '@/api/gen/schema.gen';

export type ProbeProtocol = components['schemas']['DiscoveryScanRequest']['protocols'][number];
export type Confidence = components['schemas']['DiscoveryResultItem']['confidence'];
export type DiscoveryResult = components['schemas']['DiscoveryResultItem'];
export type DiscoveryResultSnapshot = components['schemas']['DiscoveryResultSnapshot'];
export type DiscoveryScanRequest = components['schemas']['DiscoveryScanRequest'];
export type DiscoveryScanResponse = components['schemas']['DiscoveryScanResponse'];

export const PROTOCOL_LABEL: Record<ProbeProtocol, string> = {
  pjlink: 'PJLink',
  artnet: 'Art-Net',
  modbus: 'Modbus TCP',
  smyoo: '闪优 Smyoo',
  wol: 'WOL（Windows / Mac）',
  serial: '本机串口',
};

export const PROTOCOL_ICON: Record<ProbeProtocol, string> = {
  pjlink: '📽️',
  artnet: '🎨',
  modbus: '⚙️',
  smyoo: '🌐',
  wol: '🖥️',
  serial: '🔌',
};

export const PROTOCOL_DESC: Record<ProbeProtocol, string> = {
  pjlink: 'UDP 4352 广播',
  artnet: 'UDP 6454 ArtPoll',
  modbus: '扫 192.168.x.0/24:502',
  smyoo: '用已配凭据查 mcuids',
  wol: 'mDNS / NetBIOS',
  serial: '列出空闲 COM 口',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: '高置信',
  medium: '中置信',
  low: '低置信',
};
