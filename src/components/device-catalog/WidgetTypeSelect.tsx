import { Select } from 'antd';
import { WIDGET_OPTIONS, type ParamsSchemaWidget } from '@/types/deviceCatalog';

interface WidgetTypeSelectProps {
  value?: ParamsSchemaWidget;
  onChange?: (v: ParamsSchemaWidget) => void;
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
  placeholder?: string;
}

export default function WidgetTypeSelect({ value, onChange, size = 'small', style, placeholder = 'widget' }: WidgetTypeSelectProps) {
  return (
    <Select<ParamsSchemaWidget>
      size={size}
      placeholder={placeholder}
      style={{ minWidth: 110, ...style }}
      value={value}
      onChange={onChange}
      options={WIDGET_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        title: o.desc,
      }))}
    />
  );
}
