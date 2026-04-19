/* ==================== AI Avatar Types ==================== */

export type AiAvatarStatus = 'idle' | 'thinking' | 'talking' | 'off';

/** Tag search config (stored in ai_avatars.tag_search_config JSON) */
export interface TagSearchConfig {
  segment_duration_ms: number;
  transition_type: 'cut' | 'fade';
  search_scope: 'exhibit' | 'hall';
  max_segments: number;
  min_confidence: number;
}

/** Conversation config (stored in ai_avatars.conversation_config JSON) */
export interface ConversationConfig {
  temperature: number;
  max_tokens: number;
}

/** AI tool names (includes v1.1 whiteboard split tools) */
export type AiToolName =
  | 'switch_scene'
  | 'control_exhibit'
  | 'play_by_tag' // legacy, kept for reading old data (server auto-expands)
  | 'search_by_tag'
  | 'play_media'
  | 'media_control'
  | 'trigger_show'
  | 'control_device';

/** Whiteboard rect (v1.3) — percent-of-video-frame coordinates */
export interface WhiteboardRect {
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
}

/** Layout config (v1.3 — whiteboard_rect + whiteboard_padding; legacy fields kept for back-compat) */
export interface LayoutConfig {
  whiteboard_rect?: WhiteboardRect | null;
  whiteboard_padding: number;
  // deprecated (server still accepts for old data)
  avatar_side?: 'left' | 'right';
  avatar_width_percent?: number;
  background_color?: string;
  background_gradient_end?: string;
  background_image_url?: string;
}

/** Hotword extensions — grouped by action, value is list of synonyms */
export type HotwordExtensions = Record<string, string[]>;

/** AI avatar config (GET /api/v1/ai/avatars/:exhibitId) */
export interface AiAvatarDetail {
  exhibit_id: number;
  exhibit_name: string;
  exhibit_display_mode?: 'normal' | 'simple_fusion' | 'touch_interactive';
  // Legacy fields (kept for backward compat)
  idle_content_id: number | null;
  idle_content_name: string | null;
  thinking_content_id: number | null;
  thinking_content_name: string | null;
  talking_content_id: number | null;
  talking_content_name: string | null;
  // New template-based fields
  template_id: number | null;
  template_name: string | null;
  template_status: TemplateStatus | null;
  idle_sprite_sheets: SpriteSheet[] | null;
  thinking_sprite_sheets: SpriteSheet[] | null;
  talking_sprite_sheets: SpriteSheet[] | null;
  // Knowledge
  persona_text: string;
  knowledge_text: string;
  // Agent
  greeting_message: string;
  tools_enabled: AiToolName[];
  guardrails_text: string;
  tag_search_config: TagSearchConfig | null;
  conversation_config: ConversationConfig | null;
  // Whiteboard v1.1 layout / media / hotword
  layout_config_effective: LayoutConfig | null;
  layout_config_override: LayoutConfig | null;
  template_default_layout_config: LayoutConfig | null;
  image_display_ms: number;
  image_per_slide_ms: number;
  hotword_enabled: boolean;
  hotword_extensions?: HotwordExtensions;
  // Common
  visitor_input_enabled: boolean;
  config: AiAvatarConfig;
  status: AiAvatarStatus;
  updated_at: string;
}

export interface AiAvatarConfig {
  voice_id?: string;
  speech_rate?: number;
}

/** Update AI avatar body (PUT /api/v1/ai/avatars/:exhibitId) */
export interface AiAvatarBody {
  template_id?: number | null;
  persona_text?: string;
  knowledge_text?: string;
  greeting_message?: string;
  tools_enabled?: AiToolName[];
  guardrails_text?: string;
  tag_search_config?: TagSearchConfig;
  conversation_config?: ConversationConfig;
  visitor_input_enabled?: boolean;
  config?: AiAvatarConfig;
  // Whiteboard v1.1 — exhibit-level override + media params + hotword
  // null means "inherit from template default"
  layout_config?: LayoutConfig | null;
  image_display_ms?: number;
  image_per_slide_ms?: number;
  hotword_enabled?: boolean;
  hotword_extensions?: HotwordExtensions;
}

/** AI avatar list item (for table display) */
export interface AiAvatarListItem {
  exhibit_id: number;
  exhibit_name: string;
  hall_id: number;
  hall_name: string;
  has_ai_avatar: boolean;
  status: AiAvatarStatus;
}

/* ==================== AI Avatar Template Types ==================== */

export type TemplateStatus = 'uploading' | 'processing' | 'ready' | 'error';

export type VideoType = 'idle' | 'thinking' | 'talking';

/** Sprite sheet metadata (matches backend JSON) */
export interface SpriteSheet {
  sheet_index: number;
  file: string;
  frame_width: number;
  frame_height: number;
  cols: number;
  rows: number;
  frame_count: number;
  frame_interval_ms: number;
}

/** Template list item (GET /api/v1/ai/avatar-templates) */
export interface TemplateListItem {
  id: number;
  name: string;
  description: string;
  thumbnail_url: string;
  status: TemplateStatus;
  reference_count: number;
  created_at: string;
}

/** Template detail (GET /api/v1/ai/avatar-templates/:id) */
export interface AiAvatarTemplate {
  id: number;
  name: string;
  description: string;
  thumbnail_url: string;
  idle_video_url: string;
  thinking_video_url: string;
  talking_video_url: string;
  idle_sprite_sheets: SpriteSheet[];
  thinking_sprite_sheets: SpriteSheet[];
  talking_sprite_sheets: SpriteSheet[];
  status: TemplateStatus;
  reference_count: number;
  /** Default whiteboard layout — inherited by exhibits that don't override */
  default_layout_config?: LayoutConfig | null;
  created_at: string;
  updated_at: string;
}

/** Create template request body */
export interface CreateTemplateRequest {
  name: string;
  description?: string;
  default_layout_config?: LayoutConfig | null;
}

/** Update template request body */
export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  default_layout_config?: LayoutConfig | null;
}

/** Upload URL request */
export interface TemplateUploadUrlRequest {
  type: VideoType;
  filename: string;
  file_size: number;
  content_type: string;
}

/** Upload URL response */
export interface TemplateUploadUrlResult {
  presigned_url: string;
  object_key: string;
}

/** Upload complete request */
export interface TemplateUploadCompleteRequest {
  type: VideoType;
}

/** Upload complete response */
export interface TemplateUploadCompleteResult {
  status: TemplateStatus;
}

/* ==================== Voice Types ==================== */

/** Voice item (GET /api/v1/ai/voices) */
export interface VoiceItem {
  voice_id: string;
  name: string;
  gender: 'male' | 'female';
  style: string;
  language: string;
  sample_text?: string;
}

/** TTS synthesize request */
export interface TtsSynthesizeRequest {
  text: string;
  voice_id: string;
  speech_rate: number;
}

/** TTS synthesize response */
export interface TtsSynthesizeResult {
  audio_url: string;
  duration_ms: number;
}

/* ==================== Test Chat / SSE Types ==================== */

/** SSE event from POST /api/v1/ai/avatars/:exhibitId/test-chat */
export type TestChatEvent =
  | { type: 'thinking' }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown>; result: unknown; dry_run: boolean }
  | { type: 'done'; full_text: string };

/** Matched tag from play_by_tag tool_call result */
export interface MatchedTag {
  tag: string;
  dimension: string;
  confidence: number;
  count: number;
}

/** Playlist item from play_by_tag result */
export interface PlaylistItem {
  content_id: number;
  content_name: string;
  start_ms: number;
  end_ms: number;
  tag: string;
  sprite_frame?: {
    sheet_url: string;
    frame_index: number;
  };
}

/** play_by_tag tool result structure */
export interface PlayByTagResult {
  matched_tags: MatchedTag[];
  playlist: PlaylistItem[];
}

/** Test tag search request */
export interface TestTagSearchRequest {
  keyword: string;
  tag_search_config?: Partial<TagSearchConfig>;
}

/** Test tag search response */
export interface TestTagSearchResult {
  keyword: string;
  matched_tags: Array<{
    content_id: number;
    content_name: string;
    tag: string;
    dimension: string;
    confidence: number;
    start_ms: number;
    end_ms: number;
  }>;
  playlist: PlaylistItem[];
}

/* ==================== Knowledge File Types ==================== */

export type KnowledgeFileStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

/** Knowledge file list item */
export interface KnowledgeFile {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  status: KnowledgeFileStatus;
  error_message?: string;
  created_at: string;
}

/** Knowledge file upload URL request */
export interface KnowledgeUploadUrlRequest {
  hall_id: number;
  exhibit_id?: number;
  filename: string;
  file_size: number;
  content_type: string;
}

/** Knowledge file upload URL response */
export interface KnowledgeUploadUrlResult {
  file_id: number;
  presigned_url: string;
  object_key: string;
}

/** Knowledge search request */
export interface KnowledgeSearchRequest {
  exhibit_id: number;
  keyword: string;
}

/** Knowledge search result chunk */
export interface KnowledgeChunk {
  content: string;
  source_info: string;
  relevance: number;
}
