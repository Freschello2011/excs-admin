import { type ReactNode } from 'react';
import styles from './PillTabs.module.scss';

export interface PillTab<K extends string = string> {
  key: K;
  label: string;
  icon?: ReactNode;
}

interface PillTabsProps<K extends string = string> {
  tabs: PillTab<K>[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
}

/**
 * 玻璃胶囊 Tab 组件 — ExCS 通用导航胶囊
 *
 * - 视觉与 ExhibitDetailPage / StorageOverviewPage 保持一致
 * - 内置 ARIA tablist + 键盘 ←→ Home/End 切换
 * - 调用方负责管理 active state（建议结合 URL `?tab=` 深链）
 */
export default function PillTabs<K extends string = string>({
  tabs, active, onChange, ariaLabel,
}: PillTabsProps<K>) {
  return (
    <div className={styles.outerTabs} role="tablist" aria-label={ariaLabel}>
      {tabs.map((t, idx) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={isActive ? `${styles.outerTab} ${styles.outerTabActive}` : styles.outerTab}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => {
              const last = tabs.length - 1;
              let nextIdx: number | null = null;
              if (e.key === 'ArrowRight') nextIdx = idx === last ? 0 : idx + 1;
              else if (e.key === 'ArrowLeft') nextIdx = idx === 0 ? last : idx - 1;
              else if (e.key === 'Home') nextIdx = 0;
              else if (e.key === 'End') nextIdx = last;
              if (nextIdx !== null) {
                e.preventDefault();
                onChange(tabs[nextIdx].key);
                requestAnimationFrame(() => {
                  const btns = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                  btns?.[nextIdx!]?.focus();
                });
              }
            }}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
