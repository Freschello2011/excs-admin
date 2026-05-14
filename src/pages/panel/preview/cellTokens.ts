/**
 * 中控面板改版 P2 — 按钮单元 token（CSS 变量）
 *
 * 数据源：panel-redesign-PRD §3.2.1 + 07-ui/mockup/01-control-app/control-app-v2-mockup.html `.scene` / `.tile` / `.tile.empty`。
 *
 * 这一份 token 在 P3 由中控 App Flutter 端用同一规范实现（不共享代码，仅共享数值）；
 * scene_group / device_toggle / device_command 三种卡的按钮单元统一从这里读，
 * 保证不论容器宽度、不论卡型，按钮看起来都是同一种"积木"。
 */

import { PT } from './previewTokens';

/** 按钮单元 CSS 变量映射（通过 inline style 注入到容器或 :root） */
export const CELL_VARS: Record<string, string | number> = {
  '--cell-w': 'auto', // 由 grid 容器列数决定
  '--cell-h': '92px', // 与 v2.0 Glass 场景按钮高度一致（PT.sceneButtonHeight）
  '--cell-radius': '16px',
  '--cell-stroke': PT.glassStroke,
  '--cell-stroke-active': 'rgba(179,136,255,0.55)', // SCENE_NEON 紫
  '--cell-stroke-empty': 'rgba(255,255,255,0.05)', // PT.glassStrokeWeak（描边占位单元）
  '--cell-bg': PT.glassFill,
  '--cell-bg-empty': 'linear-gradient(135deg,rgba(255,255,255,.018),rgba(255,255,255,.006))',
  '--cell-blur': 'blur(14px) saturate(140%)',
  '--cell-padding': '16px',
  '--cell-title-fs': '16px',
  '--cell-status-fs': '12px',
  '--cell-gap': '12px',
};

/** 应用到根容器的样式对象 */
export function cellVarsStyle(): React.CSSProperties {
  return CELL_VARS as unknown as React.CSSProperties;
}
