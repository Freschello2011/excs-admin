import { Slider, InputNumber, Space } from 'antd';
import type { LayoutConfig, WhiteboardRect } from '@/api/gen/client';

interface Props {
  value: LayoutConfig;
  onChange: (next: LayoutConfig) => void;
  /** Hide percent sliders (e.g. when whiteboard_padding is the only meaningful config) */
  compact?: boolean;
}

export const DEFAULT_WHITEBOARD_RECT: WhiteboardRect = {
  x_percent: 50,
  y_percent: 15,
  width_percent: 48,
  height_percent: 70,
};

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  whiteboard_rect: DEFAULT_WHITEBOARD_RECT,
  whiteboard_padding: 40,
};

function clampRect(rect: WhiteboardRect): WhiteboardRect {
  const x = Math.max(0, Math.min(100, rect.x_percent));
  const y = Math.max(0, Math.min(100, rect.y_percent));
  const w = Math.max(1, Math.min(100 - x, rect.width_percent));
  const h = Math.max(1, Math.min(100 - y, rect.height_percent));
  return { x_percent: x, y_percent: y, width_percent: w, height_percent: h };
}

export default function WhiteboardLayoutEditor({ value, onChange, compact = false }: Props) {
  const rect = value.whiteboard_rect ?? DEFAULT_WHITEBOARD_RECT;
  const padding = value.whiteboard_padding ?? 40;

  const updateRect = (patch: Partial<WhiteboardRect>) => {
    const next = clampRect({ ...rect, ...patch });
    onChange({ ...value, whiteboard_rect: next });
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>白板 X 起点 · {rect.x_percent.toFixed(0)}%</div>
          <Slider
            min={0}
            max={90}
            value={rect.x_percent}
            onChange={(v) => updateRect({ x_percent: v })}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>白板 Y 起点 · {rect.y_percent.toFixed(0)}%</div>
          <Slider
            min={0}
            max={90}
            value={rect.y_percent}
            onChange={(v) => updateRect({ y_percent: v })}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>白板宽度 · {rect.width_percent.toFixed(0)}%</div>
          <Slider
            min={10}
            max={100 - rect.x_percent}
            value={rect.width_percent}
            onChange={(v) => updateRect({ width_percent: v })}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>白板高度 · {rect.height_percent.toFixed(0)}%</div>
          <Slider
            min={10}
            max={100 - rect.y_percent}
            value={rect.height_percent}
            onChange={(v) => updateRect({ height_percent: v })}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>白板内边距 (px)</div>
          <Space>
            <InputNumber
              min={0}
              max={200}
              step={4}
              value={padding}
              onChange={(v) => onChange({ ...value, whiteboard_padding: v ?? 40 })}
              style={{ width: 120 }}
            />
          </Space>
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--ant-color-text-quaternary)',
          lineHeight: 1.6,
          background: 'var(--ant-color-bg-layout)',
          padding: '8px 10px',
          borderRadius: 6,
        }}>
          💡 数字人视频自带背景 + 人物 + 白板边框；这里配置的是白板内容（对话 / 媒体）矩形在视频里的叠加位置。
        </div>
      </div>

      {!compact && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 13, marginBottom: 6, color: 'var(--ant-color-text-secondary)' }}>布局预览</div>
          <LayoutPreview rect={rect} />
        </div>
      )}
    </div>
  );
}

export function LayoutPreview({ rect, width = 220, height = 124 }: { rect: WhiteboardRect | null | undefined; width?: number; height?: number }) {
  const r = rect ?? DEFAULT_WHITEBOARD_RECT;
  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        borderRadius: 6,
        background: 'linear-gradient(135deg, #1a1a3e, #2d2d6e)',
        overflow: 'hidden',
        border: '1px solid var(--ant-color-border)',
      }}
    >
      {/* Simulated avatar silhouette (decoration only) */}
      <div style={{
        position: 'absolute',
        left: '6%', top: '20%', width: '34%', height: '70%',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.5)', fontSize: 11,
      }}>
        数字人
      </div>
      {/* Whiteboard rect overlay */}
      <div
        style={{
          position: 'absolute',
          left: `${r.x_percent}%`,
          top: `${r.y_percent}%`,
          width: `${r.width_percent}%`,
          height: `${r.height_percent}%`,
          border: '2px dashed rgba(117, 221, 255, 0.9)',
          borderRadius: 6,
          background: 'rgba(117, 221, 255, 0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 500,
        }}
      >
        白板内容区
      </div>
    </div>
  );
}
