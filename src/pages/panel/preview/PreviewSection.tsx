import type { PanelSection, PanelCard } from '@/api/gen/client';
import type { NameMaps } from './PreviewPanel';
import { PT } from './previewTokens';
import PanelButtonCell from './PanelButtonCell';
import { CELL_VARS } from './cellTokens';
import PreviewCard from './PreviewCard';
import { buildLayoutRows } from './buildLayoutRows';

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
                <MediaRightColumn
                  rightCards={row.cards.slice(1)}
                  nameMaps={nameMaps}
                  highlightedCardId={highlightedCardId}
                  onCardMouseEnter={onCardMouseEnter}
                  onCardMouseLeave={onCardMouseLeave}
                  onCardClick={onCardClick}
                />
              </div>
            </div>
          )}

          {row.type === 'toggle-group' && (
            <ToggleGroupCard
              cards={row.cards}
              nameMaps={nameMaps}
              highlightedCardId={highlightedCardId}
              onCardMouseEnter={onCardMouseEnter}
              onCardMouseLeave={onCardMouseLeave}
              onCardClick={onCardClick}
            />
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

/* ─── media/show 右侧 1/3 列：device_toggle 聚合为"展项设备卡片"网格，
       device_command 单独以 PanelButtonCell 2 列窄网格渲染 ─── */

function MediaRightColumn({
  rightCards,
  nameMaps,
  highlightedCardId,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardClick,
}: {
  rightCards: PanelCard[];
  nameMaps: NameMaps;
  highlightedCardId?: number | null;
  onCardMouseEnter?: (cardId: number) => void;
  onCardMouseLeave?: () => void;
  onCardClick?: (cardId: number) => void;
}) {
  // 按 source order 把连续 device_toggle 聚合成一个 grid block，device_command 单独 block
  type Block =
    | { kind: 'toggles'; cards: PanelCard[] }
    | { kind: 'command'; card: PanelCard };
  const blocks: Block[] = [];
  let pending: PanelCard[] = [];
  const flush = () => {
    if (pending.length > 0) {
      blocks.push({ kind: 'toggles', cards: pending });
      pending = [];
    }
  };
  for (const c of rightCards) {
    if (c.card_type === 'device_toggle') {
      pending.push(c);
    } else if (c.card_type === 'device_command') {
      flush();
      blocks.push({ kind: 'command', card: c });
    }
  }
  flush();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {blocks.map((b, i) => {
        if (b.kind === 'toggles') {
          return (
            <DeviceGridPreview
              key={'t' + i}
              cards={b.cards}
              nameMaps={nameMaps}
              highlightedCardId={highlightedCardId}
              onCardMouseEnter={onCardMouseEnter}
              onCardMouseLeave={onCardMouseLeave}
              onCardClick={onCardClick}
            />
          );
        }
        return (
          <PreviewCard
            key={'c' + b.card.id}
            card={b.card}
            nameMaps={nameMaps}
            isHighlighted={highlightedCardId === b.card.id}
            onMouseEnter={() => onCardMouseEnter?.(b.card.id)}
            onMouseLeave={onCardMouseLeave}
            onClick={() => onCardClick?.(b.card.id)}
            previewColumns={2}
          />
        );
      })}
    </div>
  );
}

/* ─── 独占整行的 device_toggle 聚合卡：玻璃卡片 + "设备开关卡片"标题 + 6 列 PanelButtonCell 网格 ─── */

function ToggleGroupCard({
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
  const cols = 6;
  const totalSlots = Math.ceil(Math.max(cards.length, 1) / cols) * cols;
  const emptyCount = totalSlots - cards.length;
  return (
    <div
      style={{
        padding: 12,
        background: PT.glassFill,
        border: `1px solid ${PT.glassStroke}`,
        borderRadius: PT.radiusCard,
        backdropFilter: PT.blur,
        WebkitBackdropFilter: PT.blur,
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
        设备开关卡片
      </div>
      <div
        style={{
          ...CELL_VARS,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 'var(--cell-gap)',
        }}
      >
        {cards.map((card) => (
          <div
            key={card.id}
            onMouseEnter={() => onCardMouseEnter?.(card.id)}
            onMouseLeave={onCardMouseLeave}
            onClick={() => onCardClick?.(card.id)}
            className={highlightedCardId === card.id ? 'preview-card-highlighted' : undefined}
          >
            <DeviceTogglePreviewCell card={card} nameMaps={nameMaps} />
          </div>
        ))}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <PanelButtonCell key={`empty-${i}`} empty />
        ))}
      </div>
    </div>
  );
}

/** 单个 device_toggle 用 PanelButtonCell 渲染 —— 默认"待命"态（admin 预览不含实时设备状态）。 */
function DeviceTogglePreviewCell({ card, nameMaps }: { card: PanelCard; nameMaps: NameMaps }) {
  const binding = card.binding as { id?: number } | null | undefined;
  const id = binding?.id;
  const label = id ? nameMaps.device.get(id) ?? `设备 #${id}` : '未绑定';
  return (
    <PanelButtonCell tone="device" label={label} status="待命" />
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

/* ─── 布局行构建逻辑：详见 buildLayoutRows.ts（双端契约纯函数） ─── */
