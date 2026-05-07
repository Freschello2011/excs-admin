/**
 * <PanelSectionNav> — device_command 编辑器 v2 左 280px 面板分区导航
 *
 * S5-9（ADR-0020-v2 Stage 5 admin Phase C · admin-UI §4.20.5 + mockup M2 line 442-487）。
 *
 * 渲染整张 panel buffer 的层级结构（分区 → 卡片）；当前激活的 device_command 卡高亮。
 * 只读视图——切换激活卡走 onActivateCard 回调；本组件不持久化。
 */
import type { CardType } from '@/api/gen/client';
import {
  CARD_TYPE_LABELS,
  CARD_TYPE_ICONS,
  SECTION_TYPE_LABELS,
} from '@/api/gen/client';
import type { BufferSection, BufferCard } from '../panelBuffer';

interface Props {
  sections: BufferSection[];
  activeCardId: number;
  onActivateCard: (sectionId: number, card: BufferCard) => void;
}

export default function PanelSectionNav({
  sections,
  activeCardId,
  onActivateCard,
}: Props) {
  return (
    <aside
      data-testid="panel-section-nav"
      style={{
        background: 'var(--ant-color-bg-container)',
        border: '1px solid var(--ant-color-border-secondary)',
        borderRadius: 12,
        padding: 14,
        position: 'sticky',
        top: 16,
        maxHeight: 'calc(100vh - 96px)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ant-color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 8,
          paddingLeft: 4,
        }}
      >
        面板结构（草稿）
      </div>

      {sections.map((section) => (
        <div key={section.id} style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-tertiary)',
              fontWeight: 600,
              padding: '4px 8px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {SECTION_TYPE_LABELS[section.section_type]}
            {section.exhibit_id ? ` · 展项#${section.exhibit_id}` : ''}
            {' · '}
            {section.name}
          </div>
          {section.cards.map((card) => {
            const active = card.id === activeCardId;
            const interactive = card.card_type === 'device_command';
            return (
              <button
                key={card.id}
                type="button"
                disabled={!interactive}
                data-testid={`panel-section-nav-card-${card.id}`}
                data-active={active ? 'true' : 'false'}
                onClick={() => interactive && onActivateCard(section.id, card)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  margin: '2px 0',
                  borderRadius: 8,
                  width: '100%',
                  border: '1px solid',
                  borderColor: active
                    ? 'var(--ant-color-primary)'
                    : 'transparent',
                  background: active
                    ? 'var(--ant-color-primary-bg)'
                    : 'transparent',
                  cursor: interactive ? 'pointer' : 'default',
                  textAlign: 'left',
                  font: 'inherit',
                  fontSize: 13,
                  color: active
                    ? 'var(--ant-color-primary)'
                    : interactive
                      ? 'var(--ant-color-text)'
                      : 'var(--ant-color-text-tertiary)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 16,
                    color: active
                      ? 'var(--ant-color-primary)'
                      : 'var(--ant-color-text-tertiary)',
                  }}
                >
                  {CARD_TYPE_ICONS[card.card_type as CardType]}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {CARD_TYPE_LABELS[card.card_type as CardType]}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: active
                      ? 'var(--ant-color-primary-bg-hover)'
                      : 'var(--ant-color-fill-quaternary)',
                    color: active
                      ? 'var(--ant-color-primary)'
                      : 'var(--ant-color-text-tertiary)',
                  }}
                >
                  {card.card_type}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
