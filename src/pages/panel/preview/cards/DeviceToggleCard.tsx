import type { PanelCard } from '@/types/panel';
import type { NameMaps } from '../PreviewPanel';
import { PT } from '../previewTokens';

interface Props {
  card: PanelCard;
  nameMaps: NameMaps;
}

/**
 * v2.0 设备瓷砖：玻璃 + 离线 = coral 霓虹描边（不再置灰）。
 * 对齐 mockup `.tile` / `.tile.offline`。
 */
export default function DeviceToggleCard({ card, nameMaps }: Props) {
  const deviceId = card.binding?.id;
  const deviceName = deviceId ? (nameMaps.device.get(deviceId) ?? `设备 #${deviceId}`) : '—';
  // 预览：默认离线状态以展示 coral neon overlay
  const isOffline = true;

  return (
    <div
      style={{
        borderRadius: 12,
        padding: '10px 12px',
        background: PT.glassFill,
        border: `1px solid ${
          isOffline ? 'rgba(255,107,122,0.55)' : PT.glassStroke
        }`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        minHeight: PT.deviceTileMinHeight,
        boxSizing: 'border-box',
        boxShadow: isOffline
          ? '0 0 16px rgba(255,107,122,0.35), 0 0 32px rgba(255,107,122,0.15), inset 0 0 0 1px rgba(255,107,122,0.25)'
          : 'none',
        height: '100%',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: PT.textPrimary,
            lineHeight: 1.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {deviceName}
        </div>
        <div style={{ fontSize: 11, color: PT.textTertiary, marginTop: 2 }}>
          [ 关 ]
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          color: isOffline ? PT.neonCoral : PT.textTertiary,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isOffline ? PT.neonCoral : PT.neonMint,
            boxShadow: isOffline
              ? `0 0 8px ${PT.neonCoral}`
              : `0 0 8px ${PT.neonMint}`,
          }}
        />
        <span>{isOffline ? '离线' : '在线'}</span>
      </div>
    </div>
  );
}
