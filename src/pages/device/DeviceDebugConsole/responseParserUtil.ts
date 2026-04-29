/**
 * device-mgmt-v2 P9-C.2 — ResponseSchema 前端解析（与后端 02-server runtime parser 对齐）。
 *
 * 仅用于 admin 调试台 [响应解析] tab 的可视化：在 retained payload / 原始字节上跑
 * 一次 pattern 匹配 + field 提取，把命中区间高亮 + 解析后字段表展示给 admin。
 *
 * 真正的运行时解析在 02-server PollingService（见 K32-api / preset response_schema），
 * 本端是"二次解析"用于诊断展示，不影响命令路径。
 */
import type { components } from '@/api/gen/schema.gen';

export type ResponseSchema = components['schemas']['ResponseSchema'];
export type ResponseField = components['schemas']['ResponseField'];

export interface ParseHit {
  /** 命中区间（在 source 字符串里的起止 index）。bytes pattern 用 hex 串 index。 */
  start: number;
  end: number;
}

export interface ParsedField {
  name: string;
  /** 引用表达式（原始 from） */
  from: string;
  raw: string;
  value: unknown;
  /** 该 field 在 source 里的命中范围（regex 子组对应位置；bytes/exact 取整段） */
  hit?: ParseHit;
  error?: string;
}

export interface ParseResult {
  ok: boolean;
  patternKind: 'exact' | 'regex' | 'bytes';
  pattern: string;
  source: string;
  hit: ParseHit | null;
  fields: ParsedField[];
  /** 整体未命中时给出原因 */
  error?: string;
}

/**
 * 从 retained payload 取最适合喂给 ResponseSchema parser 的字符串：
 *   - K32 这种 ASCII 串口设备：retained.fields.channels 经常是结构化解析后的值；
 *     真正的"原始响应"通常没保留。这里用 fields.raw / fields.last_response 等约定字段，
 *     缺失时 fallback 到 fields 整体 JSON 字符串。
 *   - 闪优：getdevicedata 返回 JSON，retained.fields 即解析后字段；可直接对 JSON.stringify 跑 regex。
 */
export function pickSourceFromRetained(retained: Record<string, unknown> | null | undefined): string {
  const fields = (retained?.fields ?? null) as Record<string, unknown> | null;
  if (!fields) return '';
  const candidates = ['raw', 'last_response', 'response', 'body'];
  for (const k of candidates) {
    const v = fields[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  // K32 常见：fields.channels 是已解析的 32 位 A/B 串
  if (typeof fields.channels === 'string') {
    return `K32Buf=${fields.channels}.`;
  }
  return JSON.stringify(fields);
}

/** 主入口：跑 ResponseSchema 对 source。 */
export function parseWithSchema(schema: ResponseSchema, source: string): ParseResult {
  if (!source) {
    return {
      ok: false,
      patternKind: schema.pattern_kind,
      pattern: schema.pattern,
      source: '',
      hit: null,
      fields: [],
      error: '没有可解析的响应（retained payload 中未携带原始字节）',
    };
  }
  switch (schema.pattern_kind) {
    case 'regex':
      return parseRegex(schema, source);
    case 'exact':
      return parseExact(schema, source);
    case 'bytes':
      return parseBytes(schema, source);
    default:
      return {
        ok: false,
        patternKind: schema.pattern_kind,
        pattern: schema.pattern,
        source,
        hit: null,
        fields: [],
        error: `unsupported pattern_kind=${schema.pattern_kind}`,
      };
  }
}

function parseRegex(schema: ResponseSchema, source: string): ParseResult {
  let re: RegExp;
  try {
    re = new RegExp(schema.pattern);
  } catch (err) {
    return {
      ok: false,
      patternKind: 'regex',
      pattern: schema.pattern,
      source,
      hit: null,
      fields: [],
      error: `regex 编译失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const m = re.exec(source);
  if (!m) {
    return {
      ok: false,
      patternKind: 'regex',
      pattern: schema.pattern,
      source,
      hit: null,
      fields: [],
      error: '未匹配',
    };
  }
  const hit: ParseHit = { start: m.index, end: m.index + m[0].length };
  const fields = (schema.fields ?? []).map((f): ParsedField => extractRegexField(f, m, source));
  return {
    ok: fields.every((f) => !f.error),
    patternKind: 'regex',
    pattern: schema.pattern,
    source,
    hit,
    fields,
  };
}

function extractRegexField(f: ResponseField, m: RegExpExecArray, source: string): ParsedField {
  const ref = f.from?.trim() ?? '';
  // 支持 $1 / $2 子组 + ${name} 命名子组
  let raw: string | undefined;
  let groupHit: ParseHit | undefined;
  const dollarMatch = /^\$(\d+)$/.exec(ref);
  const namedMatch = /^\$\{([A-Za-z_][\w]*)\}$/.exec(ref);
  if (dollarMatch) {
    const idx = parseInt(dollarMatch[1], 10);
    raw = m[idx];
    if (raw != null) {
      const start = source.indexOf(raw, m.index);
      if (start >= 0) groupHit = { start, end: start + raw.length };
    }
  } else if (namedMatch) {
    raw = m.groups?.[namedMatch[1]];
    if (raw != null) {
      const start = source.indexOf(raw, m.index);
      if (start >= 0) groupHit = { start, end: start + raw.length };
    }
  } else {
    return { name: f.name, from: f.from, raw: '', value: f.default, error: `from=${f.from} 当前 UI 仅支持 $N / \${name}` };
  }
  if (raw == null) {
    return { name: f.name, from: f.from, raw: '', value: f.default, error: '子组未捕获' };
  }
  return {
    name: f.name,
    from: f.from,
    raw,
    value: castFieldValue(raw, f),
    hit: groupHit,
  };
}

function parseExact(schema: ResponseSchema, source: string): ParseResult {
  const idx = source.indexOf(schema.pattern);
  if (idx < 0) {
    return {
      ok: false,
      patternKind: 'exact',
      pattern: schema.pattern,
      source,
      hit: null,
      fields: [],
      error: '未匹配',
    };
  }
  const hit: ParseHit = { start: idx, end: idx + schema.pattern.length };
  // exact 模式无 fields（fields 取 default 值兜底，不变 raw）
  const fields = (schema.fields ?? []).map((f): ParsedField => ({
    name: f.name,
    from: f.from,
    raw: schema.pattern,
    value: f.default,
  }));
  return { ok: true, patternKind: 'exact', pattern: schema.pattern, source, hit, fields };
}

function parseBytes(schema: ResponseSchema, source: string): ParseResult {
  // bytes 模式：把 source 转成 hex 字节，然后用 schema.pattern（hex string）做匹配
  const sourceHex = stringToHex(source);
  const cleanedPattern = schema.pattern.replace(/\s+/g, '').toUpperCase();
  const idx = sourceHex.indexOf(cleanedPattern);
  if (idx < 0) {
    return {
      ok: false,
      patternKind: 'bytes',
      pattern: schema.pattern,
      source,
      hit: null,
      fields: [],
      error: '未匹配（hex 比较）',
    };
  }
  // 高亮区间换算回字符 index
  const startChar = Math.floor(idx / 2);
  const endChar = startChar + Math.ceil(cleanedPattern.length / 2);
  return {
    ok: true,
    patternKind: 'bytes',
    pattern: cleanedPattern,
    source,
    hit: { start: startChar, end: endChar },
    fields: (schema.fields ?? []).map((f): ParsedField => ({
      name: f.name,
      from: f.from,
      raw: '',
      value: f.default,
      error: 'bytes 模式 field 提取需 byte offset 解析（当前 UI 仅展示命中区段）',
    })),
  };
}

function stringToHex(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += s.charCodeAt(i).toString(16).padStart(2, '0').toUpperCase();
  }
  return out;
}

function castFieldValue(raw: string, f: ResponseField): unknown {
  switch (f.type) {
    case 'int': {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : f.default;
    }
    case 'float': {
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : f.default;
    }
    case 'bool':
      return raw === 'true' || raw === '1';
    case 'enum': {
      const map = (f.map ?? {}) as Record<string, unknown>;
      return Object.prototype.hasOwnProperty.call(map, raw) ? map[raw] : f.default ?? raw;
    }
    case 'string':
    default:
      return raw;
  }
}
