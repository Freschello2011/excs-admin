import { Link } from 'react-router-dom';
import styles from '../DashboardPage.module.scss';
import type { TodoItem } from '@/api/gen/client';

interface TodoBannerProps {
  items: TodoItem[];
  loading?: boolean;
}

/** 业务看板置顶"今日待办"条。空时变绿背景。PRD §4.3.1。 */
export default function TodoBanner({ items, loading }: TodoBannerProps) {
  const hasItems = items.length > 0;
  const urgentCount = items.filter((i) => i.Severity === 'urgent').length;

  const title = loading
    ? '今日待办 · 加载中…'
    : hasItems
      ? `今日待办（${items.length} 项）${urgentCount > 0 ? ` · 含 ${urgentCount} 紧急` : ''}`
      : '今日无异常，状态良好';

  return (
    <div className={`${styles.todoBanner} ${!hasItems && !loading ? styles.allOk : ''}`}>
      <div className={`${styles.todoTitle} ${!hasItems && !loading ? styles.ok : ''}`}>
        <span className={styles.icon}>{!hasItems && !loading ? '✓' : '⚠'}</span>
        <span>{title}</span>
      </div>
      {hasItems && (
        <div className={styles.todoChips}>
          {items.map((it) => (
            <Link
              key={it.Code}
              to={it.LinkPath || '#'}
              className={`${styles.todoChip} ${severityClass(it.Severity)}`}
            >
              <span className={styles.chipCount}>{it.Count}</span>
              <span className={styles.chipLabel}>{it.Label}</span>
              <span className={styles.chipArrow}>→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function severityClass(sev: TodoItem['Severity']): string {
  switch (sev) {
    case 'urgent': return styles.urgent;
    case 'warn':   return styles.warn;
    case 'info':   return styles.info;
    case 'ok':     return styles.ok;
    default:       return '';
  }
}
