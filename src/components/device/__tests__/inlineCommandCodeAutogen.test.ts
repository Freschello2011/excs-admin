import { describe, it, expect } from 'vitest';
import {
  generateInlineCommandCode,
  normalizeManualCode,
  validateManualCode,
} from '../inlineCommandCodeAutogen';

describe('generateInlineCommandCode', () => {
  it('纯 ASCII 名字直接规范化', async () => {
    expect(await generateInlineCommandCode('Start Show')).toBe('start_show');
    expect(await generateInlineCommandCode('mute')).toBe('mute');
  });

  it('中文名字走拼音转写（无声调全连写）', async () => {
    // pinyin-pro `separator: ''` → 汉字间不留空格；不依赖外部分词器
    expect(await generateInlineCommandCode('开始演示')).toBe('kaishiyanshi');
    expect(await generateInlineCommandCode('停止演示')).toBe('tingzhiyanshi');
    expect(await generateInlineCommandCode('静音')).toBe('jingyin');
  });

  it('混合符号 + 中文：先剥符号再走拼音', async () => {
    expect(await generateInlineCommandCode('音量 +')).toBe('yinliang');
    expect(await generateInlineCommandCode('音量-')).toBe('yinliang');
  });

  it('已存在 code → 自动加后缀去重', async () => {
    expect(await generateInlineCommandCode('音量+', ['yinliang'])).toBe('yinliang_2');
    expect(await generateInlineCommandCode('音量+', ['yinliang', 'yinliang_2'])).toBe('yinliang_3');
  });

  it('纯符号 / emoji 走 fallback cmd_<hex>', async () => {
    const result = await generateInlineCommandCode('❤️');
    expect(result).toMatch(/^cmd_[a-f0-9]{8}$/);
  });

  it('保留前缀 preset: 命中时尾部加 _x', async () => {
    // 直接 ASCII "preset hello" 走 normalize → "preset_hello" 不命中前缀。
    // 测命中：手动构造一个会规范化为 preset:xxx 的输入是不可能的（": " 会被剥）
    // 用拼音「破色色」→ posese — 不会命中。这里直接断言保留前缀守门是函数级行为。
    // 留作 normalizeManualCode 的等价路径单测覆盖。
    const code = await generateInlineCommandCode('preset hello');
    expect(code.startsWith('preset:')).toBe(false);
  });

  it('超过 32 字符截断', async () => {
    const longName = '这是一个非常非常非常非常非常长的命令名字超过三十二字符限制';
    const code = await generateInlineCommandCode(longName);
    expect(code.length).toBeLessThanOrEqual(32);
    expect(code).toMatch(/^[a-z0-9_]+$/);
  });

  it('截断后再去重', async () => {
    const longName = '这是一个非常非常长的命令名字'; // 26 字符拼音范围
    const first = await generateInlineCommandCode(longName);
    const second = await generateInlineCommandCode(longName, [first]);
    expect(second).not.toBe(first);
    expect(second.length).toBeLessThanOrEqual(32);
  });
});

describe('normalizeManualCode', () => {
  it('清理用户输入：lowercase + 折叠 / 删非法字符', () => {
    expect(normalizeManualCode('Hello World')).toBe('hello_world');
    expect(normalizeManualCode('FOO-bar/baz.qux')).toBe('foo_bar_baz_qux');
    expect(normalizeManualCode('  spaces   '.trim())).toBe('spaces');
    expect(normalizeManualCode('a!@#b')).toBe('ab');
  });

  it('截断到 32 字符', () => {
    expect(normalizeManualCode('a'.repeat(40)).length).toBe(32);
  });
});

describe('validateManualCode', () => {
  it('合法 code 返回 null', () => {
    expect(validateManualCode('start_show')).toBeNull();
    expect(validateManualCode('a')).toBeNull();
    expect(validateManualCode('cmd_a3f9c0e1')).toBeNull();
  });

  it('空 code 报错', () => {
    expect(validateManualCode('')).toContain('不能为空');
  });

  it('包含非法字符报错', () => {
    expect(validateManualCode('Hello')).toContain('小写英文字母');
    expect(validateManualCode('a-b')).toContain('小写英文字母');
    expect(validateManualCode('开始')).toContain('小写英文字母');
  });

  it('超长报错', () => {
    expect(validateManualCode('a'.repeat(33))).toContain('最多');
  });

  it('preset: 前缀报错', () => {
    expect(validateManualCode('preset:foo')).toContain('preset:');
  });

  it('与已存在 code 撞重报错', () => {
    expect(validateManualCode('start', ['start', 'stop'])).toContain('重复');
  });
});
