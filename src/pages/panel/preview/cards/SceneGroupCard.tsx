import type { PanelCard } from '@/api/gen/client';
import { cardBinding } from '@/api/gen/client';
import type { NameMaps } from '../PreviewPanel';
import { PT, SCENE_NEON } from '../previewTokens';

interface Props {
  card: PanelCard;
  nameMaps: NameMaps;
}

/**
 * v2.0 场景按钮组（玻璃 + 紫霓虹方案 B，对齐 Flutter SceneButton + GlassContainer.neonColor）
 *
 * 关键：**所有场景**都有紫霓虹边（饱和） + inset rim；
 * **当前运行**的场景额外加 box-shadow 外发光，并把 `[ 待命 ]` 换成 mint `[ 运行中 ]` + 右上角 "当前" 角标。
 */
export default function SceneGroupCard({ card, nameMaps }: Props) {
  const sceneIds = cardBinding(card)?.ids ?? [];
  const buttons = sceneIds.length > 0
    ? sceneIds.map((id) => ({ id, name: nameMaps.scene.get(id) ?? `场景 #${id}` }))
    : [{ id: 0, name: '场景模式' }];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(buttons.length, 3)}, 1fr)`,
        gap: PT.sceneGridSpacing,
      }}
    >
      {buttons.map((btn, i) => {
        const isCurrent = i === 0; // 预览：第一个示例为当前运行
        const purpleBorder = 'rgba(179,136,255,0.55)';
        const purpleInset = 'rgba(179,136,255,0.25)';
        return (
          <div
            key={btn.id || i}
            style={{
              padding: 16,
              minHeight: PT.sceneButtonHeight,
              borderRadius: 16,
              background: PT.glassFill,
              // 所有场景都用饱和紫霓虹边
              border: `1.5px solid ${purpleBorder}`,
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
              // 仅 current 加外发光
              boxShadow: isCurrent
                ? `0 0 22px rgba(179,136,255,0.32), 0 0 46px rgba(179,136,255,0.14), inset 0 0 0 1px ${purpleInset}`
                : `inset 0 0 0 1px ${purpleInset}`,
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: PT.textPrimary,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {btn.name}
              </div>
              {/* 图标占位（小方块） */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  border: `1.5px solid ${SCENE_NEON}`,
                  flexShrink: 0,
                  marginLeft: 6,
                  opacity: isCurrent ? 1 : 0.7,
                }}
              />
            </div>
            <div
              style={{
                fontSize: 12,
                color: isCurrent ? PT.neonMint : PT.textDisabled,
                letterSpacing: '0.05em',
                marginTop: 6,
              }}
            >
              [ {isCurrent ? '运行中' : '待命'} ]
            </div>
            {isCurrent && (
              <span
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 12,
                  fontSize: 11,
                  color: SCENE_NEON,
                }}
              >
                当前
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
