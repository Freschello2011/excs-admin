import { useMemo } from 'react';
import { Button, Input, InputNumber, Select, Space, Switch, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import WidgetTypeSelect from './WidgetTypeSelect';
import type {
  JsonType,
  ParamsSchemaObject,
  ParamsSchemaProperty,
  ParamsSchemaRow,
  ParamsSchemaWidget,
} from '@/types/deviceCatalog';

const TYPE_OPTIONS: { value: JsonType; label: string }[] = [
  { value: 'string', label: 'string' },
  { value: 'integer', label: 'integer' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'array', label: 'array' },
  { value: 'object', label: 'object' },
];

const WIDGETS_REQUIRING_MIN_MAX: ParamsSchemaWidget[] = ['slider', 'range'];
const WIDGETS_OPTIONAL_MIN_MAX: ParamsSchemaWidget[] = ['number'];
const WIDGETS_REQUIRING_ENUM: ParamsSchemaWidget[] = ['select', 'radio'];

/** 序列化：PRD §4.1 JSON Schema 子集 */
export function rowsToSchema(rows: ParamsSchemaRow[]): ParamsSchemaObject | null {
  const validRows = rows.filter((r) => r.name.trim());
  if (validRows.length === 0) return null;
  const properties: Record<string, ParamsSchemaProperty> = {};
  const required: string[] = [];
  for (const r of validRows) {
    const prop: ParamsSchemaProperty = { type: r.type };
    if (r.widget) prop.widget = r.widget;
    if (r.title) prop.title = r.title;
    if (r.description) prop.description = r.description;
    if (r.default !== undefined && r.default !== '') prop.default = r.default;
    if (r.minimum !== undefined && r.minimum !== null) prop.minimum = r.minimum;
    if (r.maximum !== undefined && r.maximum !== null) prop.maximum = r.maximum;
    if (r.enum && r.enum.length > 0) prop.enum = r.enum;
    if (r.format) prop.format = r.format;
    properties[r.name.trim()] = prop;
    if (r.required) required.push(r.name.trim());
  }
  const schema: ParamsSchemaObject = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

/** 反序列化 schema 对象 → 编辑器行 */
export function schemaToRows(schema: ParamsSchemaObject | null | undefined): ParamsSchemaRow[] {
  if (!schema || typeof schema !== 'object' || !schema.properties) return [];
  const requiredSet = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    required: requiredSet.has(name),
    type: prop.type,
    widget: prop.widget,
    title: prop.title,
    description: prop.description,
    default: prop.default,
    minimum: prop.minimum,
    maximum: prop.maximum,
    enum: prop.enum,
    format: prop.format,
  }));
}

interface ParamsSchemaEditorProps {
  value: ParamsSchemaRow[];
  onChange: (rows: ParamsSchemaRow[]) => void;
  /** null = 不支持参数的命令（例如纯开关命令） */
  disabled?: boolean;
}

export default function ParamsSchemaEditor({ value, onChange, disabled }: ParamsSchemaEditorProps) {
  const rows = value;

  const addRow = () =>
    onChange([
      ...rows,
      { name: '', type: 'string', widget: 'text', required: false },
    ]);

  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  const moveRow = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const updateRow = (idx: number, patch: Partial<ParamsSchemaRow>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div style={{ border: '1px dashed var(--ant-color-border)', borderRadius: 6, padding: 8 }}>
      {rows.length === 0 && (
        <div style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12, padding: '4px 0 8px' }}>
          无参数。点击「+ 添加参数」新增。
        </div>
      )}

      {rows.map((row, idx) => {
        const widget = row.widget;
        const needMinMax = widget && WIDGETS_REQUIRING_MIN_MAX.includes(widget);
        const optionalMinMax = widget && WIDGETS_OPTIONAL_MIN_MAX.includes(widget);
        const needEnum = widget && WIDGETS_REQUIRING_ENUM.includes(widget);
        return (
          <div
            key={idx}
            style={{
              border: '1px solid var(--ant-color-border-secondary)',
              borderRadius: 4,
              padding: 8,
              marginBottom: 6,
              background: 'var(--ant-color-fill-tertiary)',
            }}
          >
            <Space wrap size={[6, 6]} style={{ width: '100%' }}>
              <Input
                size="small"
                style={{ width: 120 }}
                placeholder="参数 name"
                value={row.name}
                onChange={(e) => updateRow(idx, { name: e.target.value })}
                disabled={disabled}
              />
              <Select<JsonType>
                size="small"
                style={{ width: 95 }}
                options={TYPE_OPTIONS}
                value={row.type}
                onChange={(v) => updateRow(idx, { type: v })}
                disabled={disabled}
              />
              <WidgetTypeSelect
                value={row.widget}
                onChange={(v) => updateRow(idx, { widget: v })}
              />
              <Input
                size="small"
                style={{ width: 110 }}
                placeholder="title（显示名）"
                value={row.title ?? ''}
                onChange={(e) => updateRow(idx, { title: e.target.value })}
                disabled={disabled}
              />
              <Tooltip title="必填">
                <Switch
                  size="small"
                  checked={row.required}
                  onChange={(v) => updateRow(idx, { required: v })}
                  disabled={disabled}
                />
              </Tooltip>
              {(needMinMax || optionalMinMax) && (
                <>
                  <InputNumber
                    size="small"
                    style={{ width: 72 }}
                    placeholder={needMinMax ? 'min*' : 'min'}
                    value={row.minimum ?? null}
                    onChange={(v) => updateRow(idx, { minimum: v ?? undefined })}
                    disabled={disabled}
                  />
                  <InputNumber
                    size="small"
                    style={{ width: 72 }}
                    placeholder={needMinMax ? 'max*' : 'max'}
                    value={row.maximum ?? null}
                    onChange={(v) => updateRow(idx, { maximum: v ?? undefined })}
                    disabled={disabled}
                  />
                </>
              )}
              <Input
                size="small"
                style={{ width: 90 }}
                placeholder="default"
                value={row.default === undefined ? '' : String(row.default)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') return updateRow(idx, { default: undefined });
                  if (row.type === 'integer' || row.type === 'number') {
                    const n = Number(raw);
                    updateRow(idx, { default: Number.isNaN(n) ? raw : n });
                  } else if (row.type === 'boolean') {
                    updateRow(idx, { default: raw === 'true' });
                  } else {
                    updateRow(idx, { default: raw });
                  }
                }}
                disabled={disabled}
              />
              {needEnum && (
                <Input
                  size="small"
                  style={{ width: 160 }}
                  placeholder="enum (逗号分隔)"
                  value={(row.enum ?? []).join(',')}
                  onChange={(e) => {
                    const parts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                    updateRow(idx, {
                      enum: parts.length
                        ? parts.map((p) =>
                            row.type === 'integer' || row.type === 'number'
                              ? Number(p) || p
                              : p,
                          ) as (string | number)[]
                        : undefined,
                    });
                  }}
                  disabled={disabled}
                />
              )}
              <Space.Compact size="small">
                <Button
                  size="small"
                  icon={<ArrowUpOutlined />}
                  onClick={() => moveRow(idx, -1)}
                  disabled={disabled || idx === 0}
                />
                <Button
                  size="small"
                  icon={<ArrowDownOutlined />}
                  onClick={() => moveRow(idx, 1)}
                  disabled={disabled || idx === rows.length - 1}
                />
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeRow(idx)}
                  disabled={disabled}
                />
              </Space.Compact>
            </Space>
          </div>
        );
      })}

      <Button
        size="small"
        type="dashed"
        icon={<PlusOutlined />}
        onClick={addRow}
        disabled={disabled}
        block
      >
        添加参数
      </Button>
    </div>
  );
}

/** Hook：把编辑器 rows 的 useMemo serializer 暴露给外层表单 */
export function useRowsSchema(rows: ParamsSchemaRow[]): ParamsSchemaObject | null {
  return useMemo(() => rowsToSchema(rows), [rows]);
}
