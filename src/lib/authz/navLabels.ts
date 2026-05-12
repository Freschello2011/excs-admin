/**
 * navLabels —— 业务域中文显示名（与 sidebar IA 同源）。
 *
 * 作为 actionMeta.ts `DOMAIN_LABELS`、UserAuthzPanel「能做什么」卡片、AuditLog
 * formatter 等多视图共用的"人话"映射，避免下次 sidebar 改 IA 后又跟用户详情漂移。
 *
 * 维护红线：sidebar 入口文案变更（04-admin/src/layouts/AdminLayout.tsx）时，
 * 必须检查本表是否需要同步；反之亦然。命名以 sidebar 新 IA 为准。
 *
 * 注意：本表是「业务域 → 中文名」映射，不是「sidebar 入口 → 中文名」。两者并非
 * 1:1（例如 sidebar 入口『中控管理』覆盖 panel+app 双域；『日志』覆盖 audit+业务日志）。
 * 用户详情「能做什么」按域分组，使用本表；sidebar 入口名仍由 AdminLayout 各自定义。
 */

/** 业务域代码 → 中文显示名（与 sidebar 新 IA 对齐） */
export const AUTHZ_DOMAIN_DISPLAY_LABELS: Record<string, string> = {
  hall: '展厅',
  exhibit: '展项',
  device: '设备',
  scene: '场景',
  content: '内容总库',
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
  analytics: '运营分析',
  dashboard: '仪表盘',
  catalog: '设备目录',
  release: '展厅软件发布',
  config: '系统参数',
  nas: 'NAS 归档',
  user: '人员与授权',
  vendor: '供应商',
  audit: '权限审计',
  platform: '平台监控',
};
