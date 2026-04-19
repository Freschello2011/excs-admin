import type { PanelSection } from '@/types/panel';
import { PT } from './previewTokens';

interface PreviewNavTabBarProps {
  sections: PanelSection[];
  activeSectionIndex: number;
  onTabClick?: (index: number) => void;
}

/**
 * v2.0 顶部 Tab：玻璃药丸；活跃 Tab = 青霓虹描边 + 轻柔发光 + 青字。
 * 对齐 mockup `.tab` / `.tab.active`。
 */
export default function PreviewNavTabBar({
  sections,
  activeSectionIndex,
  onTabClick,
}: PreviewNavTabBarProps) {
  if (!sections.length) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: `2px ${PT.pagePadding}px 10px`,
        height: PT.navBarHeight,
        overflowX: 'auto',
        overflowY: 'hidden',
        background: 'transparent',
      }}
    >
      {sections.map((section, i) => {
        const isActive = i === activeSectionIndex;
        return (
          <div
            key={section.id}
            onClick={() => onTabClick?.(i)}
            style={{
              padding: '10px 18px',
              borderRadius: PT.radiusPill,
              background: isActive
                ? 'rgba(38,191,247,0.08)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${
                isActive ? 'rgba(38,191,247,0.65)' : PT.glassStroke
              }`,
              color: isActive ? PT.neonCyan : PT.textSecondary,
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              userSelect: 'none',
              flexShrink: 0,
              boxShadow: isActive
                ? '0 0 10px rgba(38,191,247,0.35)'
                : 'none',
              transition: 'all 0.2s',
            }}
          >
            {section.name}
          </div>
        );
      })}
    </div>
  );
}
