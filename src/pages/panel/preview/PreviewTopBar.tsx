import { PT } from './previewTokens';

interface PreviewTopBarProps {
  hallName: string;
}

/**
 * v2.0 顶栏：玻璃外框 + EXCS logo（青霓虹描边） + 展厅名 / 副标题 + 网络稳定 pill + 设置 pill
 * 对齐 mockup `.topbar.glass` / `.logo` / `.pill`。
 */
export default function PreviewTopBar({ hallName }: PreviewTopBarProps) {
  return (
    <div
      style={{
        margin: `12px ${PT.pagePadding}px 8px`,
        padding: '14px 18px',
        height: PT.topBarHeight,
        background: PT.glassFill,
        border: `1px solid ${PT.glassStroke}`,
        borderRadius: PT.radiusCard,
        backdropFilter: PT.blur,
        WebkitBackdropFilter: PT.blur,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxSizing: 'border-box',
      }}
    >
      {/* Logo（青霓虹描边） */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          flexShrink: 0,
          background: 'linear-gradient(135deg, #1e2b4a, #0b1426)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid rgba(38, 191, 247, 0.45)`,
          boxShadow:
            '0 0 14px rgba(38, 191, 247, 0.35) inset, 0 0 10px rgba(38, 191, 247, 0.25)',
          fontFamily: 'SF Mono, Menlo, monospace',
          fontSize: 10,
          fontWeight: 700,
          color: '#cfefff',
          letterSpacing: 1,
        }}
      >
        EXCS
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: PT.textPrimary,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {hallName || '—'}
        </div>
        <div style={{ fontSize: 12, color: PT.textTertiary, marginTop: 2 }}>
          ExCS 中控 App
        </div>
      </div>

      {/* 网络延迟胶囊 */}
      <Pill>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: PT.neonMint,
            boxShadow: `0 0 8px ${PT.neonMint}`,
          }}
        />
        <span style={{ color: PT.textPrimary, fontWeight: 500 }}>网络稳定</span>
        <span style={{ color: PT.textSecondary }}>147ms</span>
      </Pill>

      {/* 设置胶囊 */}
      <Pill>
        <span style={{ color: PT.textSecondary, fontSize: 14 }}>⚙</span>
        <span style={{ color: PT.textPrimary }}>设置</span>
      </Pill>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 38,
        padding: '0 14px',
        borderRadius: PT.radiusPill,
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${PT.glassStroke}`,
        backdropFilter: 'blur(10px)',
        fontSize: 13,
        color: PT.textSecondary,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}
