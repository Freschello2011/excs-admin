import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { Input, Button, Tooltip } from 'antd';
import { AimOutlined } from '@ant-design/icons';

/**
 * 解析时间码字符串成 ms。支持：
 *   "1:23.500"  → 83500
 *   "01:23"     → 83000
 *   "83500"     → 83500（纯数字按 ms）
 *   "1m23s500"  → 83500
 *   "23s"       → 23000
 * 失败返回 null。
 */
export function parseTimeCode(input: string): number | null {
  const s = input.trim();
  if (!s) return null;

  // 纯数字 → ms
  if (/^\d+$/.test(s)) return parseInt(s, 10);

  // mm:ss(.sss)
  let m = s.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (m) {
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const msStr = m[3] ?? '';
    // 把 .5 当 .500，.50 当 .500
    const ms = msStr ? parseInt(msStr.padEnd(3, '0').slice(0, 3), 10) : 0;
    if (sec >= 60) return null;
    return min * 60000 + sec * 1000 + ms;
  }

  // 1m23s500 / 1m23s500ms / 1m / 23s / 500ms — 末尾 ms 后缀可选
  m = s.match(/^(?:(\d+)m)?(?:(\d+)s)?(?:(\d+)(?:ms)?)?$/i);
  if (m && (m[1] || m[2] || m[3])) {
    const min = m[1] ? parseInt(m[1], 10) : 0;
    const sec = m[2] ? parseInt(m[2], 10) : 0;
    const ms = m[3] ? parseInt(m[3], 10) : 0;
    return min * 60000 + sec * 1000 + ms;
  }

  return null;
}

/**
 * 格式化 ms 成 mm:ss.sss。
 */
export function formatTimeCode(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const min = Math.floor(total / 60000);
  const sec = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/* ==================== Component ==================== */

interface Props {
  /** 当前 ms 值 */
  value: number;
  onChange: (ms: number) => void;
  /** 最小值（ms），默认 0 */
  min?: number;
  /** 显示"⌖ 贴到游标"按钮 → 调 onPasteCursor */
  showPasteCursor?: boolean;
  onPasteCursor?: () => void;
  /** 占位 */
  placeholder?: string;
  style?: CSSProperties;
  size?: 'small' | 'middle' | 'large';
  /** 失焦/Enter 时的额外回调（例如 form valuesChange 等场景） */
  onCommit?: (ms: number) => void;
}

export default function TimeCodeInput({
  value,
  onChange,
  min = 0,
  showPasteCursor = false,
  onPasteCursor,
  placeholder = 'mm:ss.sss',
  style,
  size = 'small',
  onCommit,
}: Props) {
  const [text, setText] = useState<string>(() => formatTimeCode(value));
  const [error, setError] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);

  // 外部 value 变化 → 同步显示（仅在非编辑状态，避免覆盖用户输入）
  useEffect(() => {
    if (!editing) setText(formatTimeCode(value));
  }, [value, editing]);

  const commit = useCallback(() => {
    const parsed = parseTimeCode(text);
    if (parsed == null) {
      setError(true);
      return;
    }
    const clamped = Math.max(min, parsed);
    setError(false);
    setText(formatTimeCode(clamped));
    if (clamped !== value) onChange(clamped);
    onCommit?.(clamped);
  }, [text, min, value, onChange, onCommit]);

  return (
    <Input
      size={size}
      value={text}
      placeholder={placeholder}
      style={{ ...(error ? { borderColor: '#ff4d4f' } : {}), ...style }}
      onFocus={() => setEditing(true)}
      onChange={(e) => { setText(e.target.value); setError(false); }}
      onPressEnter={() => { commit(); }}
      onBlur={() => { commit(); setEditing(false); }}
      addonAfter={showPasteCursor && onPasteCursor ? (
        <Tooltip title="贴到游标">
          <Button
            type="text"
            size="small"
            icon={<AimOutlined />}
            onClick={onPasteCursor}
            style={{ padding: '0 4px', height: 22 }}
          />
        </Tooltip>
      ) : undefined}
    />
  );
}
