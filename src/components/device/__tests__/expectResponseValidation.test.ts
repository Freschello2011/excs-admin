/**
 * ADR-0030 §D3 — admin 端 expect_response 校验单测。
 * 与 server validateInlineCommands 的 mode=match→match_pattern 必填 / mode=echo→不允许 match_pattern 等
 * 规则双向对齐；在 admin 编辑保存前提前拦截，避免 server 422 才返回。
 */
import { describe, it, expect } from 'vitest';
import {
  validateExpectResponseCell,
  validateInlineCommands,
  type InlineCommandRow,
} from '../InlineCommandsTable';

describe('validateExpectResponseCell', () => {
  it('null / 缺 mode → 不报错（server applyInlineCommandsDefaults 兜底 mode=none）', () => {
    expect(validateExpectResponseCell(null)).toBeNull();
    expect(validateExpectResponseCell({ mode: '' as never })).toBeNull();
  });

  it('mode=none → ok', () => {
    expect(validateExpectResponseCell({ mode: 'none' })).toBeNull();
  });

  it('mode=any → ok', () => {
    expect(validateExpectResponseCell({ mode: 'any' })).toBeNull();
  });

  it('mode=match + 空 match_pattern → 报错"必须填一段期望文字"', () => {
    const err = validateExpectResponseCell({ mode: 'match' });
    expect(err).toMatch(/必须填一段期望文字/);
  });

  it('mode=match + 合法正则 → ok', () => {
    expect(validateExpectResponseCell({ mode: 'match', match_pattern: '^OK' })).toBeNull();
    expect(validateExpectResponseCell({ mode: 'match', match_pattern: 'POWR\\=1' })).toBeNull();
  });

  it('mode=match + 非法正则 → 报错"正则不合法"', () => {
    const err = validateExpectResponseCell({ mode: 'match', match_pattern: '[invalid' });
    expect(err).toMatch(/正则不合法/);
  });

  it('mode=echo + 留 match_pattern → 报错语义冲突', () => {
    const err = validateExpectResponseCell({ mode: 'echo', match_pattern: 'X' });
    expect(err).toMatch(/语义冲突/);
  });

  it('mode=echo + 不带 match_pattern → ok', () => {
    expect(validateExpectResponseCell({ mode: 'echo' })).toBeNull();
  });
});

describe('validateInlineCommands — expect_response 集成', () => {
  const baseRow: InlineCommandRow = {
    code: 'cmd1',
    name: '开始',
    kind: 'control',
    request: 'start',
    request_format: 'text',
    _row: 'r0',
  };

  it('单行 mode=match 缺 pattern → 收到 expect_response 字段错误', () => {
    const issues = validateInlineCommands([
      { ...baseRow, expect_response: { mode: 'match' } },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe('expect_response');
    expect(issues[0].message).toMatch(/必须填一段期望文字/);
  });

  it('多行多种问题 → 各行错误独立汇总', () => {
    const issues = validateInlineCommands([
      { ...baseRow, _row: 'a', expect_response: { mode: 'match' } },
      { ...baseRow, code: 'cmd2', _row: 'b', expect_response: { mode: 'echo', match_pattern: 'X' } },
      { ...baseRow, code: 'cmd3', _row: 'c', expect_response: { mode: 'none' } },
    ]);
    expect(issues).toHaveLength(2);
    expect(issues.find((i) => i.rowKey === 'a')?.field).toBe('expect_response');
    expect(issues.find((i) => i.rowKey === 'b')?.field).toBe('expect_response');
  });

  it('老命令缺 expect_response（rest 路径）→ 不阻断保存（server 端兜底 mode=none）', () => {
    const issues = validateInlineCommands([{ ...baseRow }]);
    expect(issues).toHaveLength(0);
  });
});
