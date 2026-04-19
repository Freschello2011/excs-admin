import type { PanelCard } from '@/types/panel';
import { CARD_TYPE_LABELS } from '@/types/panel';
import type { NameMaps } from './PreviewPanel';
import { PT } from './previewTokens';

// ─── V2 精细卡片组件 ───
import SceneGroupCard from './cards/SceneGroupCard';
import MediaCard from './cards/MediaCard';
import ShowCard from './cards/ShowCard';
import DeviceToggleCard from './cards/DeviceToggleCard';
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
}

export default function PreviewCard({
  card,
  nameMaps,
  isHighlighted,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: PreviewCardProps) {
  const content = (() => {
    switch (card.card_type) {
      case 'scene_group':
        return <SceneGroupCard card={card} nameMaps={nameMaps} />;
      case 'media':
        return <MediaCard card={card} nameMaps={nameMaps} />;
      case 'show':
        return <ShowCard card={card} nameMaps={nameMaps} />;
      case 'device_toggle':
        return <DeviceToggleCard card={card} nameMaps={nameMaps} />;
      case 'device_status':
        return <DeviceStatusCard card={card} nameMaps={nameMaps} />;
      case 'slider':
        return <SliderCard card={card} nameMaps={nameMaps} />;
      case 'script':
        return <ScriptCard />;
      case 'ai':
        return <AiCard />;
      default:
        return <FallbackCard label={CARD_TYPE_LABELS[card.card_type] ?? card.card_type} />;
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
