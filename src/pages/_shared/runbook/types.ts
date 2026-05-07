/**
 * ADR-0020-v2 Stage 5 admin Phase A · ActionStep / PreCond / ContentIntent 本地 typed 视图
 *
 * SSOT：`01-docs/03-api/openapi/components/schemas/runbook.yaml`（S5-2 commit c72b4c67）
 *
 * 为何本地手写而非 import codegen：runbook.yaml 中的 ActionStep / PreCond / ContentIntent
 * 等 schema 当前没被任何 operation 直接 $ref（Stage 5 只落了 POST
 * /commands/device-command-button），redocly bundler 走严格可达性，会把它们 tree-shake 掉。
 * admin-UI §4.20.1 行 851 明确要求：「附 TS 类型源：pages/_shared/runbook/types.ts
 * （与 server OpenAPI components.schemas.ActionStep 保持同步，待 Stage 3 yaml 落地后由
 * codegen 接管）」—— 待 S5-8/S5-9 把 panel.yaml / scene.yaml v2 ActionStep[] 通过 oneOf
 * 接进 operations 后，schemas 自然进入 bundle，可改回 codegen import 并删本文件。
 *
 * 同源参考：
 *   - DDD §3.3 ActionStep / PreCond / ContentIntent
 *   - 02-server/migrations/20260507_runbook_v2_scene_actions.sql
 *   - 02-server/migrations/20260507_runbook_v2_executions_create.sql
 *   - 03-server runbook 域 Go struct
 *   - 05-control-app dart-dio gen（S5-2 同次 codegen）
 */

// ============================================================
// Enum
// ============================================================

/** ActionStep.type 二元类型 */
export type ActionStepType = 'device' | 'content';

/**
 * 8 高频内容意图（部署人员视角）。
 * server 内部翻译为 play_cmd envelope 的最后一公里。
 * admin 编辑器永远不向部署人员展示 play_cmd 名。
 */
export type ContentIntent =
  | 'play_video'
  | 'slideshow_goto'
  | 'show_screen_image'
  | 'clear_screen_image'
  | 'pause_resume'
  | 'stop'
  | 'seek'
  | 'set_volume';

/** Runbook 触发源 */
export type RunbookOriginType = 'scene' | 'device_command_button';

/** Runbook 聚合状态 */
export type RunbookAggregateStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial_failed'
  | 'failed'
  | 'timed_out';

/** 单步状态 */
export type RunbookStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'warn'
  | 'failed'
  | 'skipped';

/** PreCond 5 类 */
export type PreCondType =
  | 'exhibit_app_online'
  | 'device_online'
  | 'hall_master_ready'
  | 'scene_state'
  | 'action_done';

// ============================================================
// PreCond VO（5 类 sealed union 风格 · single struct + 分支字段）
// ============================================================

/**
 * 前置条件 VO。每步可选 0-N 条；按声明顺序短路评估。
 *
 * `block_on_fail=false`（默认）= 不满足时本步标 warn 但仍发命令；
 * `block_on_fail=true` = 不满足时本步**不发命令**、标 fail。
 *
 * 各类目标字段按 type 分支必填一组：
 *   exhibit_app_online → exhibit_id
 *   device_online      → device_id
 *   hall_master_ready  → 无目标字段（按 runbook hall 评估）
 *   scene_state        → scene_id
 *   action_done        → action_step_index（0-based · 不能引用前向）
 */
export interface PreCond {
  type: PreCondType;
  block_on_fail: boolean;
  /** type=exhibit_app_online 时必填 */
  exhibit_id?: number | null;
  /** type=device_online 时必填 */
  device_id?: number | null;
  /** type=scene_state 时必填 */
  scene_id?: number | null;
  /** type=action_done 时必填；0-based；< 当前 step index */
  action_step_index?: number | null;
  /** 评估超时（秒）；空缺省走引擎 default_precond_timeout_seconds */
  timeout_seconds?: number | null;
}

// ============================================================
// ActionStep VO（场景与 device_command 按钮共用 · single struct）
// ============================================================

/**
 * 场景与 device_command 按钮共用的执行步 VO。
 *
 * 同一数组内可混合 device/content 两类、按数组下标顺序串行执行。
 * Step 0 强制 delay=0；后续步 delay 是相对前一步 **StartedAt**（非 CompletedAt）
 * —— 长 ack 不拖累后续。
 *
 * 分支字段必填校验在 application 层（admin 编辑期亦做客户端校验，server 422 复检）：
 *   type=device  → device_id + command 必填；exhibit_id / content_intent / content_params 必空
 *   type=content → exhibit_id + content_intent 必填；device_id / command / params 必空
 */
export interface ActionStep {
  type: ActionStepType;
  /** ≥0；=0 与前一步同时；Step 0 强制 0 */
  delay_seconds_after_prev_start: number;
  preconditions?: PreCond[] | null;
  /** 部署人员填，中控 RunbookDialog 显示；空则 server 按结构 fallback 生成；maxLength 255 */
  friendly_description?: string | null;

  // ---- device 分支 ----
  device_id?: number | null;
  command?: string | null;
  params?: Record<string, unknown> | null;

  // ---- content 分支 ----
  exhibit_id?: number | null;
  content_intent?: ContentIntent | null;
  content_params?: Record<string, unknown> | null;
}

// ============================================================
// 422 detail · admin 编辑期错误高亮
// ============================================================

/**
 * 422 错误体。server 应用层校验失败时返回，admin 用 path 指针定位到具体 step / field。
 *
 * 与 server `application/dto/runbook_validation.go` 输出形态对齐（待 S5-7.5 yaml
 * 把 ApplicationValidationDetail 接入 operations 后改 codegen 类型）。
 */
export interface ActionStepValidationError {
  /** JSON Pointer 风格：/steps/2/device_id · /steps/0/preconditions/1/scene_id */
  path: string;
  /** 错误码（device_required / content_intent_required / branch_field_conflict / precond_forward_ref / ...） */
  code: string;
  /** 给运维看的友好描述 */
  message: string;
}

// ============================================================
// 工厂函数（编辑器创建空步 / 空前置条件用）
// ============================================================

export function emptyDeviceStep(prevStepCount: number): ActionStep {
  return {
    type: 'device',
    delay_seconds_after_prev_start: prevStepCount === 0 ? 0 : 0,
    device_id: null,
    command: null,
    params: null,
    preconditions: null,
    friendly_description: null,
  };
}

export function emptyContentStep(prevStepCount: number): ActionStep {
  return {
    type: 'content',
    delay_seconds_after_prev_start: prevStepCount === 0 ? 0 : 0,
    exhibit_id: null,
    content_intent: null,
    content_params: null,
    preconditions: null,
    friendly_description: null,
  };
}

export function emptyPreCond(): PreCond {
  return {
    type: 'device_online',
    block_on_fail: false,
    device_id: null,
  };
}

// ============================================================
// 8 高频意图元数据（label / icon / params shape 描述 · admin 编辑期用）
// ============================================================

export interface ContentIntentMeta {
  /** ContentIntent enum 值 */
  value: ContentIntent;
  /** 部署人员看到的 label（中文） */
  label: string;
  /** material icon 名 · 与 mockup M1 line 938-976 对齐 */
  icon: string;
  /** 副描述 · 给下拉项 desc 列 */
  desc: string;
  /** 此意图是否需要参数表单（false = 直接保存空 params） */
  hasParams: boolean;
}

export const CONTENT_INTENT_META: ContentIntentMeta[] = [
  {
    value: 'play_video',
    label: '播放视频',
    icon: 'play_arrow',
    desc: '选 1 个视频',
    hasParams: true,
  },
  {
    value: 'slideshow_goto',
    label: '切到图文汇报 第 N 张前景图',
    icon: 'slideshow',
    desc: '选第几张前景图',
    hasParams: true,
  },
  {
    value: 'show_screen_image',
    label: '显示守屏图',
    icon: 'image',
    desc: '选 1 张图',
    hasParams: true,
  },
  {
    value: 'clear_screen_image',
    label: '清除守屏',
    icon: 'cancel',
    desc: '无参数',
    hasParams: false,
  },
  {
    value: 'pause_resume',
    label: '暂停 / 继续',
    icon: 'pause',
    desc: '无参数',
    hasParams: false,
  },
  {
    value: 'stop',
    label: '停止',
    icon: 'stop',
    desc: '无参数',
    hasParams: false,
  },
  {
    value: 'seek',
    label: '跳到指定时间',
    icon: 'fast_forward',
    desc: '输入 mm:ss',
    hasParams: true,
  },
  {
    value: 'set_volume',
    label: '调整音量',
    icon: 'volume_up',
    desc: '滑块 0-100',
    hasParams: true,
  },
];

// ============================================================
// PreCond 5 类元数据
// ============================================================

export interface PreCondTypeMeta {
  value: PreCondType;
  label: string;
  /** 该类需要选择的"目标"字段名（PreCond 上对应的 key）；hall_master_ready 无目标 */
  targetField: 'exhibit_id' | 'device_id' | 'scene_id' | 'action_step_index' | null;
  /** 目标字段的 label */
  targetLabel: string | null;
  /** 该类型对应的"等待"动词描述 */
  waitDesc: string;
}

export const PRECOND_TYPE_META: PreCondTypeMeta[] = [
  {
    value: 'exhibit_app_online',
    label: '展项 App 上线',
    targetField: 'exhibit_id',
    targetLabel: '展项',
    waitDesc: '等展项 App 上线',
  },
  {
    value: 'device_online',
    label: '设备上线',
    targetField: 'device_id',
    targetLabel: '设备',
    waitDesc: '等设备上线',
  },
  {
    value: 'hall_master_ready',
    label: '展厅主控就绪',
    targetField: null,
    targetLabel: null,
    waitDesc: '等展厅主控就绪',
  },
  {
    value: 'scene_state',
    label: '当前场景为',
    targetField: 'scene_id',
    targetLabel: '场景',
    waitDesc: '等当前场景切到',
  },
  {
    value: 'action_done',
    label: '前序步完成',
    targetField: 'action_step_index',
    targetLabel: '步序号',
    waitDesc: '等前序步完成',
  },
];
