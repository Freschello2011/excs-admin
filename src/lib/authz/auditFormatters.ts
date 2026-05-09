/**
 * auditFormatters —— 审计日志的人话渲染 helper。
 *
 * 给 4 个审计视图（仪表盘授权审计 / 权限审计页 / 审计快照卡 / 合规报表）共用，
 * 把 action_code / actor_user_id+account_type / status 这些程序员字段
 * 翻译成业主一眼能懂的标签。原始 code 仍可保留在 tooltip / 副文本里，
 * 既给业主看人话、也给现场排障保留检索能力。
 */
import type { ActionDef } from '@/api/gen/client';

/** 账号类型 → 中文（与 AuditLogListPage 原 ACCOUNT_LABEL 对齐） */
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  internal: '内部',
  vendor: '供应商',
  customer: '客户',
};

export function getAccountTypeLabel(type: string | undefined | null): string {
  if (!type) return '';
  return ACCOUNT_TYPE_LABELS[type] ?? type;
}

/**
 * 操作者人话：优先显 actor_name，缺失时回退到 "用户 #uid"；
 * 末尾追加账号类型小尾巴（"内部 #5" / "供应商 #12"）。
 */
export function formatActorText(args: {
  actorName?: string | null;
  actorUserId?: number | null;
  accountType?: string | null;
}): string {
  const accountLabel = getAccountTypeLabel(args.accountType ?? '');
  const idPart = args.actorUserId ? `#${args.actorUserId}` : '';
  const tail = [accountLabel, idPart].filter(Boolean).join(' ');
  if (args.actorName && args.actorName.trim()) {
    return tail ? `${args.actorName}（${tail}）` : args.actorName;
  }
  if (args.actorUserId) {
    return accountLabel ? `用户 #${args.actorUserId}（${accountLabel}）` : `用户 #${args.actorUserId}`;
  }
  return tail || '—';
}

/** 单条 action 的人话渲染信息（UI 自己决定怎么排版） */
export interface ActionDisplay {
  /** 业主可读名（如 "授权用户"），元数据缺失时回退到 raw code */
  label: string;
  /** 原始 code（如 "user.grant"），始终返回，便于 tooltip / 副文本 */
  code: string;
  /** 域中文（如 "用户与授权"），元数据缺失时为空 */
  domainLabel: string;
  /** 风险等级（info/low/medium/high/critical），元数据缺失时为 undefined */
  risk?: string;
  /** PRD 原文 covered_apis（供 tooltip 显示） */
  coveredApis: string[];
}

/**
 * 把 action_code 翻译成业主可读的展示信息。
 * actionsMap 缺失或找不到 code 时优雅回退（label = code，risk/domain 为空）。
 */
export function formatActionDisplay(
  code: string,
  actionsMap: Map<string, ActionDef> | null | undefined,
  domainLabels: Record<string, string>,
): ActionDisplay {
  const def = actionsMap?.get(code);
  if (!def) {
    return { label: code, code, domainLabel: '', coveredApis: [] };
  }
  return {
    label: def.name_zh || code,
    code,
    domainLabel: domainLabels[def.domain] ?? def.domain,
    risk: def.risk,
    coveredApis: def.covered_apis ?? [],
  };
}

/** status 中文（success → 成功；failure → 失败；其它原样） */
export function formatStatusLabel(status: string | undefined | null): string {
  if (status === 'success') return '成功';
  if (status === 'failure') return '失败';
  return status ?? '';
}
