import { useState } from 'react';
import { Input, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { HotwordExtensions } from '@/api/gen/client';

interface Props {
  value: HotwordExtensions;
  onChange: (next: HotwordExtensions) => void;
  disabled?: boolean;
}

/** Hard-coded action groups — matches exhibit-app local hotword interceptor.
 * Labels/defaults reference PRD 7.2 本地热词拦截. */
const ACTIONS: Array<{ key: string; label: string; examples: string[] }> = [
  { key: 'pause', label: '暂停', examples: ['暂停', '停一下'] },
  { key: 'resume', label: '继续', examples: ['继续', '接着放'] },
  { key: 'fullscreen', label: '全屏', examples: ['全屏', '放大'] },
  { key: 'exit_fullscreen', label: '退出全屏', examples: ['退出全屏', '缩回来'] },
  { key: 'close', label: '关闭', examples: ['关掉', '别看了'] },
];

export default function HotwordExtensionsEditor({ value, onChange, disabled }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ACTIONS.map((action) => (
        <ActionRow
          key={action.key}
          actionKey={action.key}
          label={action.label}
          placeholder={`示例：${action.examples.join(' / ')}`}
          items={value?.[action.key] ?? []}
          disabled={disabled}
          onChange={(next) => {
            const copy: HotwordExtensions = { ...(value ?? {}) };
            if (next.length === 0) {
              delete copy[action.key];
            } else {
              copy[action.key] = next;
            }
            onChange(copy);
          }}
        />
      ))}
    </div>
  );
}

function ActionRow({
  actionKey, label, placeholder, items, disabled, onChange,
}: {
  actionKey: string;
  label: string;
  placeholder: string;
  items: string[];
  disabled?: boolean;
  onChange: (items: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const addTag = () => {
    const trimmed = draft.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
    }
    setDraft('');
    setEditing(false);
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ width: 80, paddingTop: 2, fontSize: 13, color: 'var(--ant-color-text-secondary)' }}>
        {label}
        <span style={{ marginLeft: 4, color: 'var(--ant-color-text-quaternary)', fontSize: 11 }}>
          {actionKey}
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((tag) => (
          <Tag
            key={tag}
            closable={!disabled}
            onClose={() => onChange(items.filter((t) => t !== tag))}
          >
            {tag}
          </Tag>
        ))}
        {editing ? (
          <Input
            autoFocus
            size="small"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={addTag}
            onPressEnter={addTag}
            style={{ width: 140 }}
          />
        ) : (
          <Tag
            onClick={() => !disabled && setEditing(true)}
            style={{
              background: 'var(--ant-color-fill-tertiary)',
              borderStyle: 'dashed',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.4 : 1,
            }}
          >
            <PlusOutlined /> 新增
          </Tag>
        )}
      </div>
    </div>
  );
}
