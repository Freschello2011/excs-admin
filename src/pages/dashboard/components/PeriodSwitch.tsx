import styles from '../DashboardPage.module.scss';
import type { BusinessPeriod } from '@/api/gen/client';

interface PeriodSwitchProps {
  value: BusinessPeriod;
  onChange: (p: BusinessPeriod) => void;
}

const OPTIONS: Array<{ key: BusinessPeriod; label: string }> = [
  { key: 'day', label: '天' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' },
];

/** 业务看板右上角"天 / 周 / 月 / 年"切换。 */
export default function PeriodSwitch({ value, onChange }: PeriodSwitchProps) {
  return (
    <div className={styles.periodGroup}>
      <span className={styles.periodLabel}>📅 环比周期</span>
      <div className={styles.periodSwitch}>
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`${styles.periodBtn} ${value === opt.key ? styles.active : ''}`}
            onClick={() => onChange(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
