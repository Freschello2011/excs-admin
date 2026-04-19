import type { ReactNode } from 'react';
import styles from './PageHeader.module.scss';

interface PageHeaderProps {
  title?: string;
  description?: string;
  extra?: ReactNode;
  className?: string;
}

export default function PageHeader({ description, extra, className }: PageHeaderProps) {
  if (!description && !extra) return null;

  return (
    <div className={`${styles.pageHeader}${className ? ` ${className}` : ''}`}>
      <div>
        {description && <p className={styles.pageDesc}>{description}</p>}
      </div>
      {extra}
    </div>
  );
}
