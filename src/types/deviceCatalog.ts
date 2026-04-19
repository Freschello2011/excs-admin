/* ==================== Device Catalog — params_schema 编辑器类型 ==================== */

/** widget 类型枚举（JSON Schema 子集 + ExCS widget 扩展） */
export type ParamsSchemaWidget =
  | 'text'
  | 'textarea'
  | 'number'
  | 'slider'
  | 'range'
  | 'select'
  | 'radio'
  | 'switch'
  | 'color'
  | 'time'
  | 'json';

export const WIDGET_OPTIONS: Array<{ value: ParamsSchemaWidget; label: string; desc: string }> = [
  { value: 'text', label: '单行文本', desc: 'string' },
  { value: 'textarea', label: '多行文本', desc: 'string' },
  { value: 'number', label: '数字输入', desc: 'integer / number' },
  { value: 'slider', label: '滑块', desc: 'integer / number（需 min/max）' },
  { value: 'range', label: '双滑块', desc: 'array(2)（需 min/max）' },
  { value: 'select', label: '下拉', desc: 'string / integer（需 enum）' },
  { value: 'radio', label: '单选', desc: 'string / integer（需 enum）' },
  { value: 'switch', label: '开关', desc: 'boolean' },
  { value: 'color', label: '取色器', desc: 'string (HEX)' },
  { value: 'time', label: '时间选择', desc: 'string' },
  { value: 'json', label: 'JSON 编辑器', desc: 'object 兜底' },
];

export type JsonType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';

/** 单个参数属性（平铺结构，V1 不支持嵌套） */
export interface ParamsSchemaProperty {
  type: JsonType;
  widget?: ParamsSchemaWidget;
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: Array<string | number>;
  format?: string;
}

/** params_schema 根节点 */
export interface ParamsSchemaObject {
  type: 'object';
  required?: string[];
  properties: Record<string, ParamsSchemaProperty>;
}

/** 编辑器内部行模型：name 单独拆出，便于增删和顺序调整 */
export interface ParamsSchemaRow extends ParamsSchemaProperty {
  name: string;
  required: boolean;
}
