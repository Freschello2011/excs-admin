/**
 * device-mgmt-v2 P9-D：抽出顶层 AntD ConfigProvider，按 fieldMode 动态切换 component size token。
 *
 * 同时承担：
 *   - 顶层 <html data-field-mode> 同步（CSS density token 切换的入口）
 *   - Wake Lock（现场态屏幕保持常亮，老浏览器静默降级）
 *
 * ADR-0015：维持单一组件库，token 切换替代另写一套界面。
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useAppStore } from '@/stores/appStore';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { useFieldMode } from '@/stores/fieldModeStore';

interface DensityTokens {
  controlHeight: number;
  controlHeightSM: number;
  controlHeightLG: number;
  fontSize: number;
  tableCellPaddingBlock: number;
  paddingContentHorizontal: number;
}

function resolveDensity(fieldMode: boolean): DensityTokens {
  if (fieldMode) {
    return {
      controlHeight: 48,
      controlHeightSM: 36,
      controlHeightLG: 56,
      fontSize: 16,
      tableCellPaddingBlock: 18,
      paddingContentHorizontal: 24,
    };
  }
  return {
    controlHeight: 32,
    controlHeightSM: 24,
    controlHeightLG: 40,
    fontSize: 13,
    tableCellPaddingBlock: 12,
    paddingContentHorizontal: 14,
  };
}

export default function AntdConfigProvider({ children }: { children: ReactNode }) {
  const currentTheme = useAppStore((s) => s.theme);
  const tokens = useThemeTokens();
  const fieldMode = useFieldMode((s) => s.enabled);

  /* sync <html data-field-mode>（首次 mount 也要 sync），并在 enabled 时申请 Wake Lock */
  useEffect(() => {
    document.documentElement.dataset.fieldMode = String(fieldMode);

    if (!fieldMode) return;

    type WakeLockSentinelLike = { release: () => Promise<void> };
    let lock: WakeLockSentinelLike | null = null;
    let released = false;

    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };

    if (nav.wakeLock?.request) {
      nav.wakeLock
        .request('screen')
        .then((l) => {
          if (released) {
            l.release().catch(() => {});
            return;
          }
          lock = l;
        })
        .catch((err) => {
          // 老浏览器 / 用户拒绝 / 页面隐藏均会 reject —— 静默降级
          console.warn('[fieldMode] wakeLock.request failed:', err);
        });
    } else {
      console.warn('[fieldMode] navigator.wakeLock unavailable; screen wake disabled.');
    }

    return () => {
      released = true;
      lock?.release().catch(() => {});
    };
  }, [fieldMode]);

  const density = resolveDensity(fieldMode);

  const themeConfig = useMemo(() => ({
    algorithm: currentTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: tokens.primary,
      colorSuccess: tokens.success,
      colorWarning: tokens.warning,
      colorError: tokens.error,
      colorBgLayout: tokens.surface,
      colorText: tokens.onSurface,
      colorBorderSecondary: tokens.outline,
      borderRadius: 8,
      borderRadiusLG: 16,
      fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      fontSize: density.fontSize,
      controlHeight: density.controlHeight,
      controlHeightSM: density.controlHeightSM,
      controlHeightLG: density.controlHeightLG,
      paddingContentHorizontal: density.paddingContentHorizontal,
      // 全局阴影升级到 shadow-md 等级 —— 多层精致阴影
      boxShadow: '0 1px 2px rgba(24, 28, 60, 0.04), 0 4px 10px rgba(24, 28, 60, 0.05), 0 10px 24px -8px rgba(80, 60, 170, 0.10)',
      boxShadowSecondary: '0 2px 4px rgba(24, 28, 60, 0.04), 0 8px 24px rgba(24, 28, 60, 0.06), 0 24px 48px -12px rgba(80, 60, 170, 0.14)',
    },
    components: {
      Table: {
        cellPaddingBlock: density.tableCellPaddingBlock,
        headerSplitColor: 'transparent',
        // 低饱和表头——mockup thead: rgba(247,248,252,.6) + 浅灰字 + 11px/600/tracking
        headerBg: currentTheme === 'dark' ? 'rgba(26, 33, 57, 0.5)' : 'rgba(247, 248, 252, 0.6)',
        headerColor: currentTheme === 'dark' ? '#B4B8CC' : '#8A93A5',
        rowHoverBg: currentTheme === 'dark' ? 'rgba(166, 141, 255, 0.06)' : 'rgba(106, 78, 232, 0.04)',
        borderColor: currentTheme === 'dark' ? '#353E5C' : 'rgba(220, 224, 236, 0.4)',
      },
      Button: {
        controlHeight: density.controlHeight,
        controlHeightSM: density.controlHeightSM,
        controlHeightLG: density.controlHeightLG,
      },
      Input: {
        controlHeight: density.controlHeight,
        controlHeightSM: density.controlHeightSM,
        controlHeightLG: density.controlHeightLG,
      },
      Select: {
        controlHeight: density.controlHeight,
        controlHeightSM: density.controlHeightSM,
        controlHeightLG: density.controlHeightLG,
      },
      Form: {
        itemMarginBottom: fieldMode ? 20 : 14,
      },
      Menu: { itemSelectedBg: 'rgba(106, 78, 232, 0.12)' },
      Card: {
        borderRadiusLG: 16,
        headerBg: 'transparent',
        headerFontSize: 14,
        headerHeight: 48,
        // 关键：去边框 + 白底 + 立体阴影
        colorBorderSecondary: 'transparent',
        boxShadowTertiary: '0 1px 2px rgba(24, 28, 60, 0.04), 0 4px 10px rgba(24, 28, 60, 0.05), 0 10px 24px -8px rgba(80, 60, 170, 0.10)',
        colorBgContainer: currentTheme === 'dark' ? 'rgba(26, 33, 57, 0.6)' : 'rgba(255, 255, 255, 0.75)',
      },
      Statistic: {
        titleFontSize: 13,
        contentFontSize: 28,
      },
      Tabs: {
        itemColor: currentTheme === 'dark' ? '#B4B8CC' : '#4A4D63',
        itemHoverColor: tokens.primary,
        itemSelectedColor: tokens.primary,
        itemActiveColor: tokens.primary,
        inkBarColor: tokens.primary,
        horizontalItemPadding: '10px 0',
        horizontalItemGutter: 24,
        titleFontSize: 13,
        cardBg: 'transparent',
      },
    },
  }), [currentTheme, tokens, density, fieldMode]);

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      {children}
    </ConfigProvider>
  );
}
