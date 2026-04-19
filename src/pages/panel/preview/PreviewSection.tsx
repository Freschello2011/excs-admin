import type { PanelSection, PanelCard } from '@/types/panel';
import type { NameMaps } from './PreviewPanel';
import { PT } from './previewTokens';
import PreviewCard from './PreviewCard';

interface PreviewSectionProps {
  section: PanelSection;
  nameMaps: NameMaps;
  highlightedCardId?: number | null;
  onCardMouseEnter?: (cardId: number) => void;
  onCardMouseLeave?: () => void;
  onCardClick?: (cardId: number) => void;
}

/**
 * v2.0 Section：复刻 Flutter PanelSectionWidget._buildRows 的行布局：
 *  - scene_group / device_status / smarthome_status / ai 独占 → full
 *  - media + 相邻 device_toggle → 2:1 (media-device)
 *  - show + 相邻 device_toggle → 2:1 (media-device)（同样 buildRows 形状）
 *  - script + 后续 ai → 1:1 (script-ai)
 *  - 独立 device_toggle / slider → full
 */
export default function PreviewSection({
  section,
  nameMaps,
  highlightedCardId,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardClick,
}: PreviewSectionProps) {
  const cards = [...section.cards].sort((a, b) => a.sort_order - b.sort_order);
  const rows = buildLayoutRows(cards);

  return (
    <div style={{ marginBottom: PT.sectionGap }}>
      {/* Section 标题：22 / 13 排版 */}
      <div style={{ marginTop: 16, marginBottom: 14 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: PT.textPrimary,
            lineHeight: 1.15,
          }}
        >
          {section.name}
        </div>
        {section.section_type === 'global' && (
          <div style={{ fontSize: 13, color: PT.textTertiary, marginTop: 4 }}>
            场景切换与设备总览
          </div>
        )}
      </div>

      {/* 卡片行 */}
      {rows.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: PT.textDisabled,
            fontSize: 13,
            background: PT.glassFill,
            border: `1px solid ${PT.glassStroke}`,
            borderRadius: PT.radiusCard,
            backdropFilter: PT.blur,
            WebkitBackdropFilter: PT.blur,
          }}
        >
          暂无卡片
        </div>
      )}

      {rows.map((row, rowIdx) => (
        <div key={rowIdx} style={{ marginBottom: 16 }}>
          {row.type === 'full' && (
            <PreviewCard
              card={row.cards[0]}
              nameMaps={nameMaps}
              isHighlighted={highlightedCardId === row.cards[0].id}
              onMouseEnter={() => onCardMouseEnter?.(row.cards[0].id)}
              onMouseLeave={onCardMouseLeave}
              onClick={() => onCardClick?.(row.cards[0].id)}
            />
          )}

          {row.type === 'media-device' && (
            <div style={{ display: 'flex', gap: PT.mediaDeviceGap, alignItems: 'stretch' }}>
              <div style={{ flex: 2, minWidth: 0 }}>
                <PreviewCard
                  card={row.cards[0]}
                  nameMaps={nameMaps}
                  isHighlighted={highlightedCardId === row.cards[0].id}
                  onMouseEnter={() => onCardMouseEnter?.(row.cards[0].id)}
                  onMouseLeave={onCardMouseLeave}
                  onClick={() => onCardClick?.(row.cards[0].id)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <DeviceGridPreview
                  cards={row.cards.slice(1)}
                  nameMaps={nameMaps}
                  highlightedCardId={highlightedCardId}
                  onCardMouseEnter={onCardMouseEnter}
                  onCardMouseLeave={onCardMouseLeave}
                  onCardClick={onCardClick}
                />
              </div>
            </div>
          )}

          {row.type === 'script-ai' && (
            <div style={{ display: 'flex', gap: PT.mediaDeviceGap, height: PT.scriptAiRowHeight }}>
              {row.cards.map((card) => (
                <div key={card.id} style={{ flex: 1, minWidth: 0 }}>
                  <PreviewCard
                    card={card}
                    nameMaps={nameMaps}
                    isHighlighted={highlightedCardId === card.id}
                    onMouseEnter={() => onCardMouseEnter?.(card.id)}
                    onMouseLeave={onCardMouseLeave}
                    onClick={() => onCardClick?.(card.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── 设备网格容器（media/show 右侧的设备 tile 列表 + 空位）─── */

function DeviceGridPreview({
  cards,
  nameMaps,
  highlightedCardId,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardClick,
}: {
  cards: PanelCard[];
  nameMaps: NameMaps;
  highlightedCardId?: number | null;
  onCardMouseEnter?: (cardId: number) => void;
  onCardMouseLeave?: () => void;
  onCardClick?: (cardId: number) => void;
}) {
  // 槽位与 Flutter `_autoSlotCount` 对齐：右列与播控等高时，
  // typical 情况下 rowsFit=3 → **6 槽（3 行 × 2 列）**。设备多于 6 时按偶数补齐到 12。
  const evenCount = cards.length % 2 === 0 ? cards.length : cards.length + 1;
  const totalSlots = Math.min(12, Math.max(6, evenCount));
  const emptyCount = totalSlots - cards.length;

  // 对齐 Flutter PanelSectionWidget._buildDeviceGrid：
  // 玻璃容器 + "展项设备卡片" 标题 + 2 列 grid
  return (
    <div
      style={{
        padding: 12,
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
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: PT.textPrimary,
          marginBottom: 10,
        }}
      >
        展项设备卡片
      </div>
      {cards.length === 0 && emptyCount === 4 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: PT.textDisabled,
            fontSize: 13,
          }}
        >
          无设备
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridAutoRows: '1fr',
            gap: PT.deviceGridSpacing,
            flex: 1,
            minHeight: 0,
          }}
        >
          {cards.map((card) => (
            <PreviewCard
              key={card.id}
              card={card}
              nameMaps={nameMaps}
              isHighlighted={highlightedCardId === card.id}
              onMouseEnter={() => onCardMouseEnter?.(card.id)}
              onMouseLeave={onCardMouseLeave}
              onClick={() => onCardClick?.(card.id)}
            />
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <EmptyTile key={`empty-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyTile() {
  return (
    <div
      style={{
        borderRadius: 12,
        background:
          'linear-gradient(135deg, rgba(255,255,255,0.018), rgba(255,255,255,0.006))',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
        minHeight: PT.deviceTileMinHeight,
      }}
    />
  );
}

/* ─── 布局行构建（复刻 Flutter PanelSectionWidget._buildRows 逻辑）─── */

interface LayoutRow {
  type: 'full' | 'media-device' | 'script-ai';
  cards: PanelCard[];
}

function buildLayoutRows(cards: PanelCard[]): LayoutRow[] {
  const rows: LayoutRow[] = [];
  let i = 0;

  while (i < cards.length) {
    const card = cards[i];

    switch (card.card_type) {
      case 'scene_group':
      case 'device_status':
      case 'smarthome_status' as string:
        rows.push({ type: 'full', cards: [card] });
        i++;
        break;

      case 'media':
      case 'show': {
        // media/show + 相邻 device_toggle → 2:1 行
        const group: PanelCard[] = [card];
        let j = i + 1;
        while (j < cards.length && cards[j].card_type === 'device_toggle') {
          group.push(cards[j]);
          j++;
        }
        rows.push({ type: group.length > 1 ? 'media-device' : 'full', cards: group });
        i = j;
        break;
      }

      case 'script': {
        // script + 后续 ai → 1:1 行
        const group: PanelCard[] = [card];
        let j = i + 1;
        if (j < cards.length && cards[j].card_type === 'ai') {
          group.push(cards[j]);
          j++;
        }
        rows.push({ type: group.length > 1 ? 'script-ai' : 'full', cards: group });
        i = j;
        break;
      }

      case 'ai':
      case 'device_toggle':
      case 'slider':
      default:
        rows.push({ type: 'full', cards: [card] });
        i++;
        break;
    }
  }

  return rows;
}
