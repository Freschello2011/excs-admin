/** Dashboard 卡片通用格式化小工具。 */

/** 数值 → 带千分位字符串；无穷/NaN → "—" */
export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString();
}

/** 环比涨幅 → 带符号百分比，保留 1 位小数 */
export function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

/** 字节数 → 人类可读（自动选 TB/GB/MB）；精度 2 位 */
export function fmtBytes(bytes: number): { value: string; unit: string } {
  if (!Number.isFinite(bytes) || bytes < 0) return { value: '—', unit: '' };
  const TB = 1024 * 1024 * 1024 * 1024;
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  if (bytes >= TB) return { value: (bytes / TB).toFixed(2), unit: 'TB' };
  if (bytes >= GB) return { value: (bytes / GB).toFixed(2), unit: 'GB' };
  if (bytes >= MB) return { value: (bytes / MB).toFixed(1), unit: 'MB' };
  return { value: bytes.toLocaleString(), unit: 'B' };
}

/** 秒 → 人类可读时长（如 "6 天 14:22"） */
export function fmtUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  if (days > 0) return `${days} 天 ${hh}:${mm}`;
  return `${hh}:${mm}`;
}

/** ISO 时间戳 → MM-DD HH:mm */
export function fmtShortDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MM}-${DD} ${HH}:${mm}`;
}

/** ISO 时间戳 → YYYY-MM-DD */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** period → 环比前缀 */
export function prevPeriodLabel(p: 'day' | 'week' | 'month' | 'year'): string {
  switch (p) {
    case 'week': return '较上周';
    case 'month': return '较上月';
    case 'year': return '较上年';
    default: return '较上日';
  }
}
