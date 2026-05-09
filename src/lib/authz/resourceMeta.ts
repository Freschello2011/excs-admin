/**
 * resourceMeta —— 审计日志 resource_type 的中文映射。
 *
 * 服务端真相源：02-server/internal/interfaces/middleware/authz_middleware.go
 * 与 02-server/internal/application/authz/* 中 ResourceType 字面量。
 *
 * 标签风格与 actionMeta.DOMAIN_LABELS 对齐：用业务称呼（"展厅" / "设备"），
 * 而非数据库表名或 DDD 实体名。
 */

/** resource_type → 中文（兼容服务端全部 22 种已用值） */
export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  hall: '展厅',
  exhibit: '展项',
  device: '设备',
  scene: '场景',
  content: '内容',
  show: '演出',
  track: '演出轨道',
  knowledge_file: '知识库文件',
  avatar_template: 'AI 形象模板',
  pairing_code: '配对码',
  app_instance: '展厅 App 实例',
  control_app_session: '中控会话',
  release: '版本',
  app_release: 'App 版本',
  nas_archive: 'NAS 归档',
  smarthome_gateway: '智能家居网关',
  smarthome_rule: '智能家居规则',
  user: '用户',
  vendor: '供应商',
  grant: '权限授予',
  role_template: '角色模板',
  device_brand: '设备品牌',
  device_model: '设备型号',
};

export function getResourceTypeLabel(type: string | undefined | null): string {
  if (!type) return '';
  return RESOURCE_TYPE_LABELS[type] ?? type;
}

/**
 * 把 (resource_type, resource_id) 渲染成"展厅 #3"这种人话。
 * 缺 type 时返回 "—"；type 已知但 id 缺失时只返回类型名。
 */
export function formatResourceText(
  type: string | undefined | null,
  id: string | undefined | null,
): string {
  if (!type) return '—';
  const label = getResourceTypeLabel(type);
  if (!id) return label;
  return `${label} #${id}`;
}
