/**
 * device-mgmt-v2 P9-C.2 follow-up（PRD 附录 D.10 / DDD §3.4.2）
 *
 * 前端"raw bytes 预览"工具：把 yaml `request` 模板（如 K32 ":::DMSZ<channels_fold>A."）
 * 加 params 还原成将要写到串口的字面量，admin 在指令组列表 / 矩阵全开按钮等地方一眼可读。
 *
 * 前后端各写一份 fold + render（共享算法但跨语言）；server 端权威实现见
 * 02-server/internal/application/command/raw_render.go：FoldChannels / renderRequestTemplate。
 * 两边算法保持完全一致 — 任何改动都得双端同步。
 */

/**
 * K32 通道列表 fold：连续段→a-b，散点→逗号，混合→1-3,5,7-9。
 *
 * 算法：去重 → 排序 → 扫连续段，长度 ≥2 折成 "a-b"，否则单输出 → join ","。
 *
 * 与 server FoldChannels 完全等价；通过 mockup 用例验证。
 */
export function foldChannels(input: number[]): string {
  if (!input || input.length === 0) return '';
  const dedup = Array.from(new Set(input)).sort((a, b) => a - b);

  const parts: string[] = [];
  let start = dedup[0];
  let prev = dedup[0];
  for (let i = 1; i < dedup.length; i++) {
    const x = dedup[i];
    if (x === prev + 1) {
      prev = x;
      continue;
    }
    parts.push(formatSeg(start, prev));
    start = x;
    prev = x;
  }
  parts.push(formatSeg(start, prev));
  return parts.join(',');
}

function formatSeg(s: number, e: number): string {
  return s === e ? String(s) : `${s}-${e}`;
}

/**
 * 渲染 yaml `request` 模板里的 <token>。
 *
 * 支持：
 *   - <channels_fold>：params.channels (number[]) → fold 后字符串
 *   - <name>：单值替换（params[name] toString）
 *
 * 不识别 / 缺参 → 返 null（让调用方 fallback 到原模板字符串显示，不出半成品）。
 */
export function renderRawPreview(
  template: string | undefined,
  params: Record<string, unknown> | null | undefined,
): string | null {
  if (!template) return null;
  let out = template;

  if (out.includes('<channels_fold>')) {
    const raw = params?.channels;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const chs = raw.map((x) => Number(x)).filter((x) => Number.isFinite(x));
    if (chs.length === 0) return null;
    out = out.split('<channels_fold>').join(foldChannels(chs));
  }

  // 通用 <name> 替换
  while (true) {
    const i = out.indexOf('<');
    if (i < 0) break;
    const j = out.indexOf('>', i);
    if (j < 0) return null;
    const name = out.slice(i + 1, j);
    if (!name) return null;
    const val = params?.[name];
    if (val === undefined || val === null) return null;
    out = out.slice(0, i) + scalarToString(val) + out.slice(j + 1);
  }
  return out;
}

function scalarToString(v: unknown): string {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  return String(v);
}
