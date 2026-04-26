/**
 * 中控面板改版 P2 — 编辑 tab 的"前端 buffer"模型。
 *
 * 进入编辑 tab 时调 GET /panel 拿当前生效态作 baseline，
 * 所有"加分区 / 加卡片 / 拖拽 / 改卡片"操作只改这里的 useReducer state，不发请求。
 * 「保存」→ 序列化为 PanelSnapshot → POST /panel/versions（draft）。
 * 「发布」→ 选定版本（默认刚保存的）→ POST /panel/versions/:id/publish。
 *
 * 关键约束：
 *   - buffer 里的 section/card id 是**前端临时自增 id**（< 0 表示尚未持久化）。
 *     发布后整体替换 sections/cards 表，旧 id 体系作废，因此 id 在 buffer 里只用于本地 React key /
 *     拖拽锚点，不会被服务端读到。
 *   - section.section_type / card.card_type / binding / config 直接落 PanelSnapshot。
 *   - dirty = JSON.stringify(buffer.sections) !== baselineSnapshotString。
 */

import type {
  PanelSection,
  PanelCard,
  PanelSectionType,
  PanelCardType,
  PanelSectionSnapshot,
  PanelCardSnapshot,
  PanelSnapshot,
  PanelDTO,
} from '@/api/gen/client';

export interface BufferCard {
  /** 本地 id（自增，< 0 = 新建未持久化；> 0 = 来自 baseline 但 buffer 内仍只作 React key） */
  id: number;
  card_type: PanelCardType;
  binding?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
  sort_order: number;
}

export interface BufferSection {
  id: number;
  section_type: PanelSectionType;
  exhibit_id?: number;
  name: string;
  sort_order: number;
  cards: BufferCard[];
}

export interface PanelBuffer {
  sections: BufferSection[];
  /** 单调递增（负数）的 id 分配器 */
  nextLocalId: number;
}

export const EMPTY_BUFFER: PanelBuffer = { sections: [], nextLocalId: -1 };

/* ==================== 转换 ==================== */

/** PanelDTO（来自 GET /panel）→ buffer */
export function bufferFromPanel(panel: PanelDTO | null | undefined): PanelBuffer {
  if (!panel || !panel.sections) return EMPTY_BUFFER;
  const sections: BufferSection[] = panel.sections.map((s: PanelSection) => ({
    id: s.id,
    section_type: s.section_type as PanelSectionType,
    exhibit_id: s.exhibit_id ?? undefined,
    name: s.name,
    sort_order: s.sort_order,
    cards: (s.cards ?? []).map((c: PanelCard) => ({
      id: c.id,
      card_type: c.card_type as PanelCardType,
      binding: c.binding ?? null,
      config: c.config ?? null,
      sort_order: c.sort_order,
    })),
  }));
  return { sections, nextLocalId: -1 };
}

/** 同一个 PanelDTO → snapshot 字符串（用于 dirty 比较）。 */
export function snapshotKey(buffer: PanelBuffer): string {
  // 只拿语义字段，不带 buffer 的 nextLocalId / id
  return JSON.stringify(
    buffer.sections.map((s) => ({
      section_type: s.section_type,
      exhibit_id: s.exhibit_id ?? null,
      name: s.name,
      sort_order: s.sort_order,
      cards: s.cards.map((c) => ({
        card_type: c.card_type,
        binding: c.binding ?? null,
        config: c.config ?? null,
        sort_order: c.sort_order,
      })),
    })),
  );
}

/** buffer → PanelSnapshot（POST /panel/versions 的 snapshot_json） */
export function bufferToSnapshot(buffer: PanelBuffer): PanelSnapshot {
  // 重排 sort_order 保证连续递增（防御）
  const sections: PanelSectionSnapshot[] = [...buffer.sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s, sIdx) => {
      const cards: PanelCardSnapshot[] = [...s.cards]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c, cIdx) => ({
          card_type: c.card_type,
          binding: c.binding ?? undefined,
          config: c.config ?? undefined,
          sort_order: cIdx + 1,
        }));
      return {
        section_type: s.section_type,
        exhibit_id: s.exhibit_id ?? undefined,
        name: s.name,
        sort_order: sIdx + 1,
        cards,
      };
    });
  return { sections };
}

/** 从历史 PanelVersionDetailDTO.snapshot_json 反序列化到 buffer（用于"查看版本"模式） */
export function bufferFromSnapshot(snapshot: PanelSnapshot | unknown): PanelBuffer {
  const s = (snapshot as PanelSnapshot | null) ?? null;
  if (!s || !s.sections) return EMPTY_BUFFER;
  let nextLocalId = -1;
  const sections: BufferSection[] = s.sections.map((sec: PanelSectionSnapshot, sIdx: number) => {
    const sId = nextLocalId--;
    return {
      id: sId,
      section_type: (sec.section_type as PanelSectionType) ?? 'global',
      exhibit_id: sec.exhibit_id ?? undefined,
      name: sec.name,
      sort_order: sec.sort_order ?? sIdx + 1,
      cards: (sec.cards ?? []).map((c: PanelCardSnapshot, cIdx: number) => ({
        id: nextLocalId--,
        card_type: (c.card_type as PanelCardType) ?? 'scene_group',
        binding: (c.binding as Record<string, unknown> | undefined) ?? null,
        config: (c.config as Record<string, unknown> | undefined) ?? null,
        sort_order: c.sort_order ?? cIdx + 1,
      })),
    };
  });
  return { sections, nextLocalId };
}

/* ==================== Mutation helpers ==================== */

export function allocateId(b: PanelBuffer): { id: number; next: PanelBuffer } {
  const id = b.nextLocalId;
  return { id, next: { ...b, nextLocalId: b.nextLocalId - 1 } };
}

export function addSection(
  b: PanelBuffer,
  payload: { section_type: PanelSectionType; name: string; exhibit_id?: number; sort_order?: number },
): PanelBuffer {
  const { id, next } = allocateId(b);
  const sortOrder = payload.sort_order ?? b.sections.length + 1;
  const sec: BufferSection = {
    id,
    section_type: payload.section_type,
    exhibit_id: payload.exhibit_id,
    name: payload.name,
    sort_order: sortOrder,
    cards: [],
  };
  return { ...next, sections: [...next.sections, sec] };
}

export function updateSection(
  b: PanelBuffer,
  sectionId: number,
  patch: Partial<Pick<BufferSection, 'name' | 'sort_order'>>,
): PanelBuffer {
  return {
    ...b,
    sections: b.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
  };
}

export function deleteSection(b: PanelBuffer, sectionId: number): PanelBuffer {
  return { ...b, sections: b.sections.filter((s) => s.id !== sectionId) };
}

export function reorderSections(b: PanelBuffer, orderedIds: number[]): PanelBuffer {
  const map = new Map(b.sections.map((s) => [s.id, s] as const));
  const reordered: BufferSection[] = [];
  orderedIds.forEach((id, idx) => {
    const s = map.get(id);
    if (s) reordered.push({ ...s, sort_order: idx + 1 });
  });
  // 合入未列出的 sections（防御）
  for (const s of b.sections) if (!orderedIds.includes(s.id)) reordered.push(s);
  return { ...b, sections: reordered };
}

export function addCard(
  b: PanelBuffer,
  sectionId: number,
  card: { card_type: PanelCardType; binding?: Record<string, unknown> | null; config?: Record<string, unknown> | null },
): PanelBuffer {
  const { id, next } = allocateId(b);
  return {
    ...next,
    sections: next.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const sortOrder = s.cards.length + 1;
      return {
        ...s,
        cards: [
          ...s.cards,
          {
            id,
            card_type: card.card_type,
            binding: card.binding ?? null,
            config: card.config ?? null,
            sort_order: sortOrder,
          },
        ],
      };
    }),
  };
}

export function updateCard(
  b: PanelBuffer,
  cardId: number,
  patch: Partial<Pick<BufferCard, 'card_type' | 'binding' | 'config'>>,
): PanelBuffer {
  return {
    ...b,
    sections: b.sections.map((s) => ({
      ...s,
      cards: s.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
    })),
  };
}

export function deleteCard(b: PanelBuffer, cardId: number): PanelBuffer {
  return {
    ...b,
    sections: b.sections.map((s) => ({
      ...s,
      cards: s.cards.filter((c) => c.id !== cardId),
    })),
  };
}

export function reorderCards(
  b: PanelBuffer,
  sectionId: number,
  orderedIds: number[],
): PanelBuffer {
  return {
    ...b,
    sections: b.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const map = new Map(s.cards.map((c) => [c.id, c] as const));
      const reordered: BufferCard[] = [];
      orderedIds.forEach((id, idx) => {
        const c = map.get(id);
        if (c) reordered.push({ ...c, sort_order: idx + 1 });
      });
      for (const c of s.cards) if (!orderedIds.includes(c.id)) reordered.push(c);
      return { ...s, cards: reordered };
    }),
  };
}

/** PanelDTO 形态的 sections 数组（用于把 buffer 喂给只接 PanelDTO 的 PreviewPanel） */
export function bufferToPreviewSections(b: PanelBuffer): PanelSection[] {
  return b.sections.map(
    (s) =>
      ({
        id: s.id,
        panel_id: 0,
        section_type: s.section_type,
        exhibit_id: s.exhibit_id,
        name: s.name,
        sort_order: s.sort_order,
        cards: s.cards.map(
          (c) =>
            ({
              id: c.id,
              section_id: s.id,
              card_type: c.card_type,
              binding: c.binding ?? undefined,
              config: c.config ?? undefined,
              sort_order: c.sort_order,
            }) as unknown as PanelCard,
        ),
      }) as unknown as PanelSection,
  );
}
