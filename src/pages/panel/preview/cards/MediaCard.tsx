import type { PanelCard } from '@/types/panel';
import type { NameMaps } from '../PreviewPanel';
import { PT } from '../previewTokens';

interface Props {
  card: PanelCard;
  nameMaps: NameMaps;
}

/**
 * v2.0 播控卡 —— 对齐 Flutter MediaPlayerCard：
 *  - 16:9 预览区：胶片纹 + 中央 64pt 圆形青霓虹 ▶
 *  - 控件行：4 个**同尺寸** 38×38 圆角玻璃方按钮（stop / prev / play-pause / next），
 *    Play/Pause 仅在 isPlaying=true 时切到青霓虹填充；当前 idle 状态下 4 个一致
 *  - Spacer 撑开 → 右侧音量：speaker icon(16pt) + 120pt 青色 slider + 数字百分比
 */
export default function MediaCard({ card, nameMaps }: Props) {
  const exhibitId = card.binding?.id;
  const exhibitName = exhibitId ? (nameMaps.exhibit.get(exhibitId) ?? `展项 #${exhibitId}`) : '—';

  return (
    <GlassCard>
      {/* 标题 */}
      <div style={{ fontSize: 15, fontWeight: 600, color: PT.textPrimary, marginBottom: 14 }}>
        {exhibitName}播控
      </div>

      {/* 16:9 预览（胶片占位 + 中央青霓虹圆形 ▶） */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          width: '100%',
          borderRadius: 12,
          background: 'linear-gradient(180deg, #0b1220, #050811)',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: 10,
        }}
      >
        {/* filmstrip motif */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 6px, transparent 6px 28px), linear-gradient(135deg, rgba(179,136,255,0.08), rgba(38,191,247,0.08))',
            opacity: 0.7,
          }}
        />
        {/* 中央青霓虹 ▶（仅此处用大圆形 cyan，对齐 Flutter _NeonCenterPlayButton） */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, #8fe3ff, #26BFF7 70%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#06131e',
            fontSize: 22,
            boxShadow:
              '0 0 22px rgba(38,191,247,0.55), 0 0 46px rgba(38,191,247,0.25), inset 0 0 10px rgba(255,255,255,0.35)',
          }}
        >
          ▶
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 14,
            fontSize: 12,
            color: PT.textDisabled,
            zIndex: 1,
          }}
        >
          [ 未播放 ] ▾
        </div>
      </div>

      {/* 进度条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Bar fill="12%" />
        <span style={{ fontSize: 12, color: PT.textTertiary, fontVariantNumeric: 'tabular-nums' }}>
          00:00 / 03:12
        </span>
      </div>

      {/* 控件行：4 个同尺寸方按钮 + 音量 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <SquareBtn>■</SquareBtn>
        <SquareBtn>◀◀</SquareBtn>
        <SquareBtn>▶</SquareBtn>
        <SquareBtn>▶▶</SquareBtn>

        <div style={{ flex: 1 }} />

        {/* 音量：speaker icon + slider + 百分比 */}
        <span style={{ color: PT.textSecondary, fontSize: 14 }}>🔊</span>
        <div style={{ width: 120 }}>
          <Bar fill="100%" small />
        </div>
        <span
          style={{
            fontSize: 12,
            color: PT.textSecondary,
            minWidth: 32,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          100%
        </span>
      </div>

      {/* 底部信息 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: PT.textTertiary,
        }}
      >
        <span>循环播放: 关</span>
        <span>当前片源: — ▼</span>
      </div>
    </GlassCard>
  );
}

/* ─── 子组件 ─── */

function GlassCard({ children }: { children: React.ReactNode }) {
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
      {children}
    </div>
  );
}

function Bar({ fill, small }: { fill: string; small?: boolean }) {
  const h = small ? 3 : 6;
  return (
    <div
      style={{
        flex: 1,
        height: h,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: fill,
          background: 'linear-gradient(90deg, #26BFF7, #6be1ff)',
          boxShadow: '0 0 8px rgba(38,191,247,0.7)',
        }}
      />
      {!small && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: fill,
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 0 10px rgba(38,191,247,0.8)',
          }}
        />
      )}
    </div>
  );
}

/**
 * 控件行的方按钮：38×38, radius=10pt, 玻璃底 + 白色图标。
 * 当前预览只展示静态 idle 态：4 个按钮一致。
 * （真机 isPlaying=true 时第 3 个会切到青霓虹填充。）
 */
function SquareBtn({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: PT.radiusButton,
        background: PT.glassFillStrong,
        border: `1px solid ${PT.glassStroke}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: PT.textPrimary,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}
