/**
 * 中控 App v2.0 设计令牌（暗黑毛玻璃 + 霓虹）
 * 数据源：07-ui/mockup/control-app-v2-mockup.html + 01-docs/ui/ExCS-panel-UI.md（v2.0）
 * 与 Flutter 端 control-app/lib/app/theme.dart (ExcsColors v2) 保持同步
 *
 * 用于 React 后台预览组件的 inline style；改色统一改这里，避免散落。
 */

export const PT = {
  // ─── 画布 ───
  bgDeep: '#080D1A',
  bgLight: '#1E293B',
  pageBackground:
    'radial-gradient(145% 120% at 18% 14%, #1E293B 0%, #080D1A 62%)',

  // ─── 玻璃表面 ───
  glassFill: 'rgba(255,255,255,0.04)',
  glassFillStrong: 'rgba(255,255,255,0.07)',
  glassInset: 'rgba(0,0,0,0.30)',
  glassStroke: 'rgba(255,255,255,0.12)',
  glassStrokeHover: 'rgba(255,255,255,0.20)',
  glassStrokeWeak: 'rgba(255,255,255,0.05)',

  // ─── 文字 ───
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.70)',
  textTertiary: 'rgba(255,255,255,0.54)',
  textDisabled: 'rgba(255,255,255,0.38)',
  textGhost: 'rgba(255,255,255,0.24)',
  // 兼容旧命名（PreviewSection 等沿用）
  textLabel: 'rgba(255,255,255,0.54)',

  // ─── 霓虹 ───
  neonCyan: '#26BFF7',
  neonPurple: '#B388FF',
  neonMagenta: '#FF5CD6',
  neonBlue: '#5B8CFF',
  neonMint: '#5BFF9E',
  neonAmber: '#FFC857',
  neonCoral: '#FF6B7A',

  // 兼容旧命名（被旧代码引用）
  accent: '#26BFF7',
  online: '#5BFF9E',
  warning: '#FFC857',
  offline: '#FF6B7A',

  // ─── 圆角 ───
  radiusCard: 18,
  radiusButton: 10,
  radiusLabel: 8,
  radiusPill: 999,

  // ─── 玻璃模糊（CSS backdrop-filter）───
  blur: 'blur(15px) saturate(140%)',
  blurStrong: 'blur(18px) saturate(140%)',

  // ─── 布局尺寸（v2 portrait, dp）───
  topBarHeight: 84,
  navBarHeight: 48,
  pagePadding: 20,
  sectionGap: 24,
  cardPadding: 16,

  // 场景按钮
  sceneButtonHeight: 92,
  sceneGridSpacing: 12,
  sceneGridRunSpacing: 12,

  // 设备瓷砖
  deviceTileMinHeight: 68,
  deviceGridSpacing: 8,

  // 行布局
  scriptAiRowHeight: 240,
  mediaDeviceGap: 12,
} as const;

/**
 * 给定霓虹色 → 玻璃 box-shadow 描边发光（两层叠加）
 */
export function neonGlow(color: string, opacityStrong = 0.32, opacityWide = 0.14): string {
  return [
    `0 0 22px ${withOpacity(color, opacityStrong)}`,
    `0 0 46px ${withOpacity(color, opacityWide)}`,
    `inset 0 0 0 1px ${withOpacity(color, 0.25)}`,
  ].join(', ');
}

function withOpacity(hex: string, alpha: number): string {
  // 仅支持 #RRGGBB
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * 场景统一霓虹主色（v2.0 方案 B，对齐 Flutter `ExcsColors.sceneNeon = neonPurple`）。
 * 离线时切到 coral 警示。
 */
export const SCENE_NEON = PT.neonPurple;
