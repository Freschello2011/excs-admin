import { PT } from '../previewTokens';

/**
 * v2.0 讲解词卡：玻璃外壳 + 内陷富文本区。
 */
export default function ScriptCard() {
  return (
    <div
      style={{
        padding: PT.cardPadding,
        background: PT.glassFill,
        border: `1px solid ${PT.glassStroke}`,
        borderRadius: PT.radiusCard,
        backdropFilter: PT.blur,
        WebkitBackdropFilter: PT.blur,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: PT.textPrimary }}>讲解词</span>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: PT.radiusLabel,
            background: 'rgba(38,191,247,0.08)',
            border: '1px solid rgba(38,191,247,0.35)',
            fontSize: 11,
            color: PT.neonCyan,
          }}
        >
          云端同步
        </span>
      </div>
      <div
        style={{
          flex: 1,
          background: PT.glassInset,
          border: `1px solid ${PT.glassStrokeWeak}`,
          borderRadius: 12,
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 13, color: PT.textDisabled }}>暂无讲解词</span>
      </div>
    </div>
  );
}
