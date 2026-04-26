import type { PanelCard } from '@/api/gen/client';
import { cardBinding } from '@/api/gen/client';
import type { NameMaps } from '../PreviewPanel';
import { PT } from '../previewTokens';

interface Props {
  card: PanelCard;
  nameMaps: NameMaps;
}

/**
 * v2.0 设备状态概览：玻璃满宽卡，胶囊化每个设备 = 圆点 + 名称。
 * - 在线 → mint 圆点，白字
 * - 离线 → coral 圆点 + coral 字 + coral 描边胶囊
 * 对齐 mockup `.overview` / `.chip` / `.chip.offline`.
 */
export default function DeviceStatusCard({ card, nameMaps }: Props) {
  const deviceIds = cardBinding(card)?.ids ?? [];
  const devices = deviceIds.map((id, i) => ({
    id,
    name: nameMaps.device.get(id) ?? `设备 #${id}`,
    // 预览：奇数索引置离线以展示双形态
    online: i % 2 === 0,
  }));
  const onlineCount = devices.filter((d) => d.online).length;

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: PT.textPrimary }}>设备状态概览</span>
        <span style={{ fontSize: 13, color: PT.textTertiary }}>
          在线 <span style={{ color: PT.textPrimary }}>{onlineCount}</span> / {devices.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {devices.map((d) => (
          <div
            key={d.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: PT.radiusPill,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${
                d.online ? PT.glassStroke : 'rgba(255,107,122,0.35)'
              }`,
              fontSize: 12,
              color: d.online ? PT.textSecondary : PT.neonCoral,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: d.online ? PT.neonMint : PT.neonCoral,
                boxShadow: d.online
                  ? `0 0 6px ${PT.neonMint}`
                  : `0 0 6px ${PT.neonCoral}`,
              }}
            />
            {d.name}
          </div>
        ))}
        {devices.length === 0 && (
          <span style={{ fontSize: 12, color: PT.textDisabled }}>无设备</span>
        )}
      </div>
    </div>
  );
}
