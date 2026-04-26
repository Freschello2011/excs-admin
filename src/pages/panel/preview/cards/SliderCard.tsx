import type { PanelCard } from '@/api/gen/client';
import { cardBinding } from '@/api/gen/client';
import type { NameMaps } from '../PreviewPanel';
import { PT } from '../previewTokens';

interface Props {
  card: PanelCard;
  nameMaps: NameMaps;
}

/**
 * v2.0 滑块控制：玻璃 + 青霓虹轨道 + 白色拇指（青光晕）。
 */
export default function SliderCard({ card, nameMaps }: Props) {
  const deviceId = cardBinding(card)?.id;
  const deviceName = deviceId ? (nameMaps.device.get(deviceId) ?? `设备 #${deviceId}`) : '—';

  return (
    <div
      style={{
        padding: PT.cardPadding,
        background: PT.glassFill,
        border: `1px solid ${PT.glassStroke}`,
        borderRadius: PT.radiusCard,
        backdropFilter: PT.blur,
        WebkitBackdropFilter: PT.blur,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: PT.textPrimary, marginBottom: 12 }}>
        {deviceName}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            flex: 1,
            height: 6,
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
              width: '50%',
              background: 'linear-gradient(90deg, #26BFF7, #6be1ff)',
              boxShadow: '0 0 8px rgba(38,191,247,0.7)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 0 10px rgba(38,191,247,0.8)',
            }}
          />
        </div>
        <span style={{ fontSize: 12, color: PT.textSecondary, minWidth: 34, textAlign: 'right' }}>
          50%
        </span>
      </div>
    </div>
  );
}
