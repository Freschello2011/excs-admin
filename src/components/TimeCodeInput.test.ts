import { describe, it, expect } from 'vitest';
import { parseTimeCode, formatTimeCode } from './TimeCodeInput';

describe('parseTimeCode', () => {
  it('parses pure digits as ms', () => {
    expect(parseTimeCode('0')).toBe(0);
    expect(parseTimeCode('500')).toBe(500);
    expect(parseTimeCode('83500')).toBe(83500);
  });

  it('parses mm:ss with no millis', () => {
    expect(parseTimeCode('00:00')).toBe(0);
    expect(parseTimeCode('01:23')).toBe(83000);
    expect(parseTimeCode('1:23')).toBe(83000);
    expect(parseTimeCode('10:30')).toBe(630000);
  });

  it('parses mm:ss.sss with millis', () => {
    expect(parseTimeCode('01:23.500')).toBe(83500);
    expect(parseTimeCode('00:00.123')).toBe(123);
    expect(parseTimeCode('1:23.5')).toBe(83500);   // .5 → 500ms
    expect(parseTimeCode('1:23.05')).toBe(83050);  // .05 → 050ms
  });

  it('rejects sec >= 60', () => {
    expect(parseTimeCode('00:60')).toBeNull();
    expect(parseTimeCode('1:99')).toBeNull();
  });

  it('parses 1m23s500 etc.', () => {
    expect(parseTimeCode('1m23s500')).toBe(83500);
    expect(parseTimeCode('1m23s')).toBe(83000);
    expect(parseTimeCode('23s')).toBe(23000);
    expect(parseTimeCode('1m')).toBe(60000);
    expect(parseTimeCode('500ms')).toBe(500);
  });

  it('handles whitespace', () => {
    expect(parseTimeCode('  01:23.500  ')).toBe(83500);
    expect(parseTimeCode('')).toBeNull();
    expect(parseTimeCode('   ')).toBeNull();
  });

  it('rejects garbage', () => {
    expect(parseTimeCode('hello')).toBeNull();
    expect(parseTimeCode('1:2:3')).toBeNull();
    expect(parseTimeCode('abc:def')).toBeNull();
  });
});

describe('formatTimeCode', () => {
  it('formats 0 as 00:00.000', () => {
    expect(formatTimeCode(0)).toBe('00:00.000');
  });

  it('formats sub-second values with 3-digit ms', () => {
    expect(formatTimeCode(500)).toBe('00:00.500');
    expect(formatTimeCode(50)).toBe('00:00.050');
    expect(formatTimeCode(5)).toBe('00:00.005');
  });

  it('formats minute / second / ms split', () => {
    expect(formatTimeCode(83500)).toBe('01:23.500');
    expect(formatTimeCode(60000)).toBe('01:00.000');
    expect(formatTimeCode(630000)).toBe('10:30.000');
  });

  it('clamps negatives to 0', () => {
    expect(formatTimeCode(-100)).toBe('00:00.000');
  });

  it('rounds non-integer ms', () => {
    expect(formatTimeCode(83500.4)).toBe('01:23.500');
    expect(formatTimeCode(83500.7)).toBe('01:23.501');
  });

  it('round-trips parse → format', () => {
    expect(formatTimeCode(parseTimeCode('01:23.500')!)).toBe('01:23.500');
    expect(formatTimeCode(parseTimeCode('1m23s500')!)).toBe('01:23.500');
    expect(formatTimeCode(parseTimeCode('83500')!)).toBe('01:23.500');
  });
});
