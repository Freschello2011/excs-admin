import type { PanelCard, CardType } from '@/api/gen/client';
import { CARD_TYPE_LABELS } from '@/api/gen/client';
import type { NameMaps } from './PreviewPanel';
import { PT } from './previewTokens';

// ─── V2 精细卡片组件 ───
import SceneGroupCard from './cards/SceneGroupCard';
import MediaCard from './cards/MediaCard';
// ShowCard 已撤（2026-05-10）。演出收编进 media 卡「当前片源」picker。
// 若 DB 仍有遗留 show_control 卡（migration 漏跑/回滚）走 FallbackCard 显示
// "演出控制（已撤）"提示。
import DeviceToggleCard from './cards/DeviceToggleCard';
import DeviceCommandCard from './cards/DeviceCommandCard';
import DeviceStatusCard from './cards/DeviceStatusCard';
import SliderCard from './cards/SliderCard';
import ScriptCard from './cards/ScriptCard';
import AiCard from './cards/AiCard';

interface PreviewCardProps {
  card: PanelCard;
  nameMaps: NameMaps;
  isHighlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
  /** 列数提示——窄列（媒体右侧）= 2，独占整行 = 6（device_command 等用） */
  previewColumns?: number;
}

export default function PreviewCard({
  card,
  nameMaps,
  isHighlighted,
  onMouseEnter,
  onMouseLeave,
  onClick,
  previewColumns,
}: PreviewCardProps) {
  const content = (() => {
    switch (card.card_type) {
      case 'scene_group':
        return <SceneGroupCard card={card} nameMaps={nameMaps} />;
      case 'media':
        return <MediaCard card={card} nameMaps={nameMaps} />;
      // case 'show': 已撤（2026-05-10）;走 default → FallbackCard。
      case 'device_toggle':
        return <DeviceToggleCard card={card} nameMaps={nameMaps} />;
      case 'device_command':
        return <DeviceCommandCard card={card} nameMaps={nameMaps} columns={previewColumns} />;
      case 'device_status':
        return <DeviceStatusCard card={card} nameMaps={nameMaps} />;
      case 'slider':
        return <SliderCard card={card} nameMaps={nameMaps} />;
      case 'script':
        return <ScriptCard />;
      case 'ai':
        return <AiCard />;
      default:
        return <FallbackCard label={CARD_TYPE_LABELS[card.card_type as CardType] ?? card.card_type} />;
    }
  })();

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      className={isHighlighted ? 'preview-card-highlighted' : undefined}
    >
      {content}
    </div>
  );
}

function FallbackCard({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: PT.cardPadding,
        background: PT.glassFill,
        border: `1px solid ${PT.glassStroke}`,
        borderRadius: PT.radiusCard,
        backdropFilter: PT.blur,
        WebkitBackdropFilter: PT.blur,
        color: PT.textTertiary,
        fontSize: 13,
        textAlign: 'center',
      }}
    >
      {label}
    </div>
  );
}
