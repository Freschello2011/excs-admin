/**
 * <DeviceCommandButtonPreview> — 中控 App 上"实际呈现"预览块
 *
 * S5-9（ADR-0020-v2 Stage 5 admin Phase C · admin-UI §4.20.5 + mockup M2 line 550-565）。
 *
 * 玻璃风按钮单元 110×110；与中控 App PanelButtonCell 92dp 渲染近似。
 * 短按 / 长按 / 颜色 三种交互说明文本（panel-UI §16.12-§16.13 的 4 时刻 toast 提示）。
 *
 * 视觉：mockup 用 oklch() 渐变 + linear-gradient(#1E1F30→#2D2F47) 深色卡。
 * admin 实施只在本组件内部用渐变（不污染全局 surface 体系；admin-UI §4.20.3 末行「禁用项」）。
 */
import { Tag } from 'antd';
import type { ButtonViewModel } from './buttonV2Types';

interface Props {
  button: ButtonViewModel | null;
}

export default function DeviceCommandButtonPreview({ button }: Props) {
  const label = button?.label?.trim() || '未命名按钮';
  const icon = button?.icon || 'smart_button';

  return (
    <div
      data-testid="device-command-button-preview"
      style={{
        background: 'linear-gradient(135deg, #1E1F30, #2D2F47)',
        borderRadius: 14,
        padding: '20px 24px',
        marginBottom: 16,
        color: '#FFF',
        boxShadow:
          '0 1px 2px rgba(24,28,60,0.04), 0 4px 10px rgba(24,28,60,0.05), 0 10px 24px -8px rgba(80,60,170,0.10)',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
      }}
    >
      <div
        style={{
          width: 110,
          height: 110,
          flexShrink: 0,
          borderRadius: 16,
          background:
            'linear-gradient(180deg, var(--ant-color-primary), var(--ant-color-primary-active))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFF',
          gap: 6,
          boxShadow: '0 8px 24px rgba(106, 78, 232, 0.4)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 38 }}
          aria-hidden
        >
          {icon}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.55)',
            marginBottom: 4,
          }}
        >
          中控 App 上的实际呈现
        </div>
        <h4
          style={{
            margin: '0 0 8px 0',
            fontSize: 15,
            fontWeight: 600,
            color: '#FFF',
          }}
        >
          {label}
        </h4>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'rgba(255,255,255,0.7)',
            lineHeight: 1.7,
          }}
        >
          <Tag style={tagStyle}>短按</Tag>
          触发本按钮的 {button?.actions.length ?? 0} 个动作（runbook 异步执行）
          <br />
          <Tag style={tagStyle}>长按 ~600ms</Tag>
          弹「执行进度」窗口（panel-UI §16.13）
          <br />
          <Tag style={tagStyle}>按钮颜色</Tag>
          反映最近一次执行的聚合状态（绿 / 黄 / 红）
        </p>
      </div>
    </div>
  );
}

const tagStyle = {
  background: 'rgba(255,255,255,0.12)',
  border: 'none',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 11,
  marginRight: 6,
};
