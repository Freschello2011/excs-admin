import { useRef, useCallback } from 'react';
import type { PanelSection } from '@/types/panel';
import { useHallStore } from '@/stores/hallStore';
import styles from './PreviewPanel.module.scss';
import PreviewTopBar from './PreviewTopBar';
import PreviewNavTabBar from './PreviewNavTabBar';
import PreviewSection from './PreviewSection';
import { PT } from './previewTokens';

export interface NameMaps {
  exhibit: Map<number, string>;
  device: Map<number, string>;
  scene: Map<number, string>;
}

interface PreviewPanelProps {
  sections: PanelSection[];
  nameMaps: NameMaps;
  highlightedCardId?: number | null;
  onCardMouseEnter?: (cardId: number) => void;
  onCardMouseLeave?: () => void;
  onCardClick?: (cardId: number) => void;
}

/**
 * 中控 App v2.0 实时预览（iPad 竖屏，暗黑毛玻璃 + 霓虹）
 *
 * 以 820pt 逻辑宽度（10.9" iPad 竖屏等效）渲染整页面，
 * 通过 transform: scale(...) 缩放到 wrapper 容器内宽。
 */
export default function PreviewPanel({
  sections,
  nameMaps,
  highlightedCardId,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardClick,
}: PreviewPanelProps) {
  const hallName = useHallStore((s) => s.selectedHallName) ?? '';
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // wrapper width 540 - 2px border = 538，缩放因子 = 538 / 820 ≈ 0.656
  const NOMINAL_WIDTH = 820;
  const CONTAINER_WIDTH = 538;
  const scale = CONTAINER_WIDTH / NOMINAL_WIDTH;

  const handleTabClick = useCallback((index: number) => {
    const sectionId = sections[index]?.id;
    if (sectionId && sectionRefs.current[sectionId]) {
      sectionRefs.current[sectionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [sections]);

  return (
    <div className={styles.wrapper}>
      {/* 顶部标注 */}
      <div className={styles.header}>
        <span className={styles.headerLabel}>中控 App 预览 · iPad 竖屏 · v2.0 Glass</span>
      </div>

      {/* 缩放容器 */}
      <div className={styles.scaleContainer} ref={scrollRef}>
        <div
          className={styles.scaleInner}
          style={{
            width: NOMINAL_WIDTH,
            transform: `scale(${scale})`,
            background: PT.pageBackground,
            // 让 transform-scale 后的实际占据高度等于 NOMINAL_WIDTH * scale 的比例
            // （transform 不改变 layout 高度；scrollContainer 用 inner 自身布局高度滚动）
          }}
        >
          {/* 顶部栏 */}
          <PreviewTopBar hallName={hallName} />

          {/* 导航栏 */}
          <PreviewNavTabBar
            sections={sections}
            activeSectionIndex={0}
            onTabClick={handleTabClick}
          />

          {/* 分区内容 */}
          <div
            style={{
              padding: `8px ${PT.pagePadding}px ${PT.sectionGap * 2}px`,
            }}
          >
            {sections.map((section) => (
              <div
                key={section.id}
                ref={(el) => { sectionRefs.current[section.id] = el; }}
              >
                <PreviewSection
                  section={section}
                  nameMaps={nameMaps}
                  highlightedCardId={highlightedCardId}
                  onCardMouseEnter={onCardMouseEnter}
                  onCardMouseLeave={onCardMouseLeave}
                  onCardClick={onCardClick}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
