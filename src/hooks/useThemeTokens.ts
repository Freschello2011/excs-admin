import { useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';

/**
 * 从 global.scss 的 CSS 变量读出当前主题下的色值（hex/rgb 字符串）。
 *
 * 使用场景：JS 里必须拿到实际色值的地方（ECharts option、AntD ConfigProvider token、
 * 部分第三方组件的 color prop）。对于普通 JSX style，直接写 `var(--color-primary)` 即可，
 * 不需要本 hook。
 *
 * 依赖 `appStore.theme` 触发重算 —— 主题切换时自动拿到新值。
 */
export function useThemeTokens() {
  const theme = useAppStore((s) => s.theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback;
    return {
      primary: read('--color-primary', '#409EFF'),
      success: read('--color-success', '#67C23A'),
      warning: read('--color-warning', '#E6A23C'),
      error: read('--color-error', '#F56C6C'),
      surface: read('--color-surface', '#f8f9ff'),
      onSurface: read('--color-on-surface', '#181c20'),
      outline: read('--color-outline', '#707784'),
    };
  }, [theme]);
}
