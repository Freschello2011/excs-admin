import { Form, Input, InputNumber, Switch, Tooltip, Typography } from 'antd';
import { EyeInvisibleOutlined, EyeTwoTone, InfoCircleOutlined } from '@ant-design/icons';
import type { ConfigItem } from '@/api/gen/client';
import type { FieldRef } from './ia';

const { Text } = Typography;

interface FieldRowProps {
  /** 该字段的虚拟分组元信息（短标题 + 单位） */
  ref: FieldRef;
  /** 后端返回的字段 metadata（含 description / value_type / is_sensitive / value） */
  item: ConfigItem;
  /** Form.Item 的 name；用 `${group}__${key}` 隔离不同 group 的同名字段 */
  fieldName: string;
}

/** 数字字段固定控件宽度（紧凑显示数字 + 单位文本） */
const NUMBER_INPUT_WIDTH = 200;

/**
 * 双行 label + 类型驱动控件 — v2
 *
 * - Label：单行短标题 + 旁边 ⓘ Tooltip（hover 看后端 description + key）
 * - 数字字段：固定宽度 InputNumber + 单位文本（不再用 addonAfter，杜绝 2-char 单位换行）
 * - 字符串字段：拉满宽度 Input
 * - bool / sensitive 控件保持
 * - 副说明只在「真的补充信息」时显示，避免重复
 */
export default function FieldRow({ ref, item, fieldName }: FieldRowProps) {
  const shortLabel = ref.label || item.description || item.key;
  const tooltipDesc = ref.label && item.description !== ref.label ? item.description : '';
  const showHelp =
    !!item.description &&
    !ref.label &&
    item.description !== item.key;

  const finalHelp = showHelp ? (
    <span style={{ color: '#888', fontSize: 12 }}>{item.description}</span>
  ) : null;

  // === 标题节点：短标题 + 灰字 key + ⓘ Tooltip（含后端 description） ===
  const tooltipContent = tooltipDesc || `key: ${item.key}`;
  const labelNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, lineHeight: 1.4 }}>
      <span style={{ fontWeight: 500 }}>{shortLabel}</span>
      <Tooltip title={tooltipContent} placement="top">
        <InfoCircleOutlined style={{ color: '#999', fontSize: 12, cursor: 'help' }} />
      </Tooltip>
    </span>
  );

  // === Switch（bool） ===
  if (item.value_type === 'bool') {
    return (
      <Form.Item
        name={fieldName}
        label={labelNode}
        valuePropName="checked"
        getValueFromEvent={(v) => (v ? 'true' : 'false')}
        getValueProps={(v) => ({ checked: v === 'true' || v === true })}
        help={finalHelp}
        colon={false}
      >
        <Switch />
      </Form.Item>
    );
  }

  // === InputNumber（int） — 固定宽度 + 单位文本（不用 addonAfter） ===
  if (item.value_type === 'int') {
    // 数字字段：有 label + 单位时副说明全部交给 ⓘ Tooltip，避免行下灰字冗余
    const inlineHelp = ref.label
      ? null
      : item.description && item.description !== item.key
        ? <span style={{ color: '#888', fontSize: 12 }}>{item.description}</span>
        : null;

    return (
      <Form.Item label={labelNode} help={inlineHelp} colon={false} style={{ marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Form.Item name={fieldName} noStyle>
            <InputNumber
              style={{ width: NUMBER_INPUT_WIDTH }}
              min={ref.min}
              max={ref.max}
              controls
            />
          </Form.Item>
          {ref.suffix && (
            <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{ref.suffix}</Text>
          )}
        </span>
      </Form.Item>
    );
  }

  // === Input.Password（sensitive） ===
  if (item.is_sensitive) {
    const maskedHint = item.value && item.value !== ''
      ? `当前：${item.value}（留空保持不变）`
      : '留空保持不变';
    return (
      <Form.Item name={fieldName} label={labelNode} help={finalHelp} colon={false}>
        <Input.Password
          placeholder={maskedHint}
          iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
          autoComplete="new-password"
        />
      </Form.Item>
    );
  }

  // === 普通 Input（string / json） ===
  // 字符串字段如果有 suffix（罕见，例如 region "cn-hangzhou" 没单位），不上 suffix；只画输入框
  return (
    <Form.Item name={fieldName} label={labelNode} help={finalHelp} colon={false}>
      <Input
        placeholder={item.value || '请输入值'}
        style={item.value_type === 'json' ? { fontFamily: 'monospace' } : undefined}
      />
    </Form.Item>
  );
}

/** 把后端字符串值 + value_type 转为 Form 初始值 */
export function toFormInitialValue(item: ConfigItem): unknown {
  if (item.is_sensitive) return ''; // 敏感字段始终初始为空
  switch (item.value_type) {
    case 'bool': return item.value === 'true';
    case 'int': return Number(item.value || 0);
    default: return item.value ?? '';
  }
}

/** 把 Form 提交值转回后端 string 格式 */
export function fromFormValue(value: unknown, item: ConfigItem): string {
  if (value === undefined || value === null) return '';
  if (item.value_type === 'bool') return value ? 'true' : 'false';
  return String(value);
}
