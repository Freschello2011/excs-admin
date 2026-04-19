import { ColorPicker, Input, InputNumber, Radio, Select, Slider, Switch, TimePicker } from 'antd';
import type { ParamsSchemaProperty } from '@/types/deviceCatalog';
import dayjs from 'dayjs';

interface WidgetRendererProps {
  /** 单个参数的 schema */
  schema: ParamsSchemaProperty;
  value: unknown;
  onChange: (v: unknown) => void;
  size?: 'small' | 'middle' | 'large';
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** 单条 params_schema 参数 → UI 控件。用于型号/设备/场景的命令参数输入 */
export default function WidgetRenderer({ schema, value, onChange, size = 'middle', disabled, style }: WidgetRendererProps) {
  const widget = schema.widget ?? guessWidget(schema);
  const common = { size, disabled, style } as const;

  switch (widget) {
    case 'textarea':
      return (
        <Input.TextArea
          {...common}
          rows={3}
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={schema.description}
        />
      );

    case 'number':
      return (
        <InputNumber
          {...common}
          style={{ width: '100%', ...style }}
          value={value as number | undefined}
          onChange={(v) => onChange(v)}
          min={schema.minimum}
          max={schema.maximum}
        />
      );

    case 'slider': {
      const min = schema.minimum ?? 0;
      const max = schema.maximum ?? 100;
      return (
        <Slider
          disabled={disabled}
          style={style}
          min={min}
          max={max}
          value={(value as number | undefined) ?? min}
          onChange={(v) => onChange(v)}
        />
      );
    }

    case 'range': {
      const min = schema.minimum ?? 0;
      const max = schema.maximum ?? 100;
      const v = Array.isArray(value) && value.length === 2 ? (value as [number, number]) : [min, max] as [number, number];
      return (
        <Slider
          range
          disabled={disabled}
          style={style}
          min={min}
          max={max}
          value={v}
          onChange={(next) => onChange(next)}
        />
      );
    }

    case 'select':
      return (
        <Select
          {...common}
          style={{ width: '100%', ...style }}
          value={value as string | number | undefined}
          onChange={(v) => onChange(v)}
          options={(schema.enum ?? []).map((e) => ({ value: e, label: String(e) }))}
          allowClear
        />
      );

    case 'radio':
      return (
        <Radio.Group
          size={size}
          disabled={disabled}
          value={value as string | number | undefined}
          onChange={(e) => onChange(e.target.value)}
        >
          {(schema.enum ?? []).map((e) => (
            <Radio key={String(e)} value={e}>
              {String(e)}
            </Radio>
          ))}
        </Radio.Group>
      );

    case 'switch':
      return (
        <Switch
          size={size === 'middle' ? 'default' : 'small'}
          disabled={disabled}
          checked={Boolean(value)}
          onChange={(v) => onChange(v)}
        />
      );

    case 'color':
      return (
        <ColorPicker
          size={size}
          disabled={disabled}
          value={(value as string | undefined) ?? '#1677ff'}
          format="hex"
          onChange={(c) => onChange(c.toHexString())}
        />
      );

    case 'time':
      return (
        <TimePicker
          {...common}
          style={{ width: '100%', ...style }}
          value={value ? dayjs(value as string, 'HH:mm:ss') : null}
          onChange={(d) => onChange(d ? d.format('HH:mm:ss') : undefined)}
        />
      );

    case 'json':
      return (
        <Input.TextArea
          {...common}
          rows={3}
          style={{ fontFamily: 'monospace', fontSize: 12, ...style }}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              onChange(e.target.value);
            }
          }}
        />
      );

    case 'text':
    default:
      return (
        <Input
          {...common}
          style={{ width: '100%', ...style }}
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={schema.description}
        />
      );
  }
}

function guessWidget(schema: ParamsSchemaProperty): NonNullable<ParamsSchemaProperty['widget']> {
  if (schema.enum && schema.enum.length > 0) return 'select';
  if (schema.type === 'boolean') return 'switch';
  if (schema.type === 'integer' || schema.type === 'number') {
    return schema.minimum !== undefined && schema.maximum !== undefined ? 'slider' : 'number';
  }
  if (schema.format === 'color') return 'color';
  if (schema.format === 'time') return 'time';
  return 'text';
}
