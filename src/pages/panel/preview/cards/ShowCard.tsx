import type { PanelCard } from '@/api/gen/client';
import { cardBinding } from '@/api/gen/client';
import type { NameMaps } from '../PreviewPanel';
import { PT } from '../previewTokens';

interface Props {
  card: PanelCard;
  nameMaps: NameMaps;
}

/**
 * v2.0 演出控制卡：玻璃外壳 + 16:9 占位 + 青霓虹圆形开始按钮 + 设备网格 (n×2)
 * 对齐 mockup `.player-row .card`（演出版本省略胶片纹）。
 */
export default function ShowCard({ card, nameMaps: _nameMaps }: Props) {
  const showId = cardBinding(card)?.id;
  const showName = showId ? `演出 #${showId}` : '—';

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
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: PT.textPrimary, marginBottom: 4 }}>
        演出：{showName}
      </div>
      <div style={{ fontSize: 12, color: PT.textTertiary, marginBottom: 12 }}>
        尚未发布演出
      </div>

      {/* 16:9 占位 */}
      <div
        style={{
          aspectRatio: '16 / 9',
          width: '100%',
          borderRadius: 12,
          background: 'linear-gradient(180deg, #0b1220, #050811)',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
          color: PT.textDisabled,
          fontSize: 32,
        }}
      >
        🎭
      </div>

      {/* 进度 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.1)',
          }}
        />
        <span style={{ fontSize: 12, color: PT.textTertiary, fontVariantNumeric: 'tabular-nums' }}>
          00:00 / 00:00
        </span>
      </div>

      {/* 三按钮：开始(青霓虹)、暂停、取消 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <ShowBtn primary label="▶ 开始" />
        <ShowBtn label="❚❚ 暂停" />
        <ShowBtn danger label="■ 取消" />
      </div>
    </div>
  );
}

function ShowBtn({ label, primary, danger }: { label: string; primary?: boolean; danger?: boolean }) {
  if (primary) {
    return (
      <div
        style={{
          flex: 1,
          padding: '8px 14px',
          borderRadius: 12,
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 600,
          background: 'linear-gradient(135deg, #6ad2ff, #26BFF7)',
          color: '#06131e',
          boxShadow: '0 0 14px rgba(38,191,247,0.5), 0 0 28px rgba(38,191,247,0.2)',
        }}
      >
        {label}
      </div>
    );
  }
  return (
    <div
      style={{
        flex: 1,
        padding: '8px 14px',
        borderRadius: 12,
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 500,
        background: danger ? 'rgba(255,107,122,0.06)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${danger ? 'rgba(255,107,122,0.45)' : PT.glassStroke}`,
        color: danger ? PT.neonCoral : PT.textSecondary,
        boxShadow: danger ? '0 0 12px rgba(255,107,122,0.2)' : 'none',
      }}
    >
      {label}
    </div>
  );
}
