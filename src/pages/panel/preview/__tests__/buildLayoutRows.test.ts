/**
 * 中控面板布局契约 —— 双端 golden test (admin 端)
 *
 * 黄金用例 yaml：01-docs/04-ui/panel-layout-spec.yaml
 * 镜像测试：05-control-app/test/panel_layout_rows_test.dart
 *
 * 任一用例失败说明 admin 端 buildLayoutRows 与契约漂移，需先对齐契约再 commit。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { buildLayoutRows } from '../buildLayoutRows';

interface SpecCard {
  id: number;
  card_type: string;
  binding?: unknown;
}
interface SpecRow {
  type: 'full' | 'media-device' | 'script-ai' | 'toggle-group';
  cards: number[];
}
interface SpecCase {
  name: string;
  cards: SpecCard[];
  expected_rows: SpecRow[];
}
interface Spec {
  version: number;
  cases: SpecCase[];
}

const SPEC_PATH = path.resolve(
  __dirname,
  '../../../../../../01-docs/04-ui/panel-layout-spec.yaml',
);
const spec = yaml.load(readFileSync(SPEC_PATH, 'utf8')) as Spec;

describe('buildLayoutRows · 黄金用例（panel-layout-spec.yaml）', () => {
  it('spec 文件已加载且有用例', () => {
    expect(spec.version).toBe(1);
    expect(spec.cases.length).toBeGreaterThan(0);
  });

  for (const c of spec.cases) {
    it(c.name, () => {
      const rows = buildLayoutRows(c.cards);
      const actual = rows.map((r) => ({
        type: r.type,
        cards: r.cards.map((card) => (card as SpecCard).id),
      }));
      expect(actual).toEqual(c.expected_rows);
    });
  }
});
