/**
 * raw_transport inline_commands code 自动生成（PRD: 01-docs/02-device-mgmt/PRD-inline-command-code-autogen.md D2）。
 *
 * 用户填好命令名字（如「开始演示」），保存前调用 generateInlineCommandCode 算出 code（如 kaishi_yanshi）。
 * 6 步规则：
 *   1. 规范化：trim + lowercase；非 ASCII 之外的 [\s./-]+ 折叠为 _；其他非 [a-z0-9_] 字符删除
 *   2. 中文 → 拼音：步骤 1 后仍含非 ASCII 时调 pinyin-pro（动态 import，首屏 0 影响），无声调连写 + 单词间 _
 *   3. 降级 fallback：仍为空（纯符号 / emoji）→ cmd_<8 位随机 hex>
 *   4. 拒保留前缀：命中 preset: 起头（ADR-0024 占用）→ 尾部追加 _x 重试一次
 *   5. 去重：与 existing 比对，冲突时尾部追加 _2/_3/...
 *   6. 长度上限：32 字符截断（截断后再做 4+5 检查）
 *
 * 因 pinyin-pro 是动态 import，本函数为 async；调用方应在保存前 await。
 */

const MAX_LEN = 32;
const RESERVED_PREFIXES = ['preset:'];

/**
 * 同步 fallback：把非 ASCII 字符全部剔掉只留 [a-z0-9_]。
 * 用于 pinyin-pro 加载失败 / 仍为空时再走一遍。
 */
function normalizeAscii(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s./-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function shortHex8(): string {
  // crypto.randomUUID 可用度高（modern browsers）；fallback 时用 Math.random 拼
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
}

function withReservedPrefixGuard(code: string): string {
  for (const p of RESERVED_PREFIXES) {
    if (code.startsWith(p)) {
      return `${code}_x`;
    }
  }
  return code;
}

function withDedup(code: string, existing: ReadonlySet<string>): string {
  if (!existing.has(code)) return code;
  for (let i = 2; i < 1000; i++) {
    const suffix = `_${i}`;
    const base = code.slice(0, MAX_LEN - suffix.length);
    const next = base + suffix;
    if (!existing.has(next)) return next;
  }
  // 极端 fallback：拼上 hex 短串（必然唯一）
  const suffix = `_${shortHex8()}`;
  return code.slice(0, MAX_LEN - suffix.length) + suffix;
}

/** 是否含 ASCII 范围外的字符（中文 / emoji 等触发 pinyin 转写）。 */
function hasNonAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7f]/.test(s);
}

/**
 * 主入口。existing 是同设备已有 code 的集合（不含本行）。
 *
 * 失败模式：pinyin-pro 加载失败时，中文名走 cmd_<hex> fallback。
 */
export async function generateInlineCommandCode(
  name: string,
  existing: ReadonlyArray<string> = [],
): Promise<string> {
  const existingSet = new Set(existing);

  // 步骤 1：规范化
  let core = normalizeAscii(name);

  // 步骤 2：中文等非 ASCII → pinyin-pro 转写（仅 step 1 后丢字才触发）
  if (hasNonAscii(name) && core.length === 0) {
    try {
      const mod = await import('pinyin-pro');
      // toneType=none 无声调；type=string 拿连写；nonZh=removed 把 emoji / 标点剔除
      // separator: '' → 汉字间不留空格，得到 "kaishiyanshi"-风格连写
      // nonZh: 'removed' → emoji / 标点剔除（'+' '-' '*' 一律不进 ID）
      const py = mod.pinyin(name, {
        toneType: 'none',
        type: 'string',
        nonZh: 'removed',
        separator: '',
        v: true,
      });
      core = normalizeAscii(py);
    } catch {
      // 加载失败 → 留空，下一步 fallback
      core = '';
    }
  }

  // 步骤 3：fallback
  if (core.length === 0) {
    core = `cmd_${shortHex8()}`;
  }

  // 步骤 6：先截一次（之后保留前缀 / 去重再可能加尾巴）
  if (core.length > MAX_LEN) {
    core = core.slice(0, MAX_LEN).replace(/_+$/, '');
  }

  // 步骤 4：拒保留前缀
  core = withReservedPrefixGuard(core);
  if (core.length > MAX_LEN) {
    core = core.slice(0, MAX_LEN).replace(/_+$/, '');
  }

  // 步骤 5：去重
  core = withDedup(core, existingSet);

  return core;
}

/**
 * 同步版本：用户在「详情」抽屉里手填 code 时实时校验 / 规范化用。
 * 不做 pinyin 转写、不做去重 / fallback——纯字符级清理。
 */
export function normalizeManualCode(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s./-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, MAX_LEN);
}

/**
 * 校验手填 code 合法性（用于抽屉里实时显示错误）。
 * 返回 null 表示合法；否则返回错误说明字符串。
 */
export function validateManualCode(
  code: string,
  existing: ReadonlyArray<string> = [],
): string | null {
  if (!code) return 'ID 不能为空（留空保存时会自动按名字生成）';
  // 保留前缀检查放在字符集之前——让 "preset:foo" 先被识别为命名空间冲突，
  // 而不是被通用"非法字符"覆盖（前者更明确，引导用户换名）
  for (const p of RESERVED_PREFIXES) {
    if (code.startsWith(p)) return `ID 不能以 ${p} 起头（系统保留）`;
  }
  if (code.length > MAX_LEN) return `ID 最多 ${MAX_LEN} 个字符`;
  if (!/^[a-z0-9_]+$/.test(code)) return 'ID 只能用小写英文字母 / 数字 / 下划线';
  if (existing.includes(code)) return `ID 与本设备已有命令重复`;
  return null;
}
