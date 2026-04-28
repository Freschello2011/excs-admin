/**
 * 中控面板布局决策 —— 双端契约实现（admin 端）。
 *
 * 权威文档：01-docs/04-ui/panel-layout-spec.md
 * 黄金用例 yaml：01-docs/04-ui/panel-layout-spec.yaml
 * 双端镜像：05-control-app/lib/screens/control/sections/panel_layout_rows.dart
 *
 * 提纯为顶层纯函数后由 PreviewSection.tsx 与 vitest 共用。
 * 改决策分支必须同步改 dart 端 + 更新 .md/.yaml + 通过 pre-commit hook。
 */

export interface PanelCardLike {
  card_type: string;
}

export interface LayoutRow<T extends PanelCardLike = PanelCardLike> {
  type: 'full' | 'media-device' | 'script-ai' | 'toggle-group';
  cards: T[];
}

export function buildLayoutRows<T extends PanelCardLike>(cards: T[]): LayoutRow<T>[] {
  const rows: LayoutRow<T>[] = [];
  let i = 0;

  while (i < cards.length) {
    const card = cards[i];

    switch (card.card_type) {
      case 'scene_group':
      case 'device_command':
      case 'device_status':
      case 'smarthome_status':
        rows.push({ type: 'full', cards: [card] });
        i++;
        break;

      case 'media':
      case 'show': {
        // panel-redesign 2026-04-27：只拉紧跟其后第一张 device_toggle / device_command。
        const group: T[] = [card];
        let j = i + 1;
        if (
          j < cards.length &&
          (cards[j].card_type === 'device_toggle' ||
            cards[j].card_type === 'device_command')
        ) {
          group.push(cards[j]);
          j++;
        }
        rows.push({ type: group.length > 1 ? 'media-device' : 'full', cards: group });
        i = j;
        break;
      }

      case 'script': {
        const group: T[] = [card];
        let j = i + 1;
        if (j < cards.length && cards[j].card_type === 'ai') {
          group.push(cards[j]);
          j++;
        }
        rows.push({ type: group.length > 1 ? 'script-ai' : 'full', cards: group });
        i = j;
        break;
      }

      case 'device_toggle': {
        const group: T[] = [card];
        let j = i + 1;
        while (j < cards.length && cards[j].card_type === 'device_toggle') {
          group.push(cards[j]);
          j++;
        }
        rows.push({ type: 'toggle-group', cards: group });
        i = j;
        break;
      }

      case 'ai':
      case 'slider':
      default:
        rows.push({ type: 'full', cards: [card] });
        i++;
        break;
    }
  }

  return rows;
}
