/**
 * actionMeta —— Action 注册表派生的展示常量。
 *
 * 抽自 RoleTemplateEditPage.tsx 的 `DOMAIN_LABELS` / `RISK_META`，作为 UserAuthzPanel
 * /HallAuthzPanel /Wizard 等多视图共用的人话映射；后端真相源仍是
 * `02-server/internal/domain/authz/action.go` 的 64-action 注册表。
 *
 * `DOMAIN_ORDER` 按 PRD §5 高频在前的顺序排列：展厅运营 → 内容/演出 → AI/中控 →
 * 配对/智能家居 → 全局资产 → 人/审计 → 平台。
 */
import type { RiskLevel } from '@/api/gen/client';

/** 域代码 → 中文名（PRD §5 分域标题） */
export const DOMAIN_LABELS: Record<string, string> = {
  hall: '展厅',
  exhibit: '展项',
  device: '设备',
  scene: '场景',
  content: '内容库',
  show: '演出',
  panel: '中控面板',
  notification: '通知',
  ai: 'AI 形象',
  template: '形象模板',
  knowledge: '知识库',
  tts: 'TTS',
  pairing: '配对',
  app: '展厅 App',
  smarthome: '智能家居',
  analytics: '统计分析',
  dashboard: '仪表盘',
  catalog: '设备目录',
  release: '版本发布',
  config: '系统配置',
  nas: 'NAS 归档',
  user: '用户与授权',
  vendor: '供应商',
  audit: '审计',
  platform: '平台监控',
};

/** 业务域优先级（高频在前；未列出的回退到末尾按字母序） */
export const DOMAIN_ORDER: string[] = [
  'hall',
  'exhibit',
  'device',
  'scene',
  'content',
  'show',
  'panel',
  'notification',
  'ai',
  'template',
  'knowledge',
  'tts',
  'pairing',
  'app',
  'smarthome',
  'analytics',
  'dashboard',
  'catalog',
  'release',
  'config',
  'nas',
  'user',
  'vendor',
  'audit',
  'platform',
];

export function getDomainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

/** 排序比较器（业务域优先级；未知域按字母序排末尾） */
export function compareDomain(a: string, b: string): number {
  const ia = DOMAIN_ORDER.indexOf(a);
  const ib = DOMAIN_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

export const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  info: { label: '提示', color: 'default' },
  low: { label: '常规', color: 'blue' },
  medium: { label: '中', color: 'gold' },
  high: { label: '高危', color: 'orange' },
  critical: { label: '极危', color: 'red' },
};

export const RISK_ORDER: RiskLevel[] = ['info', 'low', 'medium', 'high', 'critical'];

/** 风险逆序：critical 在前，便于"高危先看见" */
export function compareRiskDesc(a: RiskLevel, b: RiskLevel): number {
  return RISK_ORDER.indexOf(b) - RISK_ORDER.indexOf(a);
}
