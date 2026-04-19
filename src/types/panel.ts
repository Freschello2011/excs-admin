/* ==================== Enums ==================== */

export type SectionType = 'global' | 'exhibit';

export type CardType =
  | 'scene_group'
  | 'media'
  | 'show'
  | 'device_toggle'
  | 'slider'
  | 'device_status'
  | 'script'
  | 'ai';

/* ==================== Card Binding ==================== */

export interface CardBinding {
  type: string;
  id?: number;
  ids?: number[];
}

/* ==================== Card / Section / Panel ==================== */

export interface PanelCard {
  id: number;
  card_type: CardType;
  binding: CardBinding | null;
  sort_order: number;
  config: Record<string, unknown> | null;
}

export interface PanelSection {
  id: number;
  section_type: SectionType;
  exhibit_id: number | null;
  name: string;
  sort_order: number;
  cards: PanelCard[];
}

export interface ControlPanel {
  id: number;
  hall_id: number;
  sections: PanelSection[];
}

/* ==================== Request Bodies ==================== */

export interface GenerateDefaultBody {
  force?: boolean;
}

export interface AddSectionBody {
  section_type: SectionType;
  exhibit_id?: number;
  name: string;
  sort_order?: number;
}

export interface UpdateSectionBody {
  name?: string;
  sort_order?: number;
}

export interface ReorderSectionsBody {
  section_ids: number[];
}

export interface AddCardBody {
  card_type: CardType;
  binding?: CardBinding;
  sort_order?: number;
  config?: Record<string, unknown>;
}

export interface UpdateCardBody {
  card_type?: CardType;
  binding?: CardBinding;
  sort_order?: number;
  config?: Record<string, unknown>;
}

export interface ReorderCardsBody {
  card_ids: number[];
}

/* ==================== Display Helpers ==================== */

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  scene_group: '场景按钮组',
  media: '媒体播控',
  show: '演出控制',
  device_toggle: '设备开关',
  slider: '滑块控制',
  device_status: '设备状态',
  script: '讲解词',
  ai: 'AI 互动',
};

export const CARD_TYPE_ICONS: Record<CardType, string> = {
  scene_group: 'scene',
  media: 'play_circle',
  show: 'movie',
  device_toggle: 'toggle_on',
  slider: 'tune',
  device_status: 'sensors',
  script: 'description',
  ai: 'smart_toy',
};

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  global: '全局',
  exhibit: '展项',
};

export const ALL_CARD_TYPES: CardType[] = [
  'scene_group',
  'media',
  'show',
  'device_toggle',
  'slider',
  'device_status',
  'script',
  'ai',
];
