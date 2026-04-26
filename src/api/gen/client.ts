/**
 * Phase 1：openapi-typescript 生成的 schema 类型（schema.gen.ts）的 typed wrapper。
 *
 * 设计原则：
 *   - **HTTP 仍走 axios `request.ts`**——axios 拦截器（1002 token 续期 / 403 permission_denied
 *     文案 / SSO 跳转）是 ExCS 的运行时刚需；openapi-fetch 自身的 fetch 会绕过这些。
 *   - **类型从 yaml 单源派生**——改 yaml 字段后下面的 isXxx() / extractYyy() helper 触发
 *     TS 编译失败（破坏测试锚点；steps §2 P0.7）。
 *   - **每个 endpoint 一个 typed 函数**——剥 envelope，返回 .data；调用方写
 *     `await getAuthMe()`，拿到 LoginUserGen，IDE 全自动补全。
 *
 * 范围：auth context 14 个端点全量。其他 context 按 phase 渐进迁移。
 */
import type { components, operations, paths } from './schema.gen';
import request from '../request';

/**
 * 把可选 reason 合并进请求 body（authz Phase 11.6 RequireReason middleware 校验 ≥5 字）。
 *
 * 历史教训：reason 走 X-Action-Reason header 在中文场景会被浏览器 XHR 拦下
 * （`String contains non ISO-8859-1 code point`）。HTTP/1.1 header 默认只允许
 * ISO-8859-1，浏览器严格拦中文。改走 body —— 后端 `extractReason` middleware
 * 同时支持 header / query / form / body JSON，零服务器改动。
 *
 * 用法：
 *   request.post(url, mergeReasonBody(body, reason))   // body 已有 → 合并
 *   request.post(url, mergeReasonBody(undefined, reason))  // body 空 → {reason}
 */
function mergeReasonBody<T extends Record<string, unknown> | undefined>(
  body: T,
  reason?: string,
): (T & { reason?: string }) | { reason: string } | T {
  if (!reason) return body;
  if (body === undefined) return { reason };
  return { ...(body as Record<string, unknown>), reason } as T & { reason: string };
}

/* ============================================================
 * Schema 类型 re-export（前端业务层从这里 import，不再走 src/types/auth.ts）
 * ============================================================ */

export type LoginUser = components['schemas']['LoginUser'];
export type HallPermission = components['schemas']['HallPermission'];
export type MqttInfo = components['schemas']['MqttInfo'];
export type LoginResponse = components['schemas']['LoginResponse'];
export type RefreshTokenResponse = components['schemas']['RefreshTokenResponse'];
export type ChangePasswordResult = components['schemas']['ChangePasswordResult'];
export type UserListItem = components['schemas']['UserListItem'];
/** UserDetail 在 yaml 里 $ref 到 LoginUser；TS 端直接用 LoginUser 即可。 */
export type UserDetail = components['schemas']['LoginUser'];
export type SyncMDMResult = components['schemas']['SyncMDMResult'];
export type SSOSearchUser = components['schemas']['SSOSearchUser'];
export type ImportSSOUserRequest = components['schemas']['ImportSSOUserRequest'];
export type AssignRoleRequest = components['schemas']['AssignRoleRequest'];
export type SetHallPermissionsRequest = components['schemas']['SetHallPermissionsRequest'];
export type PatchUserStatusRequest = components['schemas']['PatchUserStatusRequest'];
export type DeleteUserRequest = components['schemas']['DeleteUserRequest'];
export type ChangePasswordRequest = components['schemas']['ChangePasswordRequest'];
export type LoginRequest = components['schemas']['LoginRequest'];

/** 兼容历史命名：MeResponse = LoginUser（业务层有些地方用了 MeResponse 名称）。 */
export type MeResponse = LoginUser;

/**
 * account_type bearer 子集 —— 给 resolveAccountType / 共享头像组件用。
 *
 * 故意把 user_type 放成 string：UserListItem.user_type 来自旧库可能有 employee/supplier 之外
 * 的历史值（不强校验），LoginUser.user_type 才是 enum。两者都要喂得进 resolveAccountType。
 */
export interface AccountTypeBearer {
  account_type?: LoginUser['account_type'];
  user_type?: string;
}

/* ============================================================
 * 通用响应壳
 * ============================================================ */

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

/** 分页响应壳（与 PaginatedData schema 对齐） */
export interface PageData<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}

/** 把 axios.then(res => res.data.data) 抽成 helper（unwrap envelope） */
async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  const res = await promise;
  return res.data.data;
}

/* ============================================================
 * Auth context typed client（14 个端点）
 * ============================================================ */

/**
 * listUsers 查询参数。yaml 把 role / user_type 留成 string（不强 enum），原因见 paths/auth.yaml；
 * 此处类型与 yaml 对齐，避免 admin 搜索 UI 把任意字符串塞进来时编译失败。
 */
export interface ListUsersParams {
  page?: number;
  page_size?: number;
  keyword?: string;
  role?: string;
  user_type?: string;
}

export interface SearchSsoUsersParams {
  page?: number;
  page_size?: number;
  keyword?: string;
}

export const authClient = {
  /* ---- public ---- */
  login(body: LoginRequest): Promise<LoginResponse> {
    return unwrap(request.post<ApiEnvelope<LoginResponse>>('/api/v1/auth/login', body));
  },
  refreshToken(body: { refresh_token: string }): Promise<RefreshTokenResponse> {
    return unwrap(request.post<ApiEnvelope<RefreshTokenResponse>>('/api/v1/auth/refresh', body));
  },

  /* ---- user ---- */
  getAuthMe(): Promise<LoginUser> {
    return unwrap(request.get<ApiEnvelope<LoginUser>>('/api/v1/auth/me'));
  },
  changePassword(body: ChangePasswordRequest): Promise<ChangePasswordResult> {
    return unwrap(request.post<ApiEnvelope<ChangePasswordResult>>('/api/v1/auth/change-password', body));
  },

  /* ---- admin: users CRUD ---- */
  listUsers(params: ListUsersParams = {}): Promise<PageData<UserListItem>> {
    return unwrap(request.get<ApiEnvelope<PageData<UserListItem>>>('/api/v1/auth/users', { params }));
  },
  getUser(userId: number): Promise<UserDetail> {
    return unwrap(request.get<ApiEnvelope<UserDetail>>(`/api/v1/auth/users/${userId}`));
  },
  /** DEPRECATED Phase 5a — 路由保留至 2026-05-24。 */
  assignRole(userId: number, body: AssignRoleRequest): Promise<void> {
    return unwrap(request.put<ApiEnvelope<void>>(`/api/v1/auth/users/${userId}/role`, body));
  },
  /** DEPRECATED Phase 5a — 路由保留至 2026-05-24。 */
  setHallPermissions(userId: number, body: SetHallPermissionsRequest): Promise<void> {
    return unwrap(request.put<ApiEnvelope<void>>(`/api/v1/auth/users/${userId}/hall-permissions`, body));
  },
  /** DEPRECATED Phase 5a — 路由保留至 2026-05-24。 */
  revokeHallPermissions(userId: number, hallId: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/auth/users/${userId}/hall-permissions/${hallId}`));
  },

  /* ---- admin: v1.1 受保护用户生命周期 ---- */
  patchUserStatus(userId: number, body: PatchUserStatusRequest): Promise<void> {
    return unwrap(request.patch<ApiEnvelope<void>>(`/api/v1/auth/users/${userId}/status`, body));
  },
  deleteUser(userId: number, body: DeleteUserRequest): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/auth/users/${userId}`, { data: body }));
  },

  /* ---- admin: MDM / SSO 同步与导入 ---- */
  syncMdmEmployees(): Promise<SyncMDMResult> {
    return unwrap(request.post<ApiEnvelope<SyncMDMResult>>('/api/v1/auth/users/sync-mdm'));
  },
  searchSsoUsers(params: SearchSsoUsersParams = {}): Promise<PageData<SSOSearchUser>> {
    return unwrap(request.get<ApiEnvelope<PageData<SSOSearchUser>>>('/api/v1/auth/users/search-sso', { params }));
  },
  importSsoUser(body: ImportSSOUserRequest): Promise<UserDetail> {
    return unwrap(request.post<ApiEnvelope<UserDetail>>('/api/v1/auth/users/import-sso', body));
  },
};

/* ============================================================
 * Command context typed client（12 个端点）—— Phase 2-A
 * ============================================================ */

export type SceneAction = components['schemas']['SceneAction'];
export type SceneListItem = components['schemas']['SceneListItem'];
export type SceneDetail = components['schemas']['SceneDetail'];
export type CreateSceneRequest = components['schemas']['CreateSceneRequest'];
export type UpdateSceneRequest = components['schemas']['UpdateSceneRequest'];
export type SwitchSceneResult = components['schemas']['SwitchSceneResult'];
export type DeviceCommandRequest = components['schemas']['DeviceCommandRequest'];
export type ExhibitCommandRequest = components['schemas']['ExhibitCommandRequest'];
export type CommandResult = components['schemas']['CommandResult'];
export type DeviceRealtimeStatusDTO = components['schemas']['DeviceRealtimeStatusDTO'];
export type HallSnapshotDTO = components['schemas']['HallSnapshotDTO'];
export type ExhibitSnapshotDTO = components['schemas']['ExhibitSnapshotDTO'];
export type DeviceSnapshotDTO = components['schemas']['DeviceSnapshotDTO'];
export type SceneSnapshotDTO = components['schemas']['SceneSnapshotDTO'];
export type TouchNavGraph = components['schemas']['TouchNavGraph'];
export type SaveTouchNavRequest = components['schemas']['SaveTouchNavRequest'];
export type NavNode = components['schemas']['NavNode'];
export type HotZone = components['schemas']['HotZone'];
export type HotZoneRegion = components['schemas']['HotZoneRegion'];
/** Transition enum — 兼容老 src/types/command.ts 命名。yaml 已锁 cut|fade。 */
export type NavTransition = HotZone['transition'];

/**
 * 兼容老 SceneBody 别名（src/types/command.ts 删除前页面里大量使用）。
 * 与 CreateSceneRequest 等价；UpdateSceneRequest 在 yaml 里 hall_id 不传，差异由调用方处理。
 */
export type SceneBody = CreateSceneRequest;

export const commandClient = {
  /* ---- 场景 CRUD ---- */
  listScenes(hallId: number): Promise<SceneListItem[]> {
    return unwrap(
      request.get<ApiEnvelope<SceneListItem[]>>('/api/v1/scenes', { params: { hall_id: hallId } }),
    );
  },
  getScene(sceneId: number): Promise<SceneDetail> {
    return unwrap(request.get<ApiEnvelope<SceneDetail>>(`/api/v1/scenes/${sceneId}`));
  },
  createScene(body: CreateSceneRequest): Promise<SceneDetail> {
    return unwrap(request.post<ApiEnvelope<SceneDetail>>('/api/v1/scenes', body));
  },
  updateScene(sceneId: number, body: UpdateSceneRequest): Promise<SceneDetail> {
    return unwrap(request.put<ApiEnvelope<SceneDetail>>(`/api/v1/scenes/${sceneId}`, body));
  },
  deleteScene(sceneId: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/scenes/${sceneId}`));
  },

  /* ---- 场景切换 / 设备指令 ---- */
  switchScene(sceneId: number): Promise<SwitchSceneResult> {
    return unwrap(request.post<ApiEnvelope<SwitchSceneResult>>(`/api/v1/scenes/${sceneId}/switch`));
  },
  sendDeviceCommand(body: DeviceCommandRequest): Promise<CommandResult> {
    return unwrap(request.post<ApiEnvelope<CommandResult>>('/api/v1/commands/device', body));
  },
  sendExhibitCommand(body: ExhibitCommandRequest): Promise<CommandResult> {
    return unwrap(request.post<ApiEnvelope<CommandResult>>('/api/v1/commands/exhibit', body));
  },

  /* ---- 状态查询 ---- */
  getDeviceRealtimeStatus(deviceId: number): Promise<DeviceRealtimeStatusDTO> {
    return unwrap(
      request.get<ApiEnvelope<DeviceRealtimeStatusDTO>>(`/api/v1/devices/${deviceId}/realtime-status`),
    );
  },
  getHallSnapshot(hallId: number): Promise<HallSnapshotDTO> {
    return unwrap(request.get<ApiEnvelope<HallSnapshotDTO>>(`/api/v1/halls/${hallId}/snapshot`));
  },

  /* ---- 触控导航 ---- */
  getTouchNavGraph(hallId: number, exhibitId: number): Promise<TouchNavGraph> {
    return unwrap(
      request.get<ApiEnvelope<TouchNavGraph>>(`/api/v1/halls/${hallId}/exhibits/${exhibitId}/touch-nav`),
    );
  },
  saveTouchNavGraph(hallId: number, exhibitId: number, body: SaveTouchNavRequest): Promise<TouchNavGraph> {
    return unwrap(
      request.put<ApiEnvelope<TouchNavGraph>>(
        `/api/v1/halls/${hallId}/exhibits/${exhibitId}/touch-nav`,
        body,
      ),
    );
  },
};

/* ============================================================
 * Content context typed client（35 个端点）—— Phase 2-B
 * ============================================================ */

export type ContentDetailDTO = components['schemas']['ContentDetailDTO'];
export type ContentListPage = components['schemas']['ContentListPage'];
export type ContentRejectReason = components['schemas']['ContentRejectReason'];
export type PipelineStage = components['schemas']['PipelineStage'];
export type PipelineStatusResult = components['schemas']['PipelineStatusResult'];
export type ExhibitContentDTO = components['schemas']['ExhibitContentDTO'];
export type TagDTO = components['schemas']['TagDTO'];
export type CreateTagRequest = components['schemas']['CreateTagRequest'];
export type UpdateTagRequest = components['schemas']['UpdateTagRequest'];
export type RequestUploadRequest = components['schemas']['RequestUploadRequest'];
export type RequestUploadResult = components['schemas']['RequestUploadResult'];
export type STSCredential = components['schemas']['STSCredential'];
export type UploadCompleteRequest = components['schemas']['UploadCompleteRequest'];
export type UploadCompleteResult = components['schemas']['UploadCompleteResult'];
export type RejectContentRequest = components['schemas']['RejectContentRequest'];
export type ResubmitContentRequest = components['schemas']['ResubmitContentRequest'];
export type BindContentRequest = components['schemas']['BindContentRequest'];
export type UpdateContentRequest = components['schemas']['UpdateContentRequest'];
export type DistributionDTO = components['schemas']['DistributionDTO'];
export type DownloadURLResult = components['schemas']['DownloadURLResult'];
export type WatermarkRequest = components['schemas']['WatermarkRequest'];
export type BucketStats = components['schemas']['BucketStats'];
export type OSSStatsResult = components['schemas']['OSSStatsResult'];
export type CleanupResult = components['schemas']['CleanupResult'];
export type QueueInfo = components['schemas']['QueueInfo'];
export type QueueTaskInfo = components['schemas']['QueueTaskInfo'];
export type QueueStatusResult = components['schemas']['QueueStatusResult'];
export type SlideshowConfig = components['schemas']['SlideshowConfig'];
export type ConfigureSlideshowRequest = components['schemas']['ConfigureSlideshowRequest'];
export type SlideshowTransition = SlideshowConfig['transition'];

/** ListContents 查询参数（hall_id 必填，其余 optional） */
export interface ListContentsParams {
  hall_id: number;
  page?: number;
  page_size?: number;
  keyword?: string;
  status?: string;
  exhibit_id?: number;
}

/** AdminListContents 多维过滤参数（多值字段是逗号分隔字符串） */
export interface AdminListContentsParams {
  status?: string;
  vendor_ids?: string;
  hall_id?: number;
  types?: string;
  page?: number;
  page_size?: number;
}

/** VendorListMyContents 参数（自动按 caller.vendor_id 过滤） */
export interface VendorListMyContentsParams {
  status?: string;
  page?: number;
  page_size?: number;
}

/** SearchContentTags 参数（exhibit_id 必填） */
export interface SearchContentTagsParams {
  exhibit_id: number;
  keyword?: string;
  dimension?: string;
  source?: string;
}

/** GetContentDistributions 参数（hall_id 必填） */
export interface GetContentDistributionsParams {
  hall_id: number;
  content_id?: number;
  status?: string;
}

/* ---- 旧调用方兼容别名（src/types/content.ts 删除后承接），以及 yaml 不覆盖的前端窄化 ---- */

/** ContentListItem = ContentDetailDTO（service 层 ListContents 返回 ContentDetailDTO[]，
 *  前端历史 ContentListItem 仅是窄化别名）。 */
export type ContentListItem = ContentDetailDTO;
export type ContentDetail = ContentDetailDTO;
/** 历史 ExhibitContentItem 命名 = yaml ExhibitContentDTO。 */
export type ExhibitContentItem = ExhibitContentDTO;
/** 历史 DistributionItem 命名 = yaml DistributionDTO。 */
export type DistributionItem = DistributionDTO;
/** 历史 ContentTag 命名 = yaml TagDTO。 */
export type ContentTag = TagDTO;
/** 历史 PaginatedData<ContentDetail> 调用形态。 */
export type ContentListPaginated = PageData<ContentDetailDTO>;

/* ---- 前端窄化字符串字面量（yaml 后端是 string；前端用于 switch 穷尽 / Tag 颜色映射）---- */
export type EncryptionMode = 'standard' | 'fuse' | 'none';
export type ContentStatus =
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'error'
  | 'pending_accept'
  | 'bound'
  | 'rejected'
  | 'withdrawn'
  | 'archived';
export type TagSource = 'ai' | 'manual';
export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type TagDimension = 'visual_element' | 'scene' | 'theme' | 'mood';
export type DistributionStatus = 'pending' | 'downloading' | 'ready' | 'failed';
export type DistributionType = 'auto' | 'manual';
export type TaggingStatus = '' | 'pending' | 'processing' | 'done' | 'failed';

/** Phase 10 驳回原因码 → 人类可读文案。前端 only。 */
export const REJECT_REASON_LABEL: Record<ContentRejectReason, string> = {
  spec_mismatch: '规格不符',
  poor_quality: '画质不够',
  wrong_content: '内容错误',
  file_corrupted: '文件损坏',
  bad_naming: '命名规范不符',
  other: '其他',
};

export const contentClient = {
  /* ---- 内容详情 / 列表 / 更新 / 删除 ---- */
  getContent(contentId: number): Promise<ContentDetailDTO> {
    return unwrap(request.get<ApiEnvelope<ContentDetailDTO>>(`/api/v1/contents/${contentId}`));
  },
  listContents(params: ListContentsParams): Promise<ContentListPage> {
    return unwrap(request.get<ApiEnvelope<ContentListPage>>('/api/v1/contents', { params }));
  },
  updateContent(contentId: number, body: UpdateContentRequest): Promise<ContentDetailDTO> {
    return unwrap(request.put<ApiEnvelope<ContentDetailDTO>>(`/api/v1/contents/${contentId}`, body));
  },
  deleteContent(contentId: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/contents/${contentId}`));
  },

  /* ---- 绑定 / 解绑展项 ---- */
  bindToExhibit(contentId: number, exhibitId: number): Promise<void> {
    return unwrap(
      request.post<ApiEnvelope<void>>(`/api/v1/contents/${contentId}/bind-exhibit`, {
        exhibit_id: exhibitId,
      } satisfies BindContentRequest),
    );
  },
  unbindContent(contentId: number): Promise<void> {
    return unwrap(request.post<ApiEnvelope<void>>(`/api/v1/contents/${contentId}/unbind`));
  },

  /* ---- 上传凭证 / 上传完成 ---- */
  requestUpload(hallId: number, body: RequestUploadRequest): Promise<RequestUploadResult> {
    return unwrap(
      request.post<ApiEnvelope<RequestUploadResult>>('/api/v1/contents/upload', body, {
        params: { hall_id: hallId },
      }),
    );
  },
  uploadComplete(contentId: number, body: UploadCompleteRequest): Promise<UploadCompleteResult> {
    return unwrap(
      request.post<ApiEnvelope<UploadCompleteResult>>(`/api/v1/contents/${contentId}/upload-complete`, body),
    );
  },
  uploadToExhibit(exhibitId: number, body: RequestUploadRequest): Promise<RequestUploadResult> {
    return unwrap(
      request.post<ApiEnvelope<RequestUploadResult>>(`/api/v1/exhibits/${exhibitId}/upload`, body),
    );
  },

  /* ---- 流水线 ---- */
  getPipelineStatus(contentId: number): Promise<PipelineStatusResult> {
    return unwrap(
      request.get<ApiEnvelope<PipelineStatusResult>>(`/api/v1/contents/${contentId}/pipeline-status`),
    );
  },
  getQueueStatus(): Promise<QueueStatusResult> {
    return unwrap(request.get<ApiEnvelope<QueueStatusResult>>('/api/v1/content-pipeline/queue-status'));
  },

  /* ---- 标签 ---- */
  searchTags(params: SearchContentTagsParams): Promise<TagDTO[]> {
    return unwrap(request.get<ApiEnvelope<TagDTO[]>>('/api/v1/content-tags', { params }));
  },
  getContentTags(contentId: number): Promise<TagDTO[]> {
    return unwrap(request.get<ApiEnvelope<TagDTO[]>>(`/api/v1/contents/${contentId}/tags`));
  },
  createTag(contentId: number, body: CreateTagRequest): Promise<TagDTO> {
    return unwrap(request.post<ApiEnvelope<TagDTO>>(`/api/v1/contents/${contentId}/tags`, body));
  },
  updateTag(tagId: number, body: UpdateTagRequest): Promise<TagDTO> {
    return unwrap(request.put<ApiEnvelope<TagDTO>>(`/api/v1/content-tags/${tagId}`, body));
  },
  deleteTag(tagId: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/content-tags/${tagId}`));
  },
  retag(contentId: number): Promise<void> {
    return unwrap(request.post<ApiEnvelope<void>>(`/api/v1/contents/${contentId}/retag`));
  },

  /* ---- 分发 / 下载链接 / 水印 / OSS 统计 / 清理 ---- */
  getDistributions(params: GetContentDistributionsParams): Promise<DistributionDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<DistributionDTO[]>>('/api/v1/content-distributions', { params }),
    );
  },
  getDownloadUrl(contentId: number): Promise<DownloadURLResult> {
    return unwrap(
      request.get<ApiEnvelope<DownloadURLResult>>(`/api/v1/contents/${contentId}/download-url`),
    );
  },
  setWatermark(contentId: number, body: WatermarkRequest): Promise<void> {
    return unwrap(
      request.put<ApiEnvelope<void>>(`/api/v1/contents/${contentId}/watermark`, body),
    );
  },
  getOSSStats(hallId: number): Promise<OSSStatsResult> {
    return unwrap(request.get<ApiEnvelope<OSSStatsResult>>(`/api/v1/halls/${hallId}/oss-stats`));
  },
  triggerCleanup(hallId: number): Promise<CleanupResult> {
    return unwrap(request.post<ApiEnvelope<CleanupResult>>(`/api/v1/halls/${hallId}/content-cleanup`));
  },

  /* ---- 展项内容 / 未绑定内容 ---- */
  getExhibitContent(exhibitId: number): Promise<ExhibitContentDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<ExhibitContentDTO[]>>(`/api/v1/exhibits/${exhibitId}/content`),
    );
  },
  getUnboundContent(hallId: number): Promise<ExhibitContentDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<ExhibitContentDTO[]>>(`/api/v1/halls/${hallId}/unbound-contents`),
    );
  },

  /* ---- 图文汇报（Slideshow）---- */
  getSlideshowConfig(exhibitId: number): Promise<SlideshowConfig | null> {
    return unwrap(
      request.get<ApiEnvelope<SlideshowConfig | null>>(`/api/v1/exhibits/${exhibitId}/slideshow`),
    );
  },
  configureSlideshow(exhibitId: number, body: ConfigureSlideshowRequest): Promise<SlideshowConfig> {
    return unwrap(
      request.put<ApiEnvelope<SlideshowConfig>>(`/api/v1/exhibits/${exhibitId}/slideshow`, body),
    );
  },
  deleteSlideshow(exhibitId: number): Promise<null> {
    return unwrap(request.delete<ApiEnvelope<null>>(`/api/v1/exhibits/${exhibitId}/slideshow`));
  },

  /* ---- Phase 10：内容生命周期（reject / withdraw / admin/contents）---- */
  rejectContent(contentId: number, body: RejectContentRequest): Promise<null> {
    return unwrap(
      request.post<ApiEnvelope<null>>(`/api/v1/contents/${contentId}/reject`, body),
    );
  },
  withdrawContent(contentId: number): Promise<null> {
    return unwrap(request.post<ApiEnvelope<null>>(`/api/v1/contents/${contentId}/withdraw`));
  },
  adminListContents(params: AdminListContentsParams): Promise<ContentListPage> {
    return unwrap(
      request.get<ApiEnvelope<ContentListPage>>('/api/v1/admin/contents', { params }),
    );
  },

  /* ---- Phase 12：版本链 ---- */
  getVersionChain(contentId: number): Promise<ContentDetailDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<ContentDetailDTO[]>>(`/api/v1/contents/${contentId}/versions`),
    );
  },

  /* ---- Phase 10：vendor 工作台 ---- */
  vendorListMyContents(params: VendorListMyContentsParams = {}): Promise<ContentListPage> {
    return unwrap(
      request.get<ApiEnvelope<ContentListPage>>('/api/v1/vendor/my-contents', { params }),
    );
  },
  vendorRequestUpload(body: RequestUploadRequest): Promise<RequestUploadResult> {
    return unwrap(
      request.post<ApiEnvelope<RequestUploadResult>>('/api/v1/vendor/contents/upload', body),
    );
  },
  vendorResubmit(parentContentId: number, body: ResubmitContentRequest): Promise<RequestUploadResult> {
    return unwrap(
      request.post<ApiEnvelope<RequestUploadResult>>(
        `/api/v1/vendor/contents/${parentContentId}/resubmit`,
        body,
      ),
    );
  },
};

/* ============================================================
 * Hall context schema 类型 re-export（Phase 2-C）
 * ============================================================ */

// ---- 枚举 ----
export type HallStatus = components['schemas']['HallStatus'];
export type DisplayMode = components['schemas']['DisplayMode'];
export type DeviceStatus = components['schemas']['DeviceStatus'];
export type AppInstanceStatus = components['schemas']['AppInstanceStatus'];
export type AppInstanceRole = components['schemas']['AppInstanceRole'];
export type PairingTargetType = components['schemas']['PairingTargetType'];
export type PairingCodeStatus = components['schemas']['PairingCodeStatus'];
export type ControlAppSessionStatus = components['schemas']['ControlAppSessionStatus'];
export type AnnouncePollStatus = components['schemas']['AnnouncePollStatus'];
export type EffectiveCommandSource = components['schemas']['EffectiveCommandSource'];

// ---- 嵌套 VO ----
export type MqttConfig = components['schemas']['MqttConfig'];
export type ServicePeriod = components['schemas']['ServicePeriod'];
export type SimpleFusionConfig = components['schemas']['SimpleFusionConfig'];
export type ConnectionConfig = components['schemas']['ConnectionConfig'];
export type DeviceInfoMeta = components['schemas']['DeviceInfoMeta'];

/**
 * DeviceInfoMeta 已知字段视图（前端 typed 访问 os/hostname/local_ip/mac_address 等）。
 * yaml 端为兼容 dart-dio built_value Builder 限制保持纯 additionalProperties；
 * 这里给前端补 typed 视图。后端 / Dart 端没有 typed 引用约束。
 */
export interface DeviceInfoMetaKnown {
  os?: string;
  hostname?: string;
  cpu?: string;
  gpu?: string;
  ram_gb?: number;
  local_ip?: string;
  mac_address?: string;
  [key: string]: unknown;
}
export type ScriptItem = components['schemas']['ScriptItem'];

// ---- Hall ----
export type HallListItemDTO = components['schemas']['HallListItemDTO'];
export type HallDetailDTO = components['schemas']['HallDetailDTO'];
export type HallListPage = components['schemas']['HallListPage'];

// ---- Hall 运行状态 ----
export type SceneInfoDTO = components['schemas']['SceneInfoDTO'];
export type RunningShowDTO = components['schemas']['RunningShowDTO'];
export type AppInstanceStatusDTO = components['schemas']['AppInstanceStatusDTO'];
export type HallStatusDTO = components['schemas']['HallStatusDTO'];

// ---- Exhibit ----
export type ExhibitListItemDTO = components['schemas']['ExhibitListItemDTO'];
export type ExhibitDTO = components['schemas']['ExhibitDTO'];
export type CreateExhibitRequest = components['schemas']['CreateExhibitRequest'];
export type UpdateExhibitRequest = components['schemas']['UpdateExhibitRequest'];
export type UpdateScriptsRequest = components['schemas']['UpdateScriptsRequest'];

// ---- Device ----
export type DeviceDTO = components['schemas']['DeviceDTO'];
export type CreateDeviceRequest = components['schemas']['CreateDeviceRequest'];
export type UpdateDeviceRequest = components['schemas']['UpdateDeviceRequest'];
export type EffectiveCommandDTO = components['schemas']['EffectiveCommandDTO'];

// ---- App Instance / Pairing / Announce ----
export type AppInstanceDTO = components['schemas']['AppInstanceDTO'];
export type PairingCodeDTO = components['schemas']['PairingCodeDTO'];
export type BatchSkippedItem = components['schemas']['BatchSkippedItem'];
export type BatchGenerateResult = components['schemas']['BatchGenerateResult'];
export type ExportPairingCodeItem = components['schemas']['ExportPairingCodeItem'];
export type GeneratePairingCodeRequest = components['schemas']['GeneratePairingCodeRequest'];
export type GenerateDebugPairingCodeRequest = components['schemas']['GenerateDebugPairingCodeRequest'];
export type ExtendDebugInstanceRequest = components['schemas']['ExtendDebugInstanceRequest'];
export type AnnouncedDeviceDTO = components['schemas']['AnnouncedDeviceDTO'];
export type PairAnnouncedRequest = components['schemas']['PairAnnouncedRequest'];

// ---- Hall config / 服务期 / 主控 ----
export type UpdateHallConfigRequest = components['schemas']['UpdateHallConfigRequest'];
export type UpdateServicePeriodRequest = components['schemas']['UpdateServicePeriodRequest'];

// ---- hall_master 选举 v2（hall.md §1.5）----
export type HallMasterStatusDTO = components['schemas']['HallMasterStatusDTO'];
export type MasterCandidateDTO = components['schemas']['MasterCandidateDTO'];
export type ElectionResultDTO = components['schemas']['ElectionResultDTO'];
export type HallMasterElectionReason = components['schemas']['HallMasterElectionReason'];
export type UpdateHallMasterPriorityRequest = components['schemas']['UpdateHallMasterPriorityRequest'];

// ---- MDM 同步 / Create-via-MDM ----
export type SyncMdmRequest = components['schemas']['SyncMdmRequest'];
export type SyncMdmResult = components['schemas']['HallSyncMdmResult'];
export type CreateHallViaMdmRequest = components['schemas']['CreateHallViaMdmRequest'];
export type MdmCustomer = components['schemas']['MdmCustomer'];

// ---- Control App Session ----
export type ControlAppSessionDTO = components['schemas']['ControlAppSessionDTO'];
export type SwitchControlHallRequest = components['schemas']['SwitchControlHallRequest'];
export type CleanupStaleSessionsResult = components['schemas']['CleanupStaleSessionsResult'];

// ---- App Pairing / Verify / Announce ----
export type VerifyMQTTTopics = components['schemas']['VerifyMQTTTopics'];
export type VerifyMQTTInfoDTO = components['schemas']['VerifyMQTTInfoDTO'];
export type VerifyServicePeriodDTO = components['schemas']['VerifyServicePeriodDTO'];
export type VerifyInstanceInfoDTO = components['schemas']['VerifyInstanceInfoDTO'];
export type PairExhibitAppRequest = components['schemas']['PairExhibitAppRequest'];
export type PairExhibitAppResp = components['schemas']['PairExhibitAppResp'];
export type VerifyAppInstanceRequest = components['schemas']['VerifyAppInstanceRequest'];
export type VerifyAppInstanceResp = components['schemas']['VerifyAppInstanceResp'];
export type AnnounceRequest = components['schemas']['AnnounceRequest'];
export type AnnounceResp = components['schemas']['AnnounceResp'];
export type AnnouncePollResp = components['schemas']['AnnouncePollResp'];

// ---- Control App ----
export type PairControlAppRequest = components['schemas']['PairControlAppRequest'];
export type PairControlAppResp = components['schemas']['PairControlAppResp'];
export type ControlAppMqttTopicsResp = components['schemas']['ControlAppMqttTopicsResp'];
export type ControlAppSyncHallDTO = components['schemas']['ControlAppSyncHallDTO'];
export type ControlAppSyncSceneDTO = components['schemas']['ControlAppSyncSceneDTO'];
export type ControlAppSyncShowDTO = components['schemas']['ControlAppSyncShowDTO'];
export type ControlAppSpriteSheet = components['schemas']['ControlAppSpriteSheet'];
export type ControlAppSyncContentDTO = components['schemas']['ControlAppSyncContentDTO'];
export type ControlAppSyncPanelCardDTO = components['schemas']['ControlAppSyncPanelCardDTO'];
export type ControlAppSyncPanelSectionDTO = components['schemas']['ControlAppSyncPanelSectionDTO'];
export type ControlAppSyncPanelDTO = components['schemas']['ControlAppSyncPanelDTO'];
export type ControlAppSyncResponse = components['schemas']['ControlAppSyncResponse'];

/* ---- 历史命名兼容别名（src/types/hall.ts 删除后承接） ---- */
export type HallListItem = HallListItemDTO;
export type HallDetail = HallDetailDTO;
export type HallRuntimeStatus = HallStatusDTO;
export type RuntimeSceneInfo = SceneInfoDTO;
export type RuntimeAppInstance = AppInstanceStatusDTO;
export type ExhibitListItem = ExhibitListItemDTO;
export type ExhibitBody = CreateExhibitRequest;
export type ExhibitScript = ScriptItem;
export type DeviceListItem = DeviceDTO;
export type DeviceBody = CreateDeviceRequest;
export type EffectiveCommand = EffectiveCommandDTO;
export type AppInstanceListItem = AppInstanceDTO;
export type PairingCodeListItem = PairingCodeDTO;
export type AnnouncedDevice = AnnouncedDeviceDTO;
export type ControlAppSessionItem = ControlAppSessionDTO;
export type GeneratePairingCodeBody = GeneratePairingCodeRequest;
export type SwitchControlHallBody = SwitchControlHallRequest;
export type HallConfigBody = UpdateHallConfigRequest;
export type ServicePeriodBody = UpdateServicePeriodRequest;
export type SyncMdmBody = SyncMdmRequest;
export type SyncMdmResultLegacy = SyncMdmResult;

/* ---- 前端窄化字符串字面量（service 层是 free string；前端用于 switch 穷尽 / Tag 颜色映射） ---- */
export type DeviceProtocol =
  | 'pjlink'
  | 'tcp'
  | 'rs232'
  | 'rs485'
  | 'artnet'
  | 'modbus'
  | 'osc'
  | 'wol'
  | 'plugin';
export type DeviceTypeNarrow =
  | 'projector'
  | 'player'
  | 'lighting'
  | 'audio'
  | 'sensor'
  | 'relay'
  | 'screen'
  | 'camera'
  | 'custom'
  | 'unknown';

/** ListHalls 查询参数 */
export interface ListHallsParams {
  page?: number;
  page_size?: number;
  keyword?: string;
  status?: string;
}

/** ListDevices 查询参数（hall_id 必填） */
export interface ListDevicesParams {
  hall_id: number;
  exhibit_id?: number;
  subcategory_id?: number;
  brand_id?: number;
  model_id?: number;
}

/** ListPairingCodes 查询参数 */
export interface ListPairingCodesParams {
  target_type?: string;
  status?: string;
}

export const hallClient = {
  /* ---- MDM 同步 ---- */
  syncFromMdm(body: SyncMdmRequest = {}): Promise<SyncMdmResult> {
    return unwrap(request.post<ApiEnvelope<SyncMdmResult>>('/api/v1/halls/sync-mdm', body));
  },
  // (alias 重出 — 等价 schema HallSyncMdmResult；前端历史命名 SyncMdmResult)
  createViaMdm(body: CreateHallViaMdmRequest): Promise<HallDetailDTO> {
    return unwrap(request.post<ApiEnvelope<HallDetailDTO>>('/api/v1/halls/create-via-mdm', body));
  },
  getMdmCustomers(): Promise<MdmCustomer[]> {
    return unwrap(request.get<ApiEnvelope<MdmCustomer[]>>('/api/v1/mdm-proxy/customers'));
  },

  /* ---- Hall 列表 / 详情 / 配置 / 服务期 / 状态 ---- */
  listHalls(params: ListHallsParams = {}): Promise<HallListPage> {
    return unwrap(request.get<ApiEnvelope<HallListPage>>('/api/v1/halls', { params }));
  },
  getHall(hallId: number): Promise<HallDetailDTO> {
    return unwrap(request.get<ApiEnvelope<HallDetailDTO>>(`/api/v1/halls/${hallId}`));
  },
  updateHallConfig(hallId: number, body: UpdateHallConfigRequest): Promise<void> {
    return unwrap(request.put<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/config`, body));
  },
  updateServicePeriod(hallId: number, body: UpdateServicePeriodRequest): Promise<void> {
    return unwrap(request.put<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/service-period`, body));
  },
  getHallStatus(hallId: number): Promise<HallStatusDTO> {
    return unwrap(request.get<ApiEnvelope<HallStatusDTO>>(`/api/v1/halls/${hallId}/status`));
  },

  /* ---- 展项 CRUD + 讲解词 ---- */
  listExhibits(hallId: number): Promise<ExhibitListItemDTO[]> {
    return unwrap(request.get<ApiEnvelope<ExhibitListItemDTO[]>>(`/api/v1/halls/${hallId}/exhibits`));
  },
  createExhibit(hallId: number, body: CreateExhibitRequest): Promise<ExhibitDTO> {
    return unwrap(request.post<ApiEnvelope<ExhibitDTO>>(`/api/v1/halls/${hallId}/exhibits`, body));
  },
  updateExhibit(hallId: number, exhibitId: number, body: UpdateExhibitRequest): Promise<ExhibitDTO> {
    return unwrap(request.put<ApiEnvelope<ExhibitDTO>>(`/api/v1/halls/${hallId}/exhibits/${exhibitId}`, body));
  },
  deleteExhibit(hallId: number, exhibitId: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/exhibits/${exhibitId}`));
  },
  getExhibitScripts(hallId: number, exhibitId: number): Promise<ScriptItem[]> {
    return unwrap(request.get<ApiEnvelope<ScriptItem[]>>(`/api/v1/halls/${hallId}/exhibits/${exhibitId}/scripts`));
  },
  updateExhibitScripts(hallId: number, exhibitId: number, scripts: ScriptItem[]): Promise<void> {
    return unwrap(
      request.put<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/exhibits/${exhibitId}/scripts`, {
        scripts,
      } satisfies UpdateScriptsRequest),
    );
  },

  /* ---- 设备 CRUD + effective-commands ---- */
  listDevices(params: ListDevicesParams): Promise<DeviceDTO[]> {
    return unwrap(request.get<ApiEnvelope<DeviceDTO[]>>('/api/v1/devices', { params }));
  },
  createDevice(body: CreateDeviceRequest): Promise<DeviceDTO> {
    return unwrap(request.post<ApiEnvelope<DeviceDTO>>('/api/v1/devices', body));
  },
  updateDevice(deviceId: number, body: UpdateDeviceRequest): Promise<DeviceDTO> {
    return unwrap(request.put<ApiEnvelope<DeviceDTO>>(`/api/v1/devices/${deviceId}`, body));
  },
  deleteDevice(deviceId: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/devices/${deviceId}`));
  },
  getEffectiveCommands(deviceId: number): Promise<EffectiveCommandDTO[]> {
    return unwrap(request.get<ApiEnvelope<EffectiveCommandDTO[]>>(`/api/v1/devices/${deviceId}/effective-commands`));
  },

  /* ---- 配对码 —— pairing.manage / pairing.debug 在后端挂 RequireReason，
     调用方可传第二参数 `reason` 注入 X-Action-Reason header（≥5 字） ---- */
  listPairingCodes(hallId: number, params: ListPairingCodesParams = {}): Promise<PairingCodeDTO[]> {
    return unwrap(request.get<ApiEnvelope<PairingCodeDTO[]>>(`/api/v1/halls/${hallId}/pairing-codes`, { params }));
  },
  generatePairingCode(
    hallId: number,
    body: GeneratePairingCodeRequest,
    reason?: string,
  ): Promise<PairingCodeDTO> {
    return unwrap(
      request.post<ApiEnvelope<PairingCodeDTO>>(
        `/api/v1/halls/${hallId}/pairing-codes`,
        mergeReasonBody(body as unknown as Record<string, unknown>, reason),
      ),
    );
  },
  batchGeneratePairingCodes(hallId: number, reason?: string): Promise<BatchGenerateResult> {
    return unwrap(
      request.post<ApiEnvelope<BatchGenerateResult>>(
        `/api/v1/halls/${hallId}/pairing-codes/batch`,
        mergeReasonBody(undefined, reason),
      ),
    );
  },
  generateDebugPairingCode(
    hallId: number,
    body: GenerateDebugPairingCodeRequest,
    reason?: string,
  ): Promise<PairingCodeDTO> {
    return unwrap(
      request.post<ApiEnvelope<PairingCodeDTO>>(
        `/api/v1/halls/${hallId}/pairing-codes/debug`,
        mergeReasonBody(body as unknown as Record<string, unknown>, reason),
      ),
    );
  },
  regeneratePairingCode(hallId: number, codeId: number, reason?: string): Promise<PairingCodeDTO> {
    return unwrap(
      request.post<ApiEnvelope<PairingCodeDTO>>(
        `/api/v1/halls/${hallId}/pairing-codes/${codeId}/regenerate`,
        mergeReasonBody(undefined, reason),
      ),
    );
  },
  unlockPairingCode(hallId: number, codeId: number, reason?: string): Promise<void> {
    return unwrap(
      request.post<ApiEnvelope<void>>(
        `/api/v1/halls/${hallId}/pairing-codes/${codeId}/unlock`,
        mergeReasonBody(undefined, reason),
      ),
    );
  },
  exportPairingCodes(hallId: number): Promise<ExportPairingCodeItem[]> {
    return unwrap(
      request.get<ApiEnvelope<ExportPairingCodeItem[]>>(`/api/v1/halls/${hallId}/pairing-codes/export`),
    );
  },

  /* ---- 调试实例 ---- */
  disconnectDebugInstance(hallId: number, instanceId: number): Promise<void> {
    return unwrap(
      request.delete<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/debug-instances/${instanceId}`),
    );
  },
  extendDebugInstance(hallId: number, instanceId: number, body: ExtendDebugInstanceRequest): Promise<AppInstanceDTO> {
    return unwrap(
      request.post<ApiEnvelope<AppInstanceDTO>>(`/api/v1/halls/${hallId}/debug-instances/${instanceId}/extend`, body),
    );
  },

  /* ---- 设备播报 ---- */
  listAnnouncedDevices(): Promise<AnnouncedDeviceDTO[]> {
    return unwrap(request.get<ApiEnvelope<AnnouncedDeviceDTO[]>>('/api/v1/announced-devices'));
  },
  pairAnnouncedDevice(hallId: number, body: PairAnnouncedRequest): Promise<void> {
    return unwrap(request.post<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/pair-announced`, body));
  },

  /* ---- 中控会话 ---- */
  listControlAppSessions(hallId: number): Promise<ControlAppSessionDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<ControlAppSessionDTO[]>>(`/api/v1/halls/${hallId}/control-app-sessions`),
    );
  },
  switchControlAppHall(hallId: number, sessionId: number, body: SwitchControlHallRequest): Promise<void> {
    return unwrap(
      request.post<ApiEnvelope<void>>(
        `/api/v1/halls/${hallId}/control-app-sessions/${sessionId}/switch-hall`,
        body,
      ),
    );
  },
  cleanupStaleControlSessions(hallId: number): Promise<CleanupStaleSessionsResult> {
    return unwrap(
      request.delete<ApiEnvelope<CleanupStaleSessionsResult>>(`/api/v1/halls/${hallId}/control-app-sessions/stale`),
    );
  },

  /* ---- App 实例（admin）---- */

  /* ---- hall_master 选举 v2（hall.md §1.5）---- */

  /**
   * 拖拽优先级保存。reason 必填（≥ 5 字）—— action=hall.switch_master RequireReason=true。
   * 后端落库后立即触发一次选举（reason=priority_change）。
   */
  updateHallMasterPriority(
    hallId: number,
    body: UpdateHallMasterPriorityRequest,
    reason?: string,
  ): Promise<void> {
    return unwrap(
      request.put<ApiEnvelope<void>>(
        `/api/v1/halls/${hallId}/master-priority`,
        mergeReasonBody(body as unknown as Record<string, unknown>, reason),
      ),
    );
  },

  /** 拿当前 master + 候补队列 + 上次选举元数据。 */
  getHallMasterStatus(hallId: number): Promise<HallMasterStatusDTO> {
    return unwrap(
      request.get<ApiEnvelope<HallMasterStatusDTO>>(`/api/v1/halls/${hallId}/master-status`),
    );
  },

  /** 立即重选（管理员强制；幂等）。reason 必填。 */
  electHallMaster(hallId: number, reason?: string): Promise<ElectionResultDTO> {
    return unwrap(
      request.post<ApiEnvelope<ElectionResultDTO>>(
        `/api/v1/halls/${hallId}/elect-master`,
        mergeReasonBody(undefined, reason),
      ),
    );
  },
  listAppInstances(hallId: number): Promise<AppInstanceDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<AppInstanceDTO[]>>(`/api/v1/halls/${hallId}/app-instances`),
    );
  },
  unpairAppInstance(hallId: number, instanceId: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/app-instances/${instanceId}`));
  },
};

/* ============================================================
 * Show context typed client（19 个端点）—— Phase 3-A
 * ============================================================ */

/* ---- Schema 类型 re-export ---- */
export type ShowDTO = components['schemas']['ShowDTO'];
export type ShowListItemDTO = components['schemas']['ShowListItemDTO'];
export type ShowTrackDTO = components['schemas']['ShowTrackDTO'];
export type ShowActionDTO = components['schemas']['ShowActionDTO'];
export type ShowVersionDTO = components['schemas']['ShowVersionDTO'];
export type ShowSpriteSheet = components['schemas']['ShowSpriteSheet'];
export type ShowControlResult = components['schemas']['ShowControlResult'];
export type ShowListPage = components['schemas']['ShowListPage'];
export type CreateShowRequest = components['schemas']['CreateShowRequest'];
export type UpdateShowRequest = components['schemas']['UpdateShowRequest'];
export type CreateShowTrackRequest = components['schemas']['CreateShowTrackRequest'];
export type UpdateShowTrackRequest = components['schemas']['UpdateShowTrackRequest'];
export type CreateShowActionRequest = components['schemas']['CreateShowActionRequest'];
export type UpdateShowActionRequest = components['schemas']['UpdateShowActionRequest'];
export type SaveShowTimelineRequest = components['schemas']['SaveShowTimelineRequest'];
export type SaveShowTimelineTrack = components['schemas']['SaveShowTimelineTrack'];
export type SaveShowTimelineAction = components['schemas']['SaveShowTimelineAction'];
export type RehearseShowRequest = components['schemas']['RehearseShowRequest'];

/* ---- 历史命名兼容别名（types/show.ts 删除后调用方平滑过渡） ---- */
export type ShowListItem = ShowListItemDTO;
export type ShowDetail = ShowDTO;
export type ShowTrack = ShowTrackDTO;
export type ShowAction = ShowActionDTO;
export type ShowVersionItem = ShowVersionDTO;
export type SpriteSheet = ShowSpriteSheet;
export type ShowCreateBody = CreateShowRequest;
export type ShowUpdateBody = UpdateShowRequest;
export type TrackBody = CreateShowTrackRequest;
export type ActionBody = CreateShowActionRequest;
export type SaveTimelineBody = SaveShowTimelineRequest;
export type SaveTimelineTrack = SaveShowTimelineTrack;
export type SaveTimelineAction = SaveShowTimelineAction;

/* ---- 前端窄化字面量（service 层是 free string；前端 switch / Tag 颜色映射） ---- */
export type ShowStatus = 'draft' | 'published';
export type TrackType = 'video' | 'light' | 'mechanical' | 'audio' | 'custom';
export type ActionType = 'device' | 'scene' | 'media';

/** RehearseShow 控制动作（与 yaml RehearseShowRequest.action enum 完全对齐） */
export type RehearseAction = 'start' | 'pause' | 'stop';

/** ListShows 查询参数 */
export interface ShowListParams {
  hall_id: number;
  page?: number;
  page_size?: number;
  status?: ShowStatus | 'all' | string;
}

export const showClient = {
  /* ---- Show CRUD ---- */
  listShows(params: ShowListParams): Promise<ShowListPage> {
    return unwrap(request.get<ApiEnvelope<ShowListPage>>('/api/v1/shows', { params }));
  },
  getShow(showId: number): Promise<ShowDTO> {
    return unwrap(request.get<ApiEnvelope<ShowDTO>>(`/api/v1/shows/${showId}`));
  },
  createShow(body: CreateShowRequest): Promise<ShowDTO> {
    return unwrap(request.post<ApiEnvelope<ShowDTO>>('/api/v1/shows', body));
  },
  updateShow(showId: number, body: UpdateShowRequest): Promise<ShowDTO> {
    return unwrap(request.put<ApiEnvelope<ShowDTO>>(`/api/v1/shows/${showId}`, body));
  },
  deleteShow(showId: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/shows/${showId}`));
  },
  listShowVersions(showId: number): Promise<ShowVersionDTO[]> {
    return unwrap(request.get<ApiEnvelope<ShowVersionDTO[]>>(`/api/v1/shows/${showId}/versions`));
  },

  /* ---- Track CRUD ---- */
  createShowTrack(showId: number, body: CreateShowTrackRequest): Promise<ShowTrackDTO> {
    return unwrap(
      request.post<ApiEnvelope<ShowTrackDTO>>(`/api/v1/shows/${showId}/tracks`, body),
    );
  },
  updateShowTrack(showId: number, trackId: number, body: UpdateShowTrackRequest): Promise<ShowTrackDTO> {
    return unwrap(
      request.put<ApiEnvelope<ShowTrackDTO>>(`/api/v1/shows/${showId}/tracks/${trackId}`, body),
    );
  },
  deleteShowTrack(showId: number, trackId: number): Promise<void> {
    return unwrap(
      request.delete<ApiEnvelope<void>>(`/api/v1/shows/${showId}/tracks/${trackId}`),
    );
  },

  /* ---- Action CRUD ---- */
  createShowAction(
    showId: number,
    trackId: number,
    body: CreateShowActionRequest,
  ): Promise<ShowActionDTO> {
    return unwrap(
      request.post<ApiEnvelope<ShowActionDTO>>(
        `/api/v1/shows/${showId}/tracks/${trackId}/actions`,
        body,
      ),
    );
  },
  updateShowAction(
    showId: number,
    actionId: number,
    body: UpdateShowActionRequest,
  ): Promise<ShowActionDTO> {
    return unwrap(
      request.put<ApiEnvelope<ShowActionDTO>>(`/api/v1/shows/${showId}/actions/${actionId}`, body),
    );
  },
  deleteShowAction(showId: number, actionId: number): Promise<void> {
    return unwrap(
      request.delete<ApiEnvelope<void>>(`/api/v1/shows/${showId}/actions/${actionId}`),
    );
  },

  /* ---- 时间轴批量保存 ---- */
  saveShowTimeline(showId: number, body: SaveShowTimelineRequest): Promise<ShowDTO> {
    return unwrap(
      request.put<ApiEnvelope<ShowDTO>>(`/api/v1/shows/${showId}/timeline`, body),
    );
  },

  /* ---- 版本发布 ---- */
  publishShow(showId: number): Promise<ShowVersionDTO> {
    return unwrap(request.post<ApiEnvelope<ShowVersionDTO>>(`/api/v1/shows/${showId}/publish`));
  },

  /* ---- 演出控制 ---- */
  startShow(showId: number): Promise<ShowControlResult> {
    return unwrap(request.post<ApiEnvelope<ShowControlResult>>(`/api/v1/shows/${showId}/start`));
  },
  pauseShow(showId: number): Promise<ShowControlResult> {
    return unwrap(request.post<ApiEnvelope<ShowControlResult>>(`/api/v1/shows/${showId}/pause`));
  },
  resumeShow(showId: number): Promise<ShowControlResult> {
    return unwrap(request.post<ApiEnvelope<ShowControlResult>>(`/api/v1/shows/${showId}/resume`));
  },
  cancelShow(showId: number): Promise<ShowControlResult> {
    return unwrap(request.post<ApiEnvelope<ShowControlResult>>(`/api/v1/shows/${showId}/cancel`));
  },
  rehearseShow(showId: number, action: RehearseAction): Promise<ShowControlResult> {
    return unwrap(
      request.post<ApiEnvelope<ShowControlResult>>(`/api/v1/shows/${showId}/rehearse`, {
        action,
      } satisfies RehearseShowRequest),
    );
  },
};

/* ---- hall context 破坏测试锚点（Phase 2-C） ---- */

/**
 * 显式访问 HallDetailDTO.status —— 破坏测试锚点（service.HallDetailDTO.Status）。
 */
export function hallIsActive(d: HallDetailDTO): boolean {
  return d.status === 'active';
}

/**
 * 显式访问 ExhibitListItemDTO.display_mode + DeviceDTO.subcategory_code —— 破坏测试锚点。
 */
export function isFusionExhibit(e: ExhibitListItemDTO): boolean {
  return e.display_mode === 'simple_fusion';
}

/**
 * 显式访问 DeviceDTO.subcategory_code —— 破坏测试锚点（DeviceListItem 历史就靠 subcategory_code 渲染图标）。
 */
export function deviceSubcategoryCode(d: DeviceDTO): string {
  return d.subcategory_code ?? '';
}

/**
 * 显式访问 PairingCodeDTO.target_type + AppInstanceDTO.role —— 破坏测试锚点。
 */
export function isDebugInstance(a: AppInstanceDTO): boolean {
  return a.role === 'debug';
}

/**
 * 显式访问 ControlAppSyncResponse.contents[].filename —— Phase 2-C 关键锚点：
 * 中控 sync 的 content[] 字段对齐由本函数把守。yaml 改字段名时 TS 立即编译失败。
 */
export function controlAppSyncContentNames(s: ControlAppSyncResponse): string[] {
  return s.contents.map((c) => c.filename);
}

/* ---- content context 破坏测试锚点（Phase 2-B） ---- */

/**
 * 显式访问 ContentDetailDTO.pipeline_status —— 破坏测试锚点。yaml 改字段名时这里立即编译失败。
 * 流水线状态是内容生命周期的关键字段（uploading / processing / ready / failed）。
 */
export function pipelineStatusIsRunning(d: ContentDetailDTO): boolean {
  return d.pipeline_status === 'processing';
}

/**
 * 显式访问 ContentDetailDTO.status + reject_reasons[] —— 破坏测试锚点。
 * Phase 10 vendor 工作台 / 管理员"未绑定 Tab" 的核心字段。
 */
export function rejectReasonsLength(d: ContentDetailDTO): number {
  if (d.status !== 'rejected') return 0;
  return d.reject_reasons?.length ?? 0;
}

/**
 * 显式访问 ContentDetailDTO.parent_content_id —— Phase 12 版本链锚点。
 */
export function isResubmittedVersion(d: ContentDetailDTO): boolean {
  return d.parent_content_id != null;
}

/**
 * 显式访问 ContentDetailDTO.vendor_id —— Phase 10 vendor 视角锚点（hallId 脱敏后用 vendor_id 区分）。
 */
export function vendorOwnsContent(d: ContentDetailDTO, vendorId: number): boolean {
  return d.vendor_id === vendorId;
}

/**
 * 显式访问 SlideshowConfig.transition —— enum 锚点；改 yaml 枚举名时编译失败。
 */
export function slideshowTransitionLabel(c: SlideshowConfig): SlideshowTransition {
  return c.transition;
}

/* ============================================================
 * 共享 helper（迁自 src/types/auth.ts 的 resolveAccountType）
 * ============================================================ */

/**
 * Phase 8 兼容读取：优先用 account_type，缺省时从 user_type 兜底推断。
 *   - account_type 存在且有值：直接返回
 *   - user_type === 'supplier' → 'vendor'
 *   - 其他或未登录 → 'internal'
 */
export function resolveAccountType(
  user: AccountTypeBearer | null | undefined,
): 'internal' | 'vendor' | 'customer' {
  if (!user) return 'internal';
  if (user.account_type) return user.account_type;
  if (user.user_type === 'supplier') return 'vendor';
  return 'internal';
}

/* ============================================================
 * 破坏测试锚点（TS 端单源约束的物理保证；steps §2 P0.7）
 * ============================================================ */

/**
 * 显式访问 LoginUser.role —— yaml 改字段名时这里立即编译失败。
 */
export function isAdminUser(u: LoginUser): boolean {
  return u.role === 'admin';
}

/**
 * 显式访问 UserDetail.must_change_pwd —— 破坏测试锚点。
 */
export function userMustChangePwd(u: UserDetail | null | undefined): boolean {
  return !!u?.must_change_pwd;
}

/**
 * 显式访问 SSOSearchUser.is_imported —— 破坏测试锚点。
 */
export function ssoUserIsImported(u: SSOSearchUser): boolean {
  return u.is_imported;
}

/**
 * 显式访问 SyncMDMResult.failed —— 破坏测试锚点。
 */
export function syncMdmHadFailures(r: SyncMDMResult): boolean {
  return r.failed > 0;
}

/* ---- command context 破坏测试锚点（Phase 2-A） ---- */

/**
 * 显式访问 SceneListItem.is_current —— 破坏测试锚点。yaml 改字段名时这里立即编译失败。
 */
export function sceneIsCurrent(s: SceneListItem): boolean {
  return s.is_current;
}

/**
 * 显式访问 CommandResult.status —— 破坏测试锚点。异步指令链关键字段。
 */
export function commandResultStatus(r: CommandResult): string {
  return r.status;
}

/**
 * 显式访问 HallSnapshotDTO.snapshot_at + 嵌套 ExhibitSnapshotDTO.app_status —— 破坏测试锚点。
 * 中控启动 / 后台总览读这个端点；字段漂移会立即让 typed client 编译失败。
 */
export function snapshotIsFresh(s: HallSnapshotDTO): boolean {
  return s.snapshot_at.length > 0;
}

/**
 * 显式访问 NavNode.is_root + HotZone.transition —— 破坏测试锚点。
 */
export function navNodeIsRoot(n: NavNode): boolean {
  return n.is_root;
}

/**
 * 显式访问 HotZone.transition enum —— 破坏测试锚点。
 */
export function hotZoneTransitionLabel(z: HotZone): NavTransition {
  return z.transition;
}

/* ---- show context 破坏测试锚点（Phase 3-A） ---- */

/**
 * 显式访问 ShowDTO.status —— 破坏测试锚点。draft/published 状态机用。
 */
export function showIsPublished(s: ShowDTO): boolean {
  return s.status === 'published';
}

/**
 * 显式访问 ShowDTO.duration_ms / pre_roll_ms / post_roll_ms —— 破坏测试锚点。
 * 时间轴编辑器最关键的三个字段；任一改名编译失败。
 */
export function showTotalTimelineMs(s: ShowDTO): number {
  return s.pre_roll_ms + s.duration_ms + s.post_roll_ms;
}

/**
 * 显式访问 ShowActionDTO.start_time_ms / duration_ms / action_type —— 破坏测试锚点。
 * action 时间区间字段是时间轴 ActionBlock 的渲染依据。
 */
export function showActionEndsAt(a: ShowActionDTO): number {
  return a.start_time_ms + a.duration_ms;
}

/**
 * 显式访问 ShowVersionDTO.version + published_at + track_count + action_count —— 破坏测试锚点。
 * 版本历史抽屉 / publish 后吐司用。
 */
export function showVersionLabel(v: ShowVersionDTO): string {
  const ts = v.published_at.slice(0, 10);
  return `v${v.version} @ ${ts}（${v.track_count} tracks, ${v.action_count} actions）`;
}

/**
 * 显式访问 ShowControlResult.msg_id + status —— 破坏测试锚点。
 * MQTT envelope ack 流的关键字段。
 */
export function showControlAcked(r: ShowControlResult): boolean {
  return Boolean(r.msg_id) && r.status !== '';
}

/* ============================================================
 * AI context typed client（22 个端点）—— Phase 3-B
 * ============================================================ */

/* ---- Schema 类型 re-export ---- */
export type AiAvatarDTO = components['schemas']['AiAvatarDTO'];
export type AiSpriteSheet = components['schemas']['AiSpriteSheet'];
export type AiTemplateDetailDTO = components['schemas']['AiTemplateDetailDTO'];
export type AiTemplateListItem = components['schemas']['AiTemplateListItem'];
export type AiTemplateListResponse = components['schemas']['AiTemplateListResponse'];
export type AiInputRequest = components['schemas']['AiInputRequest'];
export type AiInputResponse = components['schemas']['AiInputResponse'];
export type AiActivateRequest = components['schemas']['AiActivateRequest'];
export type AiActivateResponse = components['schemas']['AiActivateResponse'];
export type AiDeactivateRequest = components['schemas']['AiDeactivateRequest'];
export type AiDeactivateResponse = components['schemas']['AiDeactivateResponse'];
export type ConfigureAvatarRequest = components['schemas']['ConfigureAvatarRequest'];
export type CreateTemplateRequest = components['schemas']['CreateTemplateRequest'];
export type UpdateTemplateRequest = components['schemas']['UpdateTemplateRequest'];
export type UploadURLRequest = components['schemas']['UploadURLRequest'];
export type UploadURLResponse = components['schemas']['UploadURLResponse'];
export type CompleteUploadRequest = components['schemas']['CompleteUploadRequest'];
export type ConversationLogDTO = components['schemas']['ConversationLogDTO'];
export type ConversationLogPage = components['schemas']['ConversationLogPage'];
export type CacheHitMetricsDTO = components['schemas']['CacheHitMetricsDTO'];
export type LayoutConfigGen = components['schemas']['LayoutConfig'];
/** 兼容历史命名：LayoutConfig = yaml LayoutConfig schema */
export type LayoutConfig = LayoutConfigGen;
export type WhiteboardRect = components['schemas']['WhiteboardRect'];
export type TagSearchConfig = components['schemas']['TagSearchConfig'];
export type ConversationConfig = components['schemas']['ConversationConfig'];
export type ToolCallResultDTOGen = components['schemas']['ToolCallResultDTO'];
export type TestChatEventGen = components['schemas']['TestChatEvent'];
export type TestChatRequest = components['schemas']['TestChatRequest'];
export type TestTagSearchRequestGen = components['schemas']['TestTagSearchRequest'];
export type TestTagSearchResponse = components['schemas']['TestTagSearchResponse'];
export type TestTagMatchDTO = components['schemas']['TestTagMatchDTO'];
export type TestTagPlaylistItemDTO = components['schemas']['TestTagPlaylistItemDTO'];
export type SpriteFrameRef = components['schemas']['SpriteFrameRef'];
export type KnowledgeFileDTO = components['schemas']['KnowledgeFileDTO'];
export type KnowledgeFileListResponse = components['schemas']['KnowledgeFileListResponse'];
export type KnowledgeUploadURLRequest = components['schemas']['KnowledgeUploadURLRequest'];
export type KnowledgeUploadURLResponse = components['schemas']['KnowledgeUploadURLResponse'];
export type KnowledgeChunkDTO = components['schemas']['KnowledgeChunkDTO'];
export type SearchKnowledgeRequest = components['schemas']['SearchKnowledgeRequest'];
export type SearchKnowledgeResponse = components['schemas']['SearchKnowledgeResponse'];
export type VoiceInfo = components['schemas']['VoiceInfo'];
export type VoiceListResponse = components['schemas']['VoiceListResponse'];
export type SynthesizeSpeechRequest = components['schemas']['SynthesizeSpeechRequest'];
export type SynthesizeSpeechResponse = components['schemas']['SynthesizeSpeechResponse'];

/* ---- 历史命名兼容别名（types/ai.ts 删除后调用方平滑过渡） ---- */
/** AI 形象详情（前端历史名 AiAvatarDetail）—— 与 yaml AiAvatarDTO 完全对齐 */
export type AiAvatarDetail = AiAvatarDTO;
/** PUT /ai/avatars/:id 请求体（前端历史名 AiAvatarBody）*/
export type AiAvatarBody = ConfigureAvatarRequest;
/** GET /ai/avatar-templates 列表项 */
export type TemplateListItem = AiTemplateListItem;
/** GET /ai/avatar-templates/:id 详情 */
export type AiAvatarTemplate = AiTemplateDetailDTO;
/** TTS 音色列表项 */
export type VoiceItem = VoiceInfo;
/** TTS 合成请求体 */
export type TtsSynthesizeRequest = SynthesizeSpeechRequest;
/** TTS 合成响应（注意：后端只返 audio_url，前端历史声明的 duration_ms 已删除——
 *  duration 从 audio 元素 onloadedmetadata 拿即可） */
export type TtsSynthesizeResult = SynthesizeSpeechResponse;
/** 前端历史命名 KnowledgeFile = KnowledgeFileDTO */
export type KnowledgeFile = KnowledgeFileDTO;
/** 前端历史命名 KnowledgeUploadUrlRequest = KnowledgeUploadURLRequest */
export type KnowledgeUploadUrlRequest = KnowledgeUploadURLRequest;
/** 前端历史命名 KnowledgeUploadUrlResult = KnowledgeUploadURLResponse */
export type KnowledgeUploadUrlResult = KnowledgeUploadURLResponse;
/** 前端历史命名 KnowledgeChunk = KnowledgeChunkDTO */
export type KnowledgeChunk = KnowledgeChunkDTO;
/** 前端历史命名 KnowledgeSearchRequest = SearchKnowledgeRequest */
export type KnowledgeSearchRequest = SearchKnowledgeRequest;
/** 前端历史命名 TemplateUploadUrlRequest = UploadURLRequest */
export type TemplateUploadUrlRequest = UploadURLRequest;
/** 前端历史命名 TemplateUploadUrlResult = UploadURLResponse */
export type TemplateUploadUrlResult = UploadURLResponse;
/** 前端历史命名 TemplateUploadCompleteRequest = CompleteUploadRequest */
export type TemplateUploadCompleteRequest = CompleteUploadRequest;
/** 前端历史命名 TemplateUploadCompleteResult；后端实际返回完整 AiTemplateDetailDTO（不只 status） —— 老前端只读 .status；保留兼容名 */
export type TemplateUploadCompleteResult = AiTemplateDetailDTO;
/** 前端历史命名 TestTagSearchResult = TestTagSearchResponse */
export type TestTagSearchResult = TestTagSearchResponse;
/** 前端历史命名 TestTagSearchRequest 与 yaml 同名（请求体） */
export type TestTagSearchRequest = TestTagSearchRequestGen;
/** AI 工具结果项（兼容老 PlayByTagResult.tool_call result）。yaml ToolCallResultDTO. */
export type ToolCallResult = ToolCallResultDTOGen;

/* ---- 前端窄化字面量（service 层是 free string；前端 switch / Tag 颜色映射） ---- */
export type AiAvatarStatus = 'idle' | 'thinking' | 'talking' | 'off';
export type TemplateStatusNarrow = 'uploading' | 'processing' | 'ready' | 'error';
/** 兼容 types/ai.ts TemplateStatus 别名 */
export type TemplateStatus = TemplateStatusNarrow;
export type VideoType = 'idle' | 'thinking' | 'talking';
export type KnowledgeFileStatus = 'uploaded' | 'processing' | 'ready' | 'failed';
export type ExhibitDisplayModeNarrow = 'normal' | 'simple_fusion' | 'touch_interactive';
/** AI 工具名（含 v1.1 白板拆分新工具）—— 透明展开 play_by_tag → search_by_tag/play_media/media_control */
export type AiToolName =
  | 'switch_scene'
  | 'control_exhibit'
  | 'play_by_tag'
  | 'search_by_tag'
  | 'play_media'
  | 'media_control'
  | 'trigger_show'
  | 'control_device';
export type HotwordExtensions = Record<string, string[]>;

/** SpriteSheet：注意 ai context 的 SpriteSheet 与 show context 的 ShowSpriteSheet 字段集不同。
 *  ai 用 sheet_index/file/cols；show 用 url/columns。前端 ai 模板预览用此别名。 */
export type AiSpriteSheetNarrow = AiSpriteSheet;

/** AI Avatar 配置 voice_id / speech_rate（透传 config 字段）。前端历史 AiAvatarConfig：service 层是
 *  json.RawMessage，yaml 落 additionalProperties，前端读 voice_id / speech_rate 时按需 cast。 */
export interface AiAvatarConfig {
  voice_id?: string;
  speech_rate?: number;
}

/** SSE 事件 union（前端 SSE 解析时按 type 区分）—— 与 yaml TestChatEvent 字段集对齐，
 *  调用方写 `if (evt.type === 'tool_call') { ... }` 缩窄类型。 */
export type TestChatEvent =
  | { type: 'thinking' }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown>; result: unknown; dry_run: boolean }
  | { type: 'done'; full_text: string };

/** play_by_tag 工具结果项（前端 ChatSimulator 解析 tool_call.result.playlist 用） */
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

/** play_by_tag matched_tags 项 */
export interface MatchedTag {
  tag: string;
  dimension: string;
  confidence: number;
  count: number;
}

/** 兼容历史 PlayByTagResult */
export interface PlayByTagResult {
  matched_tags: MatchedTag[];
  playlist: PlaylistItem[];
}

/** AI Avatar 列表项（用于 admin 页表格；service 层未走单独端点，前端按 hall.exhibits + has_ai_avatar 拼装） */
export interface AiAvatarListItem {
  exhibit_id: number;
  exhibit_name: string;
  hall_id: number;
  hall_name: string;
  has_ai_avatar: boolean;
  status: AiAvatarStatus;
}

/** ListAiKnowledgeFiles 查询参数（前端历史调用：{exhibit_id, hall_id} 都可选；yaml 严格要求 hall_id）—— 调用方可只传 hall_id */
export interface AiKnowledgeFilesParams {
  hall_id: number;
  exhibit_id?: number;
}

/** ListAiConversationLogs 查询参数 */
export interface AiConversationLogsParams {
  exhibit_id: number;
  source?: string;
  page?: number;
  page_size?: number;
}

export const aiClient = {
  /* ---- avatar ---- */
  getAvatar(exhibitId: number, options?: { skipErrorMessage?: boolean }): Promise<AiAvatarDTO> {
    return unwrap(
      request.get<ApiEnvelope<AiAvatarDTO>>(`/api/v1/ai/avatars/${exhibitId}`, {
        skipErrorMessage: options?.skipErrorMessage,
      } as Record<string, unknown>),
    );
  },
  configureAvatar(exhibitId: number, body: ConfigureAvatarRequest): Promise<AiAvatarDTO> {
    return unwrap(request.put<ApiEnvelope<AiAvatarDTO>>(`/api/v1/ai/avatars/${exhibitId}`, body));
  },
  activateAvatar(exhibitId: number, hallId: number): Promise<void> {
    return unwrap(
      request.post<ApiEnvelope<void>>(`/api/v1/ai/avatars/${exhibitId}/activate`, undefined, {
        params: { hall_id: hallId },
      }),
    );
  },
  deactivateAvatar(exhibitId: number, hallId: number): Promise<void> {
    return unwrap(
      request.post<ApiEnvelope<void>>(`/api/v1/ai/avatars/${exhibitId}/deactivate`, undefined, {
        params: { hall_id: hallId },
      }),
    );
  },

  /* ---- chat input + 调试 ---- */
  handleInput(hallId: number, body: AiInputRequest): Promise<AiInputResponse> {
    return unwrap(
      request.post<ApiEnvelope<AiInputResponse>>('/api/v1/ai/input', body, {
        params: { hall_id: hallId },
      }),
    );
  },
  testTagSearch(exhibitId: number, hallId: number, body: TestTagSearchRequestGen): Promise<TestTagSearchResponse> {
    return unwrap(
      request.post<ApiEnvelope<TestTagSearchResponse>>(
        `/api/v1/ai/avatars/${exhibitId}/test-tag-search`,
        body,
        { params: { hall_id: hallId } },
      ),
    );
  },

  /* ---- 对话日志 / cache hit ---- */
  listConversationLogs(params: AiConversationLogsParams): Promise<ConversationLogPage> {
    return unwrap(
      request.get<ApiEnvelope<ConversationLogPage>>('/api/v1/ai/logs', { params }),
    );
  },
  getCacheHitMetrics(windowDays?: number): Promise<CacheHitMetricsDTO> {
    return unwrap(
      request.get<ApiEnvelope<CacheHitMetricsDTO>>('/api/v1/ai/metrics/cache-hit', {
        params: windowDays ? { window_days: windowDays } : {},
      }),
    );
  },

  /* ---- 中控 App 激活 / 失活 ---- */
  aiActivate(body: AiActivateRequest): Promise<AiActivateResponse> {
    return unwrap(request.post<ApiEnvelope<AiActivateResponse>>('/api/v1/commands/ai-activate', body));
  },
  aiDeactivate(body: AiDeactivateRequest): Promise<AiDeactivateResponse> {
    return unwrap(request.post<ApiEnvelope<AiDeactivateResponse>>('/api/v1/commands/ai-deactivate', body));
  },

  /* ---- 形象模板 ---- */
  listTemplates(): Promise<AiTemplateListResponse> {
    return unwrap(request.get<ApiEnvelope<AiTemplateListResponse>>('/api/v1/ai/avatar-templates'));
  },
  getTemplate(templateId: number): Promise<AiTemplateDetailDTO> {
    return unwrap(
      request.get<ApiEnvelope<AiTemplateDetailDTO>>(`/api/v1/ai/avatar-templates/${templateId}`),
    );
  },
  createTemplate(body: CreateTemplateRequest): Promise<AiTemplateDetailDTO> {
    return unwrap(request.post<ApiEnvelope<AiTemplateDetailDTO>>('/api/v1/ai/avatar-templates', body));
  },
  updateTemplate(templateId: number, body: UpdateTemplateRequest): Promise<AiTemplateDetailDTO> {
    return unwrap(
      request.put<ApiEnvelope<AiTemplateDetailDTO>>(`/api/v1/ai/avatar-templates/${templateId}`, body),
    );
  },
  deleteTemplate(templateId: number): Promise<void> {
    return unwrap(
      request.delete<ApiEnvelope<void>>(`/api/v1/ai/avatar-templates/${templateId}`),
    );
  },
  getTemplateUploadURL(templateId: number, body: UploadURLRequest): Promise<UploadURLResponse> {
    return unwrap(
      request.post<ApiEnvelope<UploadURLResponse>>(
        `/api/v1/ai/avatar-templates/${templateId}/upload-url`,
        body,
      ),
    );
  },
  completeTemplateUpload(templateId: number, body: CompleteUploadRequest): Promise<AiTemplateDetailDTO> {
    return unwrap(
      request.post<ApiEnvelope<AiTemplateDetailDTO>>(
        `/api/v1/ai/avatar-templates/${templateId}/upload-complete`,
        body,
      ),
    );
  },

  /* ---- 知识库 ---- */
  listKnowledgeFiles(params: AiKnowledgeFilesParams): Promise<KnowledgeFileListResponse> {
    return unwrap(
      request.get<ApiEnvelope<KnowledgeFileListResponse>>('/api/v1/ai/knowledge-files', { params }),
    );
  },
  getKnowledgeUploadURL(body: KnowledgeUploadURLRequest): Promise<KnowledgeUploadURLResponse> {
    return unwrap(
      request.post<ApiEnvelope<KnowledgeUploadURLResponse>>(
        '/api/v1/ai/knowledge-files/upload-url',
        body,
      ),
    );
  },
  completeKnowledgeUpload(fileId: number): Promise<KnowledgeFileDTO> {
    return unwrap(
      request.post<ApiEnvelope<KnowledgeFileDTO>>(
        `/api/v1/ai/knowledge-files/${fileId}/upload-complete`,
      ),
    );
  },
  deleteKnowledgeFile(fileId: number): Promise<void> {
    return unwrap(
      request.delete<ApiEnvelope<void>>(`/api/v1/ai/knowledge-files/${fileId}`),
    );
  },
  searchKnowledge(body: SearchKnowledgeRequest): Promise<SearchKnowledgeResponse> {
    return unwrap(
      request.post<ApiEnvelope<SearchKnowledgeResponse>>('/api/v1/ai/knowledge/search', body),
    );
  },

  /* ---- TTS ---- */
  listVoices(): Promise<VoiceListResponse> {
    return unwrap(request.get<ApiEnvelope<VoiceListResponse>>('/api/v1/ai/voices'));
  },
  synthesizeSpeech(body: SynthesizeSpeechRequest): Promise<SynthesizeSpeechResponse> {
    return unwrap(
      request.post<ApiEnvelope<SynthesizeSpeechResponse>>('/api/v1/ai/tts/synthesize', body),
    );
  },
};

/* ---- ai context 破坏测试锚点（Phase 3-B） ---- */

/**
 * 显式访问 AiAvatarDTO.template_status —— 破坏测试锚点。
 */
export function aiAvatarTemplateReady(d: AiAvatarDTO): boolean {
  return d.template_status === 'ready';
}

/**
 * 显式访问 ConversationLogDTO.prompt_cache_hit_tokens / prompt_tokens —— 破坏测试锚点。
 * 命中率 = cache_hit / prompt（PRD 12.3 监控用）。
 */
export function aiConversationLogHitRatio(log: ConversationLogDTO): number {
  if (log.prompt_tokens <= 0) return 0;
  return log.prompt_cache_hit_tokens / log.prompt_tokens;
}

/**
 * 显式访问 AiTemplateListItem.reference_count + status —— 破坏测试锚点。
 */
export function aiTemplateInUse(t: AiTemplateListItem): boolean {
  return t.reference_count > 0 && t.status === 'ready';
}

/**
 * 显式访问 KnowledgeFileDTO.chunk_count + filename —— 破坏测试锚点。
 */
export function aiKnowledgeFileLabel(f: KnowledgeFileDTO): string {
  return `${f.filename} (${f.chunk_count} chunks)`;
}

/**
 * 显式访问 AiActivateResponse.session_key + whiteboard_state —— 破坏测试锚点。
 */
export function aiActivationSession(r: AiActivateResponse): string {
  return `${r.session_key}@${r.whiteboard_state}`;
}

/* ============================================================
 * Panel context typed client（10 个端点）—— Phase 3-C
 * ============================================================ */

export type PanelDTO = components['schemas']['PanelDTO'];
export type PanelSectionDTO = components['schemas']['PanelSectionDTO'];
export type PanelCardDTO = components['schemas']['PanelCardDTO'];
export type AddPanelSectionRequest = components['schemas']['AddPanelSectionRequest'];
export type UpdatePanelSectionRequest = components['schemas']['UpdatePanelSectionRequest'];
export type ReorderPanelSectionsRequest = components['schemas']['ReorderPanelSectionsRequest'];
export type AddPanelCardRequest = components['schemas']['AddPanelCardRequest'];
export type UpdatePanelCardRequest = components['schemas']['UpdatePanelCardRequest'];
export type ReorderPanelCardsRequest = components['schemas']['ReorderPanelCardsRequest'];
export type GenerateDefaultPanelRequest = components['schemas']['GenerateDefaultPanelRequest'];

/** 历史命名兼容（types/panel.ts 删除前的 4 个核心类型别名）。 */
export type ControlPanel = PanelDTO;
export type PanelSection = PanelSectionDTO;
export type PanelCard = PanelCardDTO;
export type AddSectionBody = AddPanelSectionRequest;
export type UpdateSectionBody = UpdatePanelSectionRequest;
export type ReorderSectionsBody = ReorderPanelSectionsRequest;
export type AddCardBody = AddPanelCardRequest;
export type UpdateCardBody = UpdatePanelCardRequest;
export type ReorderCardsBody = ReorderPanelCardsRequest;
export type GenerateDefaultBody = GenerateDefaultPanelRequest;

/* ---- 中控面板改版 P1 — 版本化与发布 schema 类型 ---- */
export type PanelVersionDTO = components['schemas']['PanelVersionDTO'];
export type PanelVersionDetailDTO = components['schemas']['PanelVersionDetailDTO'];
export type PanelVersionListDTO = components['schemas']['PanelVersionListDTO'];
export type PanelVersionStatus = 'draft' | 'published' | 'archived';
export type SavePanelDraftRequest = components['schemas']['SavePanelDraftRequest'];
export type RenamePanelVersionRequest = components['schemas']['RenamePanelVersionRequest'];
export type PanelPublishResult = components['schemas']['PanelPublishResult'];

/**
 * PanelSnapshot 在 openapi yaml 里仅作"文档型"schema 存在，
 * 没有被任何 endpoint 直接 $ref（snapshot_json 在 SavePanelDraftRequest /
 * PanelVersionDetailDTO 里走 `type: object` 透传）。redocly bundler 会把它们
 * tree-shake 掉，所以前端这边手动声明 typed 视图（与 yaml 同形）。
 */
export interface DeviceCommandAction {
  device_id: number;
  command: string;
  params?: Record<string, unknown>;
}

export interface DeviceCommandButton {
  label: string;
  icon?: string;
  actions: DeviceCommandAction[];
}

export interface DeviceCommandBinding {
  buttons: DeviceCommandButton[];
}

export interface PanelCardSnapshot {
  card_type: string;
  binding?: Record<string, unknown>;
  config?: Record<string, unknown>;
  sort_order?: number;
}

export interface PanelSectionSnapshot {
  section_type: 'global' | 'exhibit';
  exhibit_id?: number;
  name: string;
  sort_order: number;
  cards: PanelCardSnapshot[];
}

export interface PanelSnapshot {
  sections: PanelSectionSnapshot[];
}

export interface ListPanelVersionsParams {
  status?: PanelVersionStatus;
  page?: number;
  page_size?: number;
}

/**
 * 前端窄化字面量：SectionType / CardType。
 *
 * yaml 端 SectionType 走 enum（global / exhibit），CardType 保留 free-form string
 * （服务端 binding:"required" 不 oneof，保持扩展性）。前端用窄化字面量给 switch / 图标 map
 * 自洽（沿用 Phase 3-A 陷阱 #28）。
 */
export type PanelSectionType = 'global' | 'exhibit';
export type PanelCardType =
  | 'scene_group'
  | 'media'
  | 'show'
  | 'device_toggle'
  | 'device_command'
  | 'slider'
  | 'device_status'
  | 'script'
  | 'ai';

/** 历史命名兼容。 */
export type SectionType = PanelSectionType;
export type CardType = PanelCardType;

/**
 * PanelCardBinding 视图接口 —— card.binding 在 service 层是 json.RawMessage 透传，
 * gen 落 `Record<string, unknown> | null | undefined`（前端读字段返回 unknown，不能直接渲染）。
 * 调用方写 `cardBinding(card)?.id` 取 typed 视图（沿用 Phase 3-B AvatarConfig / Phase 2-C
 * DeviceInfoMetaKnown 同模式）。
 *
 * 索引签名让本接口与 schema 端 `Record<string, unknown>` 双向兼容（既能从 schema cast 进来，
 * 也能赋值回 AddCardBody.binding / UpdateCardBody.binding）。
 */
export interface PanelCardBinding {
  type?: string;
  id?: number;
  ids?: number[];
  hall_id?: number;
  exhibit_id?: number;
  device_id?: number;
  [key: string]: unknown;
}

/** 历史命名兼容（types/panel.ts 老前端）：CardBinding = PanelCardBinding。 */
export type CardBinding = PanelCardBinding;

/**
 * 从 PanelCardDTO.binding 提取 typed 视图。
 *
 * 不在 client.ts 这层做字段校验——直接结构化窄化；调用方自行处理字段缺失（用 ??）。
 */
export function cardBinding(c: { binding?: Record<string, unknown> | null }): PanelCardBinding | undefined {
  return (c.binding ?? undefined) as PanelCardBinding | undefined;
}

/** 卡片类型显示标签（中文展示用，迁移自 types/panel.ts）。 */
export const CARD_TYPE_LABELS: Record<PanelCardType, string> = {
  scene_group: '场景按钮组',
  media: '媒体播控',
  show: '演出控制',
  device_toggle: '设备开关',
  device_command: '设备命令',
  slider: '滑块控制',
  device_status: '设备状态',
  script: '讲解词',
  ai: 'AI 互动',
};

/** 卡片类型图标（Material Symbols name，迁移自 types/panel.ts）。 */
export const CARD_TYPE_ICONS: Record<PanelCardType, string> = {
  scene_group: 'scene',
  media: 'play_circle',
  show: 'movie',
  device_toggle: 'toggle_on',
  device_command: 'bolt',
  slider: 'tune',
  device_status: 'sensors',
  script: 'description',
  ai: 'smart_toy',
};

/** 分区类型显示标签（迁移自 types/panel.ts）。 */
export const SECTION_TYPE_LABELS: Record<PanelSectionType, string> = {
  global: '全局',
  exhibit: '展项',
};

/** 全部 card_type 列表（用于"添加卡片"下拉选项，迁移自 types/panel.ts）。 */
export const ALL_CARD_TYPES: PanelCardType[] = [
  'scene_group',
  'media',
  'show',
  'device_toggle',
  'device_command',
  'slider',
  'device_status',
  'script',
  'ai',
];

export const panelClient = {
  /* ---- read ---- */
  getPanel(hallId: number): Promise<PanelDTO> {
    return unwrap(request.get<ApiEnvelope<PanelDTO>>(`/api/v1/halls/${hallId}/panel`));
  },

  /* ---- panel-level ---- */
  generateDefaultPanel(hallId: number, body?: GenerateDefaultPanelRequest): Promise<PanelDTO> {
    return unwrap(
      request.post<ApiEnvelope<PanelDTO>>(`/api/v1/halls/${hallId}/panel/generate-default`, body || {}),
    );
  },

  /* ---- section CRUD ---- */
  addPanelSection(hallId: number, body: AddPanelSectionRequest): Promise<PanelSectionDTO> {
    return unwrap(
      request.post<ApiEnvelope<PanelSectionDTO>>(`/api/v1/halls/${hallId}/panel/sections`, body),
    );
  },
  updatePanelSection(
    hallId: number,
    sectionId: number,
    body: UpdatePanelSectionRequest,
  ): Promise<PanelSectionDTO> {
    return unwrap(
      request.put<ApiEnvelope<PanelSectionDTO>>(
        `/api/v1/halls/${hallId}/panel/sections/${sectionId}`,
        body,
      ),
    );
  },
  deletePanelSection(hallId: number, sectionId: number): Promise<void> {
    return unwrap(
      request.delete<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/panel/sections/${sectionId}`),
    );
  },
  reorderPanelSections(hallId: number, body: ReorderPanelSectionsRequest): Promise<void> {
    return unwrap(
      request.put<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/panel/sections/order`, body),
    );
  },

  /* ---- card CRUD ---- */
  addPanelCard(hallId: number, sectionId: number, body: AddPanelCardRequest): Promise<PanelCardDTO> {
    return unwrap(
      request.post<ApiEnvelope<PanelCardDTO>>(
        `/api/v1/halls/${hallId}/panel/sections/${sectionId}/cards`,
        body,
      ),
    );
  },
  updatePanelCard(
    hallId: number,
    cardId: number,
    body: UpdatePanelCardRequest,
  ): Promise<PanelCardDTO> {
    return unwrap(
      request.put<ApiEnvelope<PanelCardDTO>>(`/api/v1/halls/${hallId}/panel/cards/${cardId}`, body),
    );
  },
  deletePanelCard(hallId: number, cardId: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/panel/cards/${cardId}`));
  },
  reorderPanelCards(
    hallId: number,
    sectionId: number,
    body: ReorderPanelCardsRequest,
  ): Promise<void> {
    return unwrap(
      request.put<ApiEnvelope<void>>(
        `/api/v1/halls/${hallId}/panel/sections/${sectionId}/cards/order`,
        body,
      ),
    );
  },

  /* ---- 中控面板改版 P1 — 版本化与发布（6 端点）---- */
  listPanelVersions(
    hallId: number,
    params?: ListPanelVersionsParams,
  ): Promise<PanelVersionListDTO> {
    return unwrap(
      request.get<ApiEnvelope<PanelVersionListDTO>>(`/api/v1/halls/${hallId}/panel/versions`, {
        params,
      }),
    );
  },
  savePanelDraft(hallId: number, body: SavePanelDraftRequest): Promise<PanelVersionDTO> {
    return unwrap(
      request.post<ApiEnvelope<PanelVersionDTO>>(`/api/v1/halls/${hallId}/panel/versions`, body),
    );
  },
  getPanelVersionDetail(hallId: number, versionId: number): Promise<PanelVersionDetailDTO> {
    return unwrap(
      request.get<ApiEnvelope<PanelVersionDetailDTO>>(
        `/api/v1/halls/${hallId}/panel/versions/${versionId}`,
      ),
    );
  },
  renamePanelVersion(
    hallId: number,
    versionId: number,
    body: RenamePanelVersionRequest,
  ): Promise<void> {
    return unwrap(
      request.put<ApiEnvelope<void>>(
        `/api/v1/halls/${hallId}/panel/versions/${versionId}`,
        body,
      ),
    );
  },
  deletePanelVersion(hallId: number, versionId: number): Promise<void> {
    return unwrap(
      request.delete<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/panel/versions/${versionId}`),
    );
  },
  publishPanelVersion(hallId: number, versionId: number): Promise<PanelPublishResult> {
    return unwrap(
      request.post<ApiEnvelope<PanelPublishResult>>(
        `/api/v1/halls/${hallId}/panel/versions/${versionId}/publish`,
      ),
    );
  },
};

/* ---- panel context 破坏测试锚点（Phase 3-C） ---- */

/**
 * 显式访问 PanelDTO.hall_id —— 破坏测试锚点。
 * service 永远填 hall_id；前端用此判定面板是否属于"当前 hallStore.hallId"。
 */
export function panelDtoIsHallScoped(p: PanelDTO, expectedHallId: number): boolean {
  return p.hall_id === expectedHallId;
}

/**
 * 显式访问 PanelSectionDTO.section_type + exhibit_id —— 破坏测试锚点。
 * 仅 exhibit 类分区有 exhibit_id；global 分区 exhibit_id 缺省。
 */
export function panelSectionIsExhibitScoped(s: PanelSectionDTO): boolean {
  return s.section_type === 'exhibit' && s.exhibit_id != null;
}

/**
 * 显式访问 PanelCardDTO.card_type + sort_order —— 破坏测试锚点。
 * 用于卡片标签查找 + 同分区内排序（service 永远返回非空 sort_order）。
 */
export function panelCardLabel(c: PanelCardDTO): string {
  return `${CARD_TYPE_LABELS[c.card_type as PanelCardType] ?? c.card_type} #${c.sort_order}`;
}

/* ============================================================
 * Notification context typed client（3 个端点）—— Phase 3-C
 * ============================================================ */

export type NotificationConfigDTO = components['schemas']['NotificationConfigDTO'];
export type NotificationLogDTO = components['schemas']['NotificationLogDTO'];
export type NotificationLogPage = components['schemas']['NotificationLogPage'];
export type UpdateNotificationConfigRequest =
  components['schemas']['UpdateNotificationConfigRequest'];

/** 历史命名兼容（types/notification.ts 删除前的别名）。 */
export type NotificationConfigItem = NotificationConfigDTO;
export type NotificationLogItem = NotificationLogDTO;
export type NotificationConfigBody = UpdateNotificationConfigRequest;

/**
 * 前端窄化字面量：NotificationEventType。
 *
 * service 层 allEventTypes 是动态白名单（包含历史 + Phase 5 NAS 归档新增类型），
 * yaml 保持 free-form string；前端窄化给 switch / 图标 map 用，调用方按需 cast。
 * 维护原则：service.go 加新事件 → 这里同步加；schema 字段读出仍是 string，不影响其他调用。
 */
export type NotificationEventType =
  | 'content_uploaded'
  | 'content_encrypted'
  | 'distribution_ready'
  | 'distribution_failed'
  | 'service_expiring'
  | 'service_expired'
  | 'app_offline'
  | 'smarthome_gateway_offline'
  | 'smarthome_batch_device_offline'
  | 'smarthome_device_offline'
  | 'smarthome_sensor_battery_low'
  | 'smarthome_rule_anomaly'
  // NAS 归档模块（Phase 5）
  | 'nas_archived'
  | 'nas_sync_failed'
  | 'nas_agent_offline'
  | 'nas_backlog_exceeded';

/** 通知日志列表查询参数（与 ListNotificationLogsParams 对齐）。 */
export interface NotificationLogParams {
  page: number;
  page_size: number;
  event_type?: string;
}

export const notificationClient = {
  listNotificationConfigs(hallId: number): Promise<NotificationConfigDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<NotificationConfigDTO[]>>(
        `/api/v1/halls/${hallId}/notification-configs`,
      ),
    );
  },
  updateNotificationConfig(
    hallId: number,
    eventType: string,
    body: UpdateNotificationConfigRequest,
  ): Promise<void> {
    return unwrap(
      request.put<ApiEnvelope<void>>(
        `/api/v1/halls/${hallId}/notification-configs/${eventType}`,
        body,
      ),
    );
  },
  listNotificationLogs(hallId: number, params: NotificationLogParams): Promise<NotificationLogPage> {
    return unwrap(
      request.get<ApiEnvelope<NotificationLogPage>>(`/api/v1/halls/${hallId}/notification-logs`, {
        params,
      }),
    );
  },
};

/* ---- notification context 破坏测试锚点（Phase 3-C） ---- */

/**
 * 显式访问 NotificationConfigDTO.event_type + enabled + recipients —— 破坏测试锚点。
 */
export function notificationConfigSummary(c: NotificationConfigDTO): string {
  return `${c.event_type}: ${c.enabled ? `on (${c.recipients.length})` : 'off'}`;
}

/**
 * 显式访问 NotificationLogDTO.send_status + sent_at —— 破坏测试锚点。
 */
export function notificationLogIsPending(l: NotificationLogDTO): boolean {
  return l.send_status === 'pending' && l.sent_at == null;
}

/* ============================================================
 * App context typed client（5 个端点）—— Phase 3-D
 *
 * 注意：app context 是展厅 App（C# .NET）后端聚合接口（X-App-Token bearer）。admin 后台
 * 不消费这些端点 —— typed client 函数仅作为破坏测试锚点 + 未来诊断 UI 复用基础。
 * ============================================================ */

export type AppSyncResponse = components['schemas']['AppSyncResponse'];
export type AppSyncHall = components['schemas']['AppSyncHall'];
export type AppSyncExhibit = components['schemas']['AppSyncExhibit'];
export type AppSyncDevice = components['schemas']['AppSyncDevice'];
export type AppSyncContent = components['schemas']['AppSyncContent'];
export type AppSyncScene = components['schemas']['AppSyncScene'];
export type AppSyncSceneAction = components['schemas']['AppSyncSceneAction'];
export type AppSyncAiAvatar = components['schemas']['AppSyncAiAvatar'];
export type AppSyncAvatarTemplate = components['schemas']['AppSyncAvatarTemplate'];
export type AppSyncShow = components['schemas']['AppSyncShow'];
export type AppReportDistributionRequest =
  components['schemas']['AppReportDistributionRequest'];
export type AppReportManualImportRequest =
  components['schemas']['AppReportManualImportRequest'];
export type AppForwardAIInputRequest =
  components['schemas']['AppForwardAIInputRequest'];

/** 分发上报状态字面量（与 yaml enum 对齐；调用方写时按此 cast）。 */
export type AppDistributionStatus = AppReportDistributionRequest['status'];

export const appClient = {
  getAppSync(): Promise<AppSyncResponse> {
    return unwrap(request.get<ApiEnvelope<AppSyncResponse>>('/api/v1/app/sync'));
  },
  reportAppDistribution(distributionId: number, body: AppReportDistributionRequest): Promise<void> {
    return unwrap(
      request.post<ApiEnvelope<void>>(
        `/api/v1/app/distributions/${distributionId}/report`,
        body,
      ),
    );
  },
  reportAppManualImport(body: AppReportManualImportRequest): Promise<void> {
    return unwrap(
      request.post<ApiEnvelope<void>>('/api/v1/app/distributions/manual-import', body),
    );
  },
  forwardAppAIInput(body: AppForwardAIInputRequest): Promise<AiInputResponse> {
    return unwrap(request.post<ApiEnvelope<AiInputResponse>>('/api/v1/app/ai-input', body));
  },
  getAppShow(): Promise<AppSyncShow | null> {
    return unwrap(request.get<ApiEnvelope<AppSyncShow | null>>('/api/v1/app/show'));
  },
};

/* ---- app context 破坏测试锚点（Phase 3-D） ---- */

/**
 * 显式访问 AppSyncHall.ai_knowledge_text + AppSyncResponse.sync_at —— 破坏测试锚点。
 * 后端 service 永远填这两个字段；展厅 App 同步后端心跳依赖之。
 */
export function appSyncIsHydrated(r: AppSyncResponse): boolean {
  return r.hall.ai_knowledge_text !== undefined && r.sync_at !== '';
}

/* ============================================================
 * Analytics context typed client（7 个端点）—— Phase 3-D
 *
 * 上报端点（reportPlayback / reportAiInteraction）走 X-App-Token，admin 不消费 ——
 * 仍 typed 化保留破坏测试覆盖。
 * ============================================================ */

export type AnalyticsUsageOverviewDTO = components['schemas']['AnalyticsUsageOverviewDTO'];
export type AnalyticsAITokenUsage = components['schemas']['AnalyticsAITokenUsage'];
export type AnalyticsOSSUsage = components['schemas']['AnalyticsOSSUsage'];
export type AnalyticsPlaybackDailyStat = components['schemas']['AnalyticsPlaybackDailyStat'];
export type AnalyticsOperationDailyStat = components['schemas']['AnalyticsOperationDailyStat'];
export type AnalyticsAiInteractionDailyStat =
  components['schemas']['AnalyticsAiInteractionDailyStat'];
export type AnalyticsAiKeywordStat = components['schemas']['AnalyticsAiKeywordStat'];
export type AnalyticsAiStatsDTO = components['schemas']['AnalyticsAiStatsDTO'];
export type AnalyticsOssObjectDTO = components['schemas']['AnalyticsOssObjectDTO'];
export type AnalyticsOssBrowserResult = components['schemas']['AnalyticsOssBrowserResult'];
export type AnalyticsPlaybackReportRequest =
  components['schemas']['AnalyticsPlaybackReportRequest'];
export type AnalyticsAiInteractionReportRequest =
  components['schemas']['AnalyticsAiInteractionReportRequest'];

/** 历史命名兼容（types/analytics.ts 删除前的别名）。 */
export type UsageOverviewDTO = AnalyticsUsageOverviewDTO;
export type AITokenUsageDTO = AnalyticsAITokenUsage;
export type OSSUsageDTO = AnalyticsOSSUsage;
export type PlaybackDailyStat = AnalyticsPlaybackDailyStat;
export type OperationDailyStat = AnalyticsOperationDailyStat;
export type AiInteractionDailyStat = AnalyticsAiInteractionDailyStat;
export type AiKeywordStat = AnalyticsAiKeywordStat;
export type AiStatsDTO = AnalyticsAiStatsDTO;
export type OssObjectDTO = AnalyticsOssObjectDTO;
export type OssBrowserResult = AnalyticsOssBrowserResult;

/** 查询参数（与 yaml params + 现有 admin 调用方对齐）。 */
export interface UsageOverviewParams {
  hall_id: number;
  year: number;
  month: number;
}
export interface DateRangeStatsParams {
  hall_id: number;
  start_date: string;
  end_date: string;
}
export interface AiStatsParams extends DateRangeStatsParams {
  top_n?: number;
}
export interface OssBrowserParams {
  bucket: string;
  prefix?: string;
  marker?: string;
  page_size?: number;
}

export const analyticsClient = {
  getAnalyticsUsageOverview(params: UsageOverviewParams): Promise<AnalyticsUsageOverviewDTO> {
    return unwrap(
      request.get<ApiEnvelope<AnalyticsUsageOverviewDTO>>('/api/v1/analytics/usage-overview', {
        params,
      }),
    );
  },
  getAnalyticsPlaybackStats(params: DateRangeStatsParams): Promise<AnalyticsPlaybackDailyStat[]> {
    return unwrap(
      request.get<ApiEnvelope<AnalyticsPlaybackDailyStat[]>>(
        '/api/v1/analytics/playback-stats',
        { params },
      ),
    );
  },
  getAnalyticsOperationStats(params: DateRangeStatsParams): Promise<AnalyticsOperationDailyStat[]> {
    return unwrap(
      request.get<ApiEnvelope<AnalyticsOperationDailyStat[]>>(
        '/api/v1/analytics/operation-stats',
        { params },
      ),
    );
  },
  getAnalyticsAiStats(params: AiStatsParams): Promise<AnalyticsAiStatsDTO> {
    return unwrap(
      request.get<ApiEnvelope<AnalyticsAiStatsDTO>>('/api/v1/analytics/ai-stats', { params }),
    );
  },
  getAnalyticsOssBrowser(params: OssBrowserParams): Promise<AnalyticsOssBrowserResult> {
    return unwrap(
      request.get<ApiEnvelope<AnalyticsOssBrowserResult>>('/api/v1/analytics/oss-browser', {
        params,
      }),
    );
  },
  reportPlayback(body: AnalyticsPlaybackReportRequest): Promise<void> {
    return unwrap(request.post<ApiEnvelope<void>>('/api/v1/stats/playback-report', body));
  },
  reportAiInteraction(body: AnalyticsAiInteractionReportRequest): Promise<void> {
    return unwrap(request.post<ApiEnvelope<void>>('/api/v1/stats/ai-interaction-report', body));
  },
};

/* ---- analytics context 破坏测试锚点（Phase 3-D） ---- */

/**
 * 显式访问 AnalyticsPlaybackDailyStat.play_count + total_duration_sec —— 破坏测试锚点。
 */
export function playbackHasActivity(s: AnalyticsPlaybackDailyStat): boolean {
  return s.play_count > 0 || s.total_duration_sec > 0;
}

/**
 * 显式访问 AnalyticsAiKeywordStat.hit_count + keyword —— 破坏测试锚点。
 */
export function aiKeywordLabel(k: AnalyticsAiKeywordStat): string {
  return `${k.keyword} (${k.hit_count})`;
}

/* ============================================================
 * Release context typed client（9 个端点）—— Phase 3-D
 *
 * /app/check-update + /app/update-status 路径在 /app/* 下但归属 release context；
 * admin 端不调（展厅 App 才调），这里仅 typed 函数 + 锚点。
 * ============================================================ */

export type AppRelease = components['schemas']['AppRelease'];
export type HallAppVersionDTO = components['schemas']['HallAppVersionDTO'];
export type RequestReleaseUploadRequest =
  components['schemas']['RequestReleaseUploadRequest'];
export type RequestReleaseUploadResponse =
  components['schemas']['RequestReleaseUploadResponse'];
export type CreateReleaseRequest = components['schemas']['CreateReleaseRequest'];
export type SetHallVersionRequest = components['schemas']['SetHallVersionRequest'];
export type NotifyAppUpdateRequest = components['schemas']['NotifyAppUpdateRequest'];
export type CheckAppUpdateResponse = components['schemas']['CheckAppUpdateResponse'];
export type ReportAppUpdateStatusRequest =
  components['schemas']['ReportAppUpdateStatusRequest'];

/** 历史命名兼容（types/release.ts 删除前的别名）。 */
export type HallAppVersion = HallAppVersionDTO;
export type CreateReleaseBody = CreateReleaseRequest;
export type SetHallVersionBody = SetHallVersionRequest;
/** sys-config Releases 页用的列表查询参数（admin 端独立类型，不在 yaml）。 */
export interface ReleaseListParams {
  platform?: string;
  page?: number;
  page_size?: number;
}
// 不暴露 RequestUploadBody/RequestUploadResult 别名 ——
// content context 已在 client.ts 上半部分用了 RequestUploadResult（content STS 凭证）；
// release 上传凭证别名留在 api/release.ts 局部定义，避免命名冲突。

export const releaseClient = {
  requestReleaseUpload(
    body: RequestReleaseUploadRequest,
  ): Promise<RequestReleaseUploadResponse> {
    return unwrap(
      request.post<ApiEnvelope<RequestReleaseUploadResponse>>(
        '/api/v1/releases/request-upload',
        body,
      ),
    );
  },
  createRelease(body: CreateReleaseRequest): Promise<AppRelease> {
    return unwrap(request.post<ApiEnvelope<AppRelease>>('/api/v1/releases', body));
  },
  listReleases(params: ReleaseListParams): Promise<PageData<AppRelease>> {
    return unwrap(
      request.get<ApiEnvelope<PageData<AppRelease>>>('/api/v1/releases', { params }),
    );
  },
  deleteRelease(id: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/releases/${id}`));
  },
  setHallAppVersion(hallId: number, body: SetHallVersionRequest): Promise<void> {
    return unwrap(
      request.put<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/app-version`, body),
    );
  },
  getHallAppVersion(hallId: number): Promise<HallAppVersionDTO | null> {
    return unwrap(
      request.get<ApiEnvelope<HallAppVersionDTO | null>>(
        `/api/v1/halls/${hallId}/app-version`,
      ),
    );
  },
  notifyAppUpdate(hallId: number, body: NotifyAppUpdateRequest): Promise<void> {
    return unwrap(
      request.post<ApiEnvelope<void>>(`/api/v1/halls/${hallId}/notify-update`, body),
    );
  },
  checkAppUpdate(params: {
    platform: string;
    arch?: string;
    current_version: string;
    hall_id?: number;
  }): Promise<CheckAppUpdateResponse> {
    return unwrap(
      request.get<ApiEnvelope<CheckAppUpdateResponse>>('/api/v1/app/check-update', { params }),
    );
  },
  reportAppUpdateStatus(body: ReportAppUpdateStatusRequest): Promise<void> {
    return unwrap(request.patch<ApiEnvelope<void>>('/api/v1/app/update-status', body));
  },
};

/* ---- release context 破坏测试锚点（Phase 3-D） ---- */

/**
 * 显式访问 HallAppVersionDTO.rollout_status + target_version —— 破坏测试锚点。
 */
export function hallAppVersionInProgress(v: HallAppVersionDTO): boolean {
  return v.rollout_status === 'rolling' && v.target_version !== '';
}

/**
 * 显式访问 CheckAppUpdateResponse.update_available + version —— 破坏测试锚点。
 */
export function checkUpdateHasNewVersion(r: CheckAppUpdateResponse): string | null {
  return r.update_available && r.version ? r.version : null;
}

/* ============================================================
 * NAS-Archive context typed client（3 个端点）—— Phase 3-D
 *
 * 与 002-FMS 项目无关（命名巧合），是 ExCS 内部归档同步监控。
 * /sys-configs/nas/regenerate-token 属 sys-config context，留 Phase 3-E。
 * ============================================================ */

export type NASArchiveListItem = components['schemas']['NASArchiveListItem'];
export type NASArchiveListPage = components['schemas']['NASArchiveListPage'];
export type NASArchiveStats = components['schemas']['NASArchiveStats'];
export type NASArchiveAgentStatus = components['schemas']['NASArchiveAgentStatus'];
export type NASArchiveRetryResponse = components['schemas']['NASArchiveRetryResponse'];

/** 历史命名兼容（types/nas.ts 删除前的别名）。 */
export type NASStats = NASArchiveStats;
/** Agent 心跳（前端 NASBucketCard / OssBrowserPage 渲染时引用）。 */
export type NASAgentHeartbeatStatus = NASArchiveAgentStatus;
/** 同步状态字面量（兼容 types/nas.ts NASSyncStatus union）。 */
export type NASSyncStatus = NASArchiveListItem['status'];
/** Phase 3-E：sys-config 已 typed 化，NASRegenerateTokenResp 迁到 sysConfigClient.regenerateNASToken；
 * 这里保留 type alias 以兼容老调用方。 */
export type NASRegenerateTokenResp = components['schemas']['RegenerateNASTokenResponse'];
/** 列表查询参数（兼容 NASArchiveListParams）。 */
export interface NASArchiveListParams {
  hall_id?: number;
  exhibit_id?: number;
  uploader_id?: number;
  status?: NASSyncStatus | '';
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

export const nasArchiveClient = {
  listNASArchives(params: NASArchiveListParams): Promise<NASArchiveListPage> {
    return unwrap(
      request.get<ApiEnvelope<NASArchiveListPage>>('/api/v1/nas-archive/list', { params }),
    );
  },
  getNASArchiveStats(): Promise<NASArchiveStats> {
    return unwrap(request.get<ApiEnvelope<NASArchiveStats>>('/api/v1/nas-archive/stats'));
  },
  retryNASArchive(id: number): Promise<NASArchiveRetryResponse> {
    return unwrap(
      request.post<ApiEnvelope<NASArchiveRetryResponse>>(`/api/v1/nas-archive/${id}/retry`),
    );
  },
};

/* ---- nas-archive context 破坏测试锚点（Phase 3-D） ---- */

/**
 * 显式访问 NASArchiveListItem.status + retry_count —— 破坏测试锚点。
 */
export function nasArchiveNeedsAttention(item: NASArchiveListItem): boolean {
  return item.status === 'failed' || item.retry_count > 0;
}

/* ============================================================
 * Sys-Config context typed client（6 个端点）—— Phase 3-E
 *
 * /branding 是公开端点，与其他 admin 端点装在同一个 client；前端透明调用。
 * NASRegenerateTokenResp 跨 nas-archive ↔ sys-config 共用类型，统一在此层 export。
 * ============================================================ */

export type BrandingInfo = components['schemas']['BrandingInfo'];
export type SysConfigItem = components['schemas']['SysConfigItem'];
export type SysConfigGroupInfo = components['schemas']['SysConfigGroupInfo'];
export type SysConfigGroupData = components['schemas']['SysConfigGroupData'];
export type UpdateSysConfigItem = components['schemas']['UpdateSysConfigItem'];
export type UpdateSysConfigsRequest = components['schemas']['UpdateSysConfigsRequest'];
export type UploadLogoResponse = components['schemas']['UploadLogoResponse'];
export type RegenerateNASTokenResponse = components['schemas']['RegenerateNASTokenResponse'];

/** 历史命名兼容（types/sysConfig.ts 删除前的别名）。 */
export type ConfigItem = SysConfigItem;
export type GroupInfo = SysConfigGroupInfo;
export type ConfigGroupData = SysConfigGroupData;

export const sysConfigClient = {
  /** 公开端点（无需登录）。 */
  getBranding(): Promise<BrandingInfo> {
    return unwrap(request.get<ApiEnvelope<BrandingInfo>>('/api/v1/branding'));
  },
  listSysConfigGroups(): Promise<SysConfigGroupInfo[]> {
    return unwrap(request.get<ApiEnvelope<SysConfigGroupInfo[]>>('/api/v1/sys-configs/groups'));
  },
  getSysConfigGroup(group: string): Promise<SysConfigGroupData> {
    return unwrap(
      request.get<ApiEnvelope<SysConfigGroupData>>(`/api/v1/sys-configs/${encodeURIComponent(group)}`),
    );
  },
  updateSysConfigGroup(
    group: string,
    items: UpdateSysConfigItem[],
  ): Promise<void> {
    const body: UpdateSysConfigsRequest = { items };
    return unwrap(
      request.put<ApiEnvelope<void>>(
        `/api/v1/sys-configs/${encodeURIComponent(group)}`,
        body,
      ),
    );
  },
  /** Logo 上传 —— multipart/form-data，axios 会自动设置 boundary。 */
  uploadBrandingLogo(file: File): Promise<UploadLogoResponse> {
    const form = new FormData();
    form.append('file', file);
    return unwrap(
      request.post<ApiEnvelope<UploadLogoResponse>>('/api/v1/branding/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
  },
  regenerateNASToken(): Promise<RegenerateNASTokenResponse> {
    return unwrap(
      request.post<ApiEnvelope<RegenerateNASTokenResponse>>(
        '/api/v1/sys-configs/nas/regenerate-token',
      ),
    );
  },
};

/* ---- sys-config context 破坏测试锚点（Phase 3-E） ---- */

/**
 * 显式访问 BrandingInfo.company_name + system_name —— 破坏测试锚点。
 */
export function brandingTitle(b: BrandingInfo): string {
  return b.system_name + ' · ' + b.company_name;
}

/**
 * 显式访问 SysConfigItem.is_sensitive + value —— 破坏测试锚点。
 * 用于前端列表渲染："已加密" / 实际值。
 */
export function sysConfigDisplayValue(it: SysConfigItem): string {
  if (it.is_sensitive && it.value === '') return '（未设置）';
  return it.value;
}

/* ============================================================
 * Operation-Logs context typed client（2 个端点）—— Phase 3-E
 *
 * exportOperationLogs 走 axios blob 路径（CSV 字节流），不剥 envelope。
 * ============================================================ */

export type OperationLogItem = components['schemas']['OperationLogItem'];
export type OperationLogPage = components['schemas']['OperationLogPage'];

/** 列表查询参数（与 ListOperationLogsParams 等价的命名接口）。 */
export interface OperationLogParams {
  hall_id?: number;
  user_id?: number;
  action?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export const operationLogsClient = {
  listOperationLogs(params: OperationLogParams): Promise<OperationLogPage> {
    return unwrap(
      request.get<ApiEnvelope<OperationLogPage>>('/api/v1/operation-logs', { params }),
    );
  },
  /** CSV 字节流（含 UTF-8 BOM）；token query 兜底浏览器直链。 */
  exportOperationLogs(
    params: Omit<OperationLogParams, 'page' | 'page_size'> & { token?: string },
  ): Promise<Blob> {
    return request
      .get<Blob>('/api/v1/operation-logs/export', {
        params,
        responseType: 'blob',
      })
      .then((res) => res.data);
  },
};

/* ---- operation-logs context 破坏测试锚点（Phase 3-E） ---- */

/**
 * 显式访问 OperationLogItem.action + target_type + target_id —— 破坏测试锚点。
 * 前端日志条目摘要展示常用。
 */
export function operationLogSummary(item: OperationLogItem): string {
  return `[${item.action}] ${item.target_type}#${item.target_id}`;
}

/* ============================================================
 * Device-Catalog context typed client（16 个端点）—— Phase 3-E
 *
 * 包含 read（7）+ write（9）。命令的 params_schema 走 free-form Record（hall context
 * DeviceInfoMetaKnown 同模式），UI 编辑器在 components/device-catalog/ 内部消化。
 * ============================================================ */

export type DeviceCategoryDTO = components['schemas']['DeviceCategoryDTO'];
export type DeviceSubcategoryDTO = components['schemas']['DeviceSubcategoryDTO'];
export type DeviceBrandDTO = components['schemas']['DeviceBrandDTO'];
export type DeviceCommandDTO = components['schemas']['DeviceCommandDTO'];
export type DeviceCommandInput = components['schemas']['DeviceCommandInput'];
export type DeviceModelStatus = components['schemas']['DeviceModelStatus'];
export type DeviceModelListItem = components['schemas']['DeviceModelListItem'];
export type DeviceModelListPage = components['schemas']['DeviceModelListPage'];
export type DeviceModelDetail = components['schemas']['DeviceModelDetail'];
export type CreateDeviceBrandRequest = components['schemas']['CreateDeviceBrandRequest'];
export type UpdateDeviceBrandRequest = components['schemas']['UpdateDeviceBrandRequest'];
export type CreateDeviceModelRequest = components['schemas']['CreateDeviceModelRequest'];
export type UpdateDeviceModelRequest = components['schemas']['UpdateDeviceModelRequest'];
export type ProtocolBaselineListItem = components['schemas']['ProtocolBaselineListItem'];
export type ProtocolBaselineDetail = components['schemas']['ProtocolBaselineDetail'];
export type UpdateProtocolBaselineRequest = components['schemas']['UpdateProtocolBaselineRequest'];
export type DeprecateDeviceModelResponse = components['schemas']['DeprecateDeviceModelResponse'];

/** params_schema / connection_schema 的 free-form Record 视图（types/deviceProtocolBaseline.ts 兼容别名）。 */
export type ParamsSchema = Record<string, unknown>;
export type ConnectionSchema = Record<string, unknown>;

/** 历史命名兼容（types/device*.ts 删除前的别名）。 */
export type ProtocolCommand = DeviceCommandInput;
export type ProtocolBaselineListItemDTO = ProtocolBaselineListItem;
export type ProtocolBaselineDetailDTO = ProtocolBaselineDetail;
export type CreateBrandBody = CreateDeviceBrandRequest;
export type UpdateBrandBody = UpdateDeviceBrandRequest;
export type CreateModelBody = CreateDeviceModelRequest;
export type UpdateModelBody = UpdateDeviceModelRequest;
export type UpdateProtocolBaselineBody = UpdateProtocolBaselineRequest;

/** 列表查询参数 typed 视图（与 ListDeviceBrandsParams / ListDeviceModelsParams 等价）。 */
export interface BrandListQuery {
  subcategory_id?: number;
}
export interface ModelListQuery {
  subcategory_id?: number;
  brand_id?: number;
  keyword?: string;
  status?: DeviceModelStatus;
  page?: number;
  page_size?: number;
}

export const deviceCatalogClient = {
  /* ---- read (7) ---- */
  listDeviceCategories(): Promise<DeviceCategoryDTO[]> {
    return unwrap(request.get<ApiEnvelope<DeviceCategoryDTO[]>>('/api/v1/device-categories'));
  },
  listDeviceSubcategories(categoryId?: number): Promise<DeviceSubcategoryDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<DeviceSubcategoryDTO[]>>('/api/v1/device-subcategories', {
        params: categoryId !== undefined ? { category_id: categoryId } : undefined,
      }),
    );
  },
  listDeviceBrands(params?: BrandListQuery): Promise<DeviceBrandDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<DeviceBrandDTO[]>>('/api/v1/device-brands', { params }),
    );
  },
  listDeviceModels(params?: ModelListQuery): Promise<DeviceModelListPage> {
    return unwrap(
      request.get<ApiEnvelope<DeviceModelListPage>>('/api/v1/device-models', { params }),
    );
  },
  getDeviceModel(id: number): Promise<DeviceModelDetail> {
    return unwrap(
      request.get<ApiEnvelope<DeviceModelDetail>>(`/api/v1/device-models/${id}`),
    );
  },
  listProtocolBaselines(): Promise<ProtocolBaselineListItem[]> {
    return unwrap(
      request.get<ApiEnvelope<ProtocolBaselineListItem[]>>('/api/v1/protocol-baselines'),
    );
  },
  getProtocolBaseline(protocol: string): Promise<ProtocolBaselineDetail> {
    return unwrap(
      request.get<ApiEnvelope<ProtocolBaselineDetail>>(
        `/api/v1/protocol-baselines/${encodeURIComponent(protocol)}`,
      ),
    );
  },

  /* ---- write (9) ---- */
  createDeviceBrand(body: CreateDeviceBrandRequest): Promise<DeviceBrandDTO> {
    return unwrap(request.post<ApiEnvelope<DeviceBrandDTO>>('/api/v1/device-brands', body));
  },
  updateDeviceBrand(id: number, body: UpdateDeviceBrandRequest): Promise<DeviceBrandDTO> {
    return unwrap(request.put<ApiEnvelope<DeviceBrandDTO>>(`/api/v1/device-brands/${id}`, body));
  },
  deleteDeviceBrand(id: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/device-brands/${id}`));
  },
  createDeviceModel(body: CreateDeviceModelRequest): Promise<DeviceModelDetail> {
    return unwrap(request.post<ApiEnvelope<DeviceModelDetail>>('/api/v1/device-models', body));
  },
  updateDeviceModel(id: number, body: UpdateDeviceModelRequest): Promise<DeviceModelDetail> {
    return unwrap(
      request.put<ApiEnvelope<DeviceModelDetail>>(`/api/v1/device-models/${id}`, body),
    );
  },
  cloneDeviceModel(id: number): Promise<DeviceModelDetail> {
    return unwrap(
      request.post<ApiEnvelope<DeviceModelDetail>>(`/api/v1/device-models/${id}/clone`),
    );
  },
  deprecateDeviceModel(id: number): Promise<DeprecateDeviceModelResponse> {
    return unwrap(
      request.post<ApiEnvelope<DeprecateDeviceModelResponse>>(
        `/api/v1/device-models/${id}/deprecate`,
      ),
    );
  },
  deleteDeviceModel(id: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/device-models/${id}`));
  },
  updateProtocolBaseline(
    protocol: string,
    body: UpdateProtocolBaselineRequest,
  ): Promise<ProtocolBaselineDetail> {
    return unwrap(
      request.put<ApiEnvelope<ProtocolBaselineDetail>>(
        `/api/v1/protocol-baselines/${encodeURIComponent(protocol)}`,
        body,
      ),
    );
  },
};

/* ---- device-catalog context 破坏测试锚点（Phase 3-E） ---- */

/**
 * 显式访问 DeviceModelListItem.command_count + status —— 破坏测试锚点。
 * 前端列表 Tag 渲染常用。
 */
export function deviceModelIsActive(m: DeviceModelListItem): boolean {
  return m.status === 'active' && m.command_count > 0;
}

/**
 * 显式访问 ProtocolBaselineDetail.protocol + commands.length —— 破坏测试锚点。
 */
export function baselineCommandCount(b: ProtocolBaselineDetail): number {
  return b.commands.length;
}

/* ============================================================
 * Dashboard context typed client（1 个端点）—— Phase 3-E
 *
 * 旧 90 天兼容路径，待 platform 看板（Phase 3-G）替代。
 * ============================================================ */

export type DashboardStats = components['schemas']['DashboardStats'];
export type DashboardDailyOnlineRate = components['schemas']['DashboardDailyOnlineRate'];
export type DashboardRecentContentItem = components['schemas']['DashboardRecentContentItem'];
export type DashboardRecentLogItem = components['schemas']['DashboardRecentLogItem'];
export type DashboardStatsResponse = components['schemas']['DashboardStatsResponse'];

/** 历史命名兼容（types/dashboard.ts 删除前的别名）。 */
export type DashboardData = DashboardStatsResponse;
export type DailyOnlineRate = DashboardDailyOnlineRate;
export type RecentContentItem = DashboardRecentContentItem;
export type RecentLogItem = DashboardRecentLogItem;

export const dashboardClient = {
  getDashboardStats(): Promise<DashboardStatsResponse> {
    return unwrap(
      request.get<ApiEnvelope<DashboardStatsResponse>>('/api/v1/dashboard/stats'),
    );
  },
};

/* ---- dashboard context 破坏测试锚点（Phase 3-E） ---- */

/**
 * 显式访问 DashboardStats.hall_count + online_device_count —— 破坏测试锚点。
 */
export function dashboardOnlineRatio(s: DashboardStats): number {
  if (s.hall_count <= 0) return 0;
  return s.online_device_count / s.hall_count;
}

/* ============================================================
 * Smarthome context typed client（25 个端点）—— Phase 3-F
 *
 * 范围：hue 5 + xiaomi 5 + rules 9 + trigger-logs 1 + health 3 + alerts 2。
 * 服务层无 binding:"oneof" 约束（grep 0 命中）；GatewayStatus / SSEStatus /
 * ConditionType / ActionType / AlertLevel 在 yaml 保持 free-form string，
 * 前端按需用窄化字面量 cast（Phase 3-A 陷阱 #28）。
 * 5 处 json.RawMessage 透传字段（trigger.event_filter / condition.params /
 * action.params / trigger_log.event_data / trigger_log.executed_actions）gen
 * 落 *map[string]interface{} / *[]map / null；调用方 UI 限定参数 shape。
 * ControlApp 不调任何 smarthome HTTP 端点（智能家居走 MQTT 通道）。
 * ============================================================ */

export type HueBridgeDTO = components['schemas']['HueBridgeDTO'];
export type CreateHueBridgeRequest = components['schemas']['CreateHueBridgeRequest'];
export type UpdateHueBridgeRequest = components['schemas']['UpdateHueBridgeRequest'];
export type XiaomiGatewayDTO = components['schemas']['XiaomiGatewayDTO'];
export type CreateXiaomiGatewayRequest = components['schemas']['CreateXiaomiGatewayRequest'];
export type UpdateXiaomiGatewayRequest = components['schemas']['UpdateXiaomiGatewayRequest'];
export type EventRuleDTO = components['schemas']['EventRuleDTO'];
export type RuleTriggerDTO = components['schemas']['RuleTriggerDTO'];
export type RuleConditionDTO = components['schemas']['RuleConditionDTO'];
export type RuleActionDTO = components['schemas']['RuleActionDTO'];
export type CreateRuleTriggerInput = components['schemas']['CreateRuleTriggerInput'];
export type CreateRuleConditionInput = components['schemas']['CreateRuleConditionInput'];
export type CreateRuleActionInput = components['schemas']['CreateRuleActionInput'];
export type CreateEventRuleRequest = components['schemas']['CreateEventRuleRequest'];
export type UpdateEventRuleRequest = components['schemas']['UpdateEventRuleRequest'];
export type SetRuleDebugModeRequest = components['schemas']['SetRuleDebugModeRequest'];
export type DryRunResultDTO = components['schemas']['DryRunResultDTO'];
export type DryRunActionPreview = components['schemas']['DryRunActionPreview'];
export type TriggerLogDTO = components['schemas']['TriggerLogDTO'];
export type TriggerLogPage = components['schemas']['TriggerLogPage'];
export type DeviceHealthDTO = components['schemas']['DeviceHealthDTO'];
export type GatewayHealthDTO = components['schemas']['GatewayHealthDTO'];
export type AlertDTO = components['schemas']['AlertDTO'];
export type AckAlertRequest = components['schemas']['AckAlertRequest'];

/** 历史命名兼容别名（types/smarthome.ts 删除后旧调用点迁移 import 用）。 */
export type CreateHueBridgeBody = CreateHueBridgeRequest;
export type UpdateHueBridgeBody = UpdateHueBridgeRequest;
export type CreateXiaomiGatewayBody = CreateXiaomiGatewayRequest;
export type UpdateXiaomiGatewayBody = UpdateXiaomiGatewayRequest;
export type CreateRuleBody = CreateEventRuleRequest;
export type UpdateRuleBody = UpdateEventRuleRequest;
export type CreateTriggerBody = CreateRuleTriggerInput;
export type CreateConditionBody = CreateRuleConditionInput;
export type CreateActionBody = CreateRuleActionInput;
export type ActionPreview = DryRunActionPreview;

/** Smarthome 网关连接状态字面量（service 层未 enum 校验，仅前端窄化用）。 */
export type GatewayStatus = 'online' | 'offline' | 'pairing';

/** Hue SSE 流状态字面量（service 层 free-form，仅前端窄化用）。 */
export type SSEStatus = 'connected' | 'disconnected' | 'reconnecting';

/** 规则条件类型字面量（service 层 type alias = string，仅前端窄化用；smarthome 专用）。 */
export type SmarthomeConditionType = 'time_range' | 'device_state' | 'scene_state';

/** 规则动作类型字面量（smarthome 专用）。
 * 注意：show context 已声明 `ActionType`（'device' | 'scene' | 'media'），跨 context 命名碰撞
 * （Phase 3-D 陷阱 #34），smarthome 这里加 Smarthome 前缀避开 TS2300 重复声明。
 * 调用方写 `import type { SmarthomeActionType } from '@/api/gen/client'` 即可。 */
export type SmarthomeActionType = 'switch_scene' | 'device_cmd' | 'delay';

/** 告警级别字面量（service alert_service.go 实际填 P0/P1/P2；非 enum 校验）。 */
export type AlertLevel = 'P0' | 'P1' | 'P2';

/** 智能家居事件类型字面量（service 层未 enum 校验，仅前端 EVENT_TYPE_LABELS 用）。 */
export type SmartHomeEventType =
  | 'motion_detected'
  | 'motion_cleared'
  | 'button_pressed'
  | 'switch_on'
  | 'switch_off'
  | 'temperature_alarm'
  | 'humidity_alarm'
  | 'device_online'
  | 'device_offline';

/** 触发日志列表查询参数（与 ListTriggerLogsParams 对齐；page/page_size 必填，其他可选）。 */
export interface TriggerLogListParams {
  hall_id: number;
  rule_id?: string;
  device_id?: number;
  event_type?: string;
  triggered_only?: boolean;
  skip_only?: boolean;
  since?: string;
  until?: string;
  page: number;
  page_size: number;
}

export const smarthomeClient = {
  /* ---------- Hue Bridge ---------- */
  listHueBridges(hallId: number): Promise<HueBridgeDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<HueBridgeDTO[]>>('/api/v1/smarthome/hue-bridges', {
        params: { hall_id: hallId },
      }),
    );
  },
  getHueBridge(id: number): Promise<HueBridgeDTO> {
    return unwrap(request.get<ApiEnvelope<HueBridgeDTO>>(`/api/v1/smarthome/hue-bridges/${id}`));
  },
  createHueBridge(body: CreateHueBridgeRequest): Promise<HueBridgeDTO> {
    return unwrap(request.post<ApiEnvelope<HueBridgeDTO>>('/api/v1/smarthome/hue-bridges', body));
  },
  updateHueBridge(id: number, body: UpdateHueBridgeRequest): Promise<HueBridgeDTO> {
    return unwrap(
      request.put<ApiEnvelope<HueBridgeDTO>>(`/api/v1/smarthome/hue-bridges/${id}`, body),
    );
  },
  deleteHueBridge(id: number): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/smarthome/hue-bridges/${id}`));
  },

  /* ---------- Xiaomi Gateway ---------- */
  listXiaomiGateways(hallId: number): Promise<XiaomiGatewayDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<XiaomiGatewayDTO[]>>('/api/v1/smarthome/xiaomi-gateways', {
        params: { hall_id: hallId },
      }),
    );
  },
  getXiaomiGateway(id: number): Promise<XiaomiGatewayDTO> {
    return unwrap(
      request.get<ApiEnvelope<XiaomiGatewayDTO>>(`/api/v1/smarthome/xiaomi-gateways/${id}`),
    );
  },
  createXiaomiGateway(body: CreateXiaomiGatewayRequest): Promise<XiaomiGatewayDTO> {
    return unwrap(
      request.post<ApiEnvelope<XiaomiGatewayDTO>>('/api/v1/smarthome/xiaomi-gateways', body),
    );
  },
  updateXiaomiGateway(id: number, body: UpdateXiaomiGatewayRequest): Promise<XiaomiGatewayDTO> {
    return unwrap(
      request.put<ApiEnvelope<XiaomiGatewayDTO>>(`/api/v1/smarthome/xiaomi-gateways/${id}`, body),
    );
  },
  deleteXiaomiGateway(id: number): Promise<void> {
    return unwrap(
      request.delete<ApiEnvelope<void>>(`/api/v1/smarthome/xiaomi-gateways/${id}`),
    );
  },

  /* ---------- EventRule ---------- */
  listEventRules(hallId: number): Promise<EventRuleDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<EventRuleDTO[]>>('/api/v1/smarthome/rules', {
        params: { hall_id: hallId },
      }),
    );
  },
  getEventRule(id: string): Promise<EventRuleDTO> {
    return unwrap(request.get<ApiEnvelope<EventRuleDTO>>(`/api/v1/smarthome/rules/${id}`));
  },
  createEventRule(body: CreateEventRuleRequest): Promise<EventRuleDTO> {
    return unwrap(request.post<ApiEnvelope<EventRuleDTO>>('/api/v1/smarthome/rules', body));
  },
  updateEventRule(id: string, body: UpdateEventRuleRequest): Promise<EventRuleDTO> {
    return unwrap(request.put<ApiEnvelope<EventRuleDTO>>(`/api/v1/smarthome/rules/${id}`, body));
  },
  deleteEventRule(id: string): Promise<void> {
    return unwrap(request.delete<ApiEnvelope<void>>(`/api/v1/smarthome/rules/${id}`));
  },
  enableEventRule(id: string): Promise<void> {
    return unwrap(request.post<ApiEnvelope<void>>(`/api/v1/smarthome/rules/${id}/enable`));
  },
  disableEventRule(id: string): Promise<void> {
    return unwrap(request.post<ApiEnvelope<void>>(`/api/v1/smarthome/rules/${id}/disable`));
  },
  setRuleDebugMode(id: string, debug: boolean): Promise<void> {
    return unwrap(
      request.put<ApiEnvelope<void>>(`/api/v1/smarthome/rules/${id}/debug`, { debug }),
    );
  },
  dryRunEventRule(id: string): Promise<DryRunResultDTO> {
    return unwrap(
      request.post<ApiEnvelope<DryRunResultDTO>>(`/api/v1/smarthome/rules/${id}/dry-run`),
    );
  },

  /* ---------- Trigger Logs ---------- */
  listTriggerLogs(params: TriggerLogListParams): Promise<TriggerLogPage> {
    return unwrap(
      request.get<ApiEnvelope<TriggerLogPage>>('/api/v1/smarthome/trigger-logs', { params }),
    );
  },

  /* ---------- Device / Gateway Health ---------- */
  listDeviceHealth(hallId: number): Promise<DeviceHealthDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<DeviceHealthDTO[]>>('/api/v1/smarthome/health', {
        params: { hall_id: hallId },
      }),
    );
  },
  listGatewayHealth(hallId: number): Promise<GatewayHealthDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<GatewayHealthDTO[]>>('/api/v1/smarthome/health/gateways', {
        params: { hall_id: hallId },
      }),
    );
  },
  listDeviceHealthHistory(deviceId: number, since?: string): Promise<DeviceHealthDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<DeviceHealthDTO[]>>(
        `/api/v1/smarthome/health/${deviceId}/history`,
        since ? { params: { since } } : {},
      ),
    );
  },

  /* ---------- Alerts ---------- */
  listSmarthomeAlerts(hallId: number): Promise<AlertDTO[]> {
    return unwrap(
      request.get<ApiEnvelope<AlertDTO[]>>('/api/v1/smarthome/alerts', {
        params: { hall_id: hallId },
      }),
    );
  },
  ackSmarthomeAlert(alertKey: string): Promise<void> {
    return unwrap(
      request.post<ApiEnvelope<void>>('/api/v1/smarthome/alerts/ack', { alert_key: alertKey }),
    );
  },
};

/* ---- smarthome context 破坏测试锚点（Phase 3-F） ---- */

/**
 * 显式访问 HueBridgeDTO.bridge_id + status —— 破坏测试锚点。
 * Hue Bridge 的 bridge_id（厂商 ID）是判重 key；status 是网关连接状态。
 */
export function hueBridgeIsOnline(b: HueBridgeDTO): boolean {
  return b.bridge_id !== '' && b.status === 'online';
}

/**
 * 显式访问 EventRuleDTO.enabled + cooldown_sec + version —— 破坏测试锚点。
 * 规则 enabled 决定 sidecar 是否同步；version 用于乐观锁 / 历史溯源。
 */
export function eventRuleIsActive(r: EventRuleDTO): boolean {
  return r.enabled && r.cooldown_sec >= 0 && r.version > 0;
}

/**
 * 显式访问 TriggerLogDTO.triggered + skip_reason + event_type —— 破坏测试锚点。
 */
export function triggerLogSummary(l: TriggerLogDTO): string {
  return l.triggered
    ? `triggered:${l.event_type}`
    : `skipped:${l.event_type}(${l.skip_reason})`;
}

/**
 * 显式访问 AlertDTO.level + event_type + key —— 破坏测试锚点。
 * Ack 时 key 回传给 /alerts/ack；level 决定通知优先级 P0/P1/P2。
 */
export function alertNeedsAck(a: AlertDTO): boolean {
  return a.key !== '' && (a.level === 'P0' || a.level === 'P1') && a.event_type !== '';
}

/**
 * 显式访问 DeviceHealthDTO.online + battery_level + error_count_1h —— 破坏测试锚点。
 * battery_level 是 *int（无电池设备为 null）；前端展示低电量预警依赖之。
 */
export function deviceHealthIsHealthy(d: DeviceHealthDTO): boolean {
  if (!d.online) return false;
  if (d.error_count_1h > 10) return false;
  if (d.battery_level != null && d.battery_level < 20) return false;
  return true;
}

/* ============================================================
 * Authz context typed client（32 个端点；Phase 3-G）
 *
 * 跨 context 字面量命名：authz 的 ScopeType / RiskLevel / AccountType / GrantStatusType /
 * VendorStatus / TemplateStatus / AuditStatus 当前与 client.ts 已有字面量无碰撞（grep 0 命中），
 * 不需 Phase 3-F #40 模式的前缀加固。如未来 show / smarthome 等新增同名再启用前缀。
 * ============================================================ */

/* ---- authz schema 类型 re-export ---- */

export type ResourceRef = components['schemas']['ResourceRef'];
/**
 * 前端 can() helper 用的 ResourceRef 扩展型：可选携带 hall_id / exhibit_id /
 * vendor_id / tenant_id 用于 H/E/T/O scope 的 fail-safe 匹配。
 *
 * 这些字段不在 wire 契约里（yaml ResourceRef 只有 type / id），是纯前端约定：
 * 调用方在传入资源对象时，若同时知道父展厅 / vendor 等，把它们附在 hint 字段上能
 * 减少 can() 判错率。判不准时一律返回 false，由后端 403 兜底。
 */
export interface ResourceRefHint extends ResourceRef {
  hall_id?: string | number;
  exhibit_id?: string | number;
  vendor_id?: string | number;
  tenant_id?: string | number;
}
export type ScopeSelector = components['schemas']['ScopeSelector'];
export type GrantRef = components['schemas']['GrantRef'];
export type PermissionDecision = components['schemas']['PermissionDecision'];
export type ActionDef = components['schemas']['ActionDef'];
export type ActionListResponse = components['schemas']['ActionListResponse'];
export type RoleTemplate = components['schemas']['RoleTemplate'];
export type Grant = components['schemas']['Grant'];
export type UserActionEntry = components['schemas']['UserActionEntry'];
export type UserActionSet = components['schemas']['UserActionSet'];
export type UserAuthzView = components['schemas']['UserAuthzView'];
export type ResourceAuthzView = components['schemas']['ResourceAuthzView'];
export type ExplanationResult = components['schemas']['ExplanationResult'];
export type Vendor = components['schemas']['Vendor'];
export type VendorUser = components['schemas']['VendorUser'];
export type VendorListResp = components['schemas']['VendorListResp'];
export type VendorDetailResp = components['schemas']['VendorDetailResp'];
export type CreateVendorRequest = components['schemas']['CreateVendorRequest'];
export type CreateVendorResponse = components['schemas']['CreateVendorResponse'];
export type UpdateVendorRequest = components['schemas']['UpdateVendorRequest'];
export type SuspendVendorRequest = components['schemas']['SuspendVendorRequest'];
export type VendorIDStatusResult = components['schemas']['VendorIDStatusResult'];
export type ExtendVendorRequest = components['schemas']['ExtendVendorRequest'];
export type ExtendVendorResult = components['schemas']['ExtendVendorResult'];
export type TransferPrimaryRequest = components['schemas']['TransferPrimaryRequest'];
export type TransferPrimaryResult = components['schemas']['TransferPrimaryResult'];
export type InviteMemberRequest = components['schemas']['InviteMemberRequest'];
export type InviteMemberResponse = components['schemas']['InviteMemberResponse'];
export type SuspendMemberResult = components['schemas']['SuspendMemberResult'];
export type InviteInfo = components['schemas']['InviteInfo'];
export type AuditLog = components['schemas']['AuditLog'];
export type AuditLogListResponse = components['schemas']['AuditLogListResponse'];
export type ReportCounts = components['schemas']['ReportCounts'];
export type VendorUploadCounts = components['schemas']['VendorUploadCounts'];
export type GrantDistribution = components['schemas']['GrantDistribution'];
export type GrantsExpiringReport = components['schemas']['GrantsExpiringReport'];
export type GrantExpiringSummary = components['schemas']['GrantExpiringSummary'];
export type DatePointInt = components['schemas']['DatePointInt'];
export type KeyCount = components['schemas']['KeyCount'];
export type IDResult = components['schemas']['IDResult'];
export type ExtendGrantResult = components['schemas']['ExtendGrantResult'];
export type TemplateListResp = components['schemas']['TemplateListResp'];
export type GrantListResp = components['schemas']['GrantListResp'];
export type CreateGrantRequest = components['schemas']['CreateGrantRequest'];
export type RevokeGrantRequest = components['schemas']['RevokeGrantRequest'];
export type ExtendGrantRequest = components['schemas']['ExtendGrantRequest'];
export type CreateRoleTemplateRequest = components['schemas']['CreateRoleTemplateRequest'];
export type UpdateRoleTemplateRequest = components['schemas']['UpdateRoleTemplateRequest'];
export type CopyRoleTemplateRequest = components['schemas']['CopyRoleTemplateRequest'];

/* ---- 历史命名兼容别名（Phase 3-G 前 types/authz.ts 用 *Body 命名；保留供调用方零改动迁移） ---- */

export type CreateRoleTemplateBody = CreateRoleTemplateRequest;
export type UpdateRoleTemplateBody = UpdateRoleTemplateRequest;
export type CopyRoleTemplateBody = CopyRoleTemplateRequest;
export type CreateGrantBody = CreateGrantRequest;
export type RevokeGrantBody = RevokeGrantRequest;
export type ExtendGrantBody = ExtendGrantRequest;
export type CreateVendorBody = CreateVendorRequest;
export type UpdateVendorBody = UpdateVendorRequest;
export type InviteMemberBody = InviteMemberRequest;
export type ExplainResult = ExplanationResult;
export type VendorMember = VendorUser;
export type VendorDetailResponse = VendorDetailResp;

/* ---- 前端窄化字面量（service 层 free-form string；前端 Tag / 颜色映射用） ---- */

export type ScopeType = 'G' | 'T' | 'H' | 'E' | 'O';
export type RiskLevel = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AccountType = 'internal' | 'vendor' | 'customer';
export type GrantStatusType = 'active' | 'expired' | 'revoked';
export type VendorStatus = 'active' | 'suspended' | 'archived';
/**
 * authz 角色模板状态。注意 `TemplateStatus` 名已被 ai context 占用
 * （avatar 模板的上传状态 'uploading'|'processing'|'ready'|'error'），所以这里加 Authz 前缀避碰撞
 * （Phase 3-F 陷阱 #40 模式：跨 context 同名字面量加 context 前缀）。
 */
export type AuthzTemplateStatus = 'active' | 'deprecated';
export type AuditStatus = 'success' | 'failure';

/** 后端 403 结构化响应体（axios interceptor 对齐；与 yaml common.yaml#/PermissionDenied 同形） */
export type PermissionDeniedReason =
  | 'no_grants'
  | 'action_not_granted'
  | 'resource_out_of_scope'
  | 'grant_expired'
  | 'user_suspended';

export interface PermissionDeniedBody {
  error: 'permission_denied';
  action: string;
  reason: PermissionDeniedReason;
  resource?: { type: string; id: string };
  hint?: string;
}

/* ---- query / 列表参数（前端 hooks / 调用方用） ---- */

export interface ListGrantsQuery {
  user_id?: number;
  scope_type?: ScopeType;
  scope_id?: string;
  include_inactive?: boolean;
}

export interface AuditLogQueryParams {
  actor_user_id?: number;
  action_code?: string;
  resource_type?: string;
  resource_id?: string;
  status?: AuditStatus;
  from?: string;
  to?: string;
  page_size?: number;
  offset?: number;
}

/** Phase 11.4 老别名（pages/authz/AuditLogListPage.tsx 用 AuditLogRow 名称） */
export type AuditLogRow = AuditLog;

/* ---- typed authzClient ---- */

export const authzClient = {
  /* 角色模板 */
  listRoleTemplates(): Promise<TemplateListResp> {
    return unwrap(request.get<ApiEnvelope<TemplateListResp>>('/api/v1/authz/role-templates'));
  },
  getRoleTemplate(id: number): Promise<RoleTemplate> {
    return unwrap(request.get<ApiEnvelope<RoleTemplate>>(`/api/v1/authz/role-templates/${id}`));
  },
  createRoleTemplate(body: CreateRoleTemplateRequest): Promise<RoleTemplate> {
    return unwrap(request.post<ApiEnvelope<RoleTemplate>>('/api/v1/authz/role-templates', body));
  },
  updateRoleTemplate(id: number, body: UpdateRoleTemplateRequest): Promise<IDResult> {
    return unwrap(request.put<ApiEnvelope<IDResult>>(`/api/v1/authz/role-templates/${id}`, body));
  },
  deleteRoleTemplate(id: number): Promise<IDResult> {
    return unwrap(request.delete<ApiEnvelope<IDResult>>(`/api/v1/authz/role-templates/${id}`));
  },
  copyRoleTemplate(id: number, body: CopyRoleTemplateRequest): Promise<RoleTemplate> {
    return unwrap(
      request.post<ApiEnvelope<RoleTemplate>>(`/api/v1/authz/role-templates/${id}/copy`, body),
    );
  },

  /* 授权 */
  listGrants(params: ListGrantsQuery = {}): Promise<GrantListResp> {
    return unwrap(request.get<ApiEnvelope<GrantListResp>>('/api/v1/authz/grants', { params }));
  },
  createGrant(body: CreateGrantRequest): Promise<Grant> {
    return unwrap(request.post<ApiEnvelope<Grant>>('/api/v1/authz/grants', body));
  },
  revokeGrant(id: number, body?: RevokeGrantRequest): Promise<IDResult> {
    return unwrap(
      request.delete<ApiEnvelope<IDResult>>(`/api/v1/authz/grants/${id}`, { data: body ?? {} }),
    );
  },
  extendGrant(id: number, body: ExtendGrantRequest): Promise<ExtendGrantResult> {
    return unwrap(
      request.post<ApiEnvelope<ExtendGrantResult>>(`/api/v1/authz/grants/${id}/extend`, body),
    );
  },

  /* 视图 / Explain */
  getUserAuthzView(userId: number): Promise<UserAuthzView> {
    return unwrap(
      request.get<ApiEnvelope<UserAuthzView>>(`/api/v1/authz/users/${userId}/authz-view`),
    );
  },
  getResourceAuthzView(type: string, id: string): Promise<ResourceAuthzView> {
    return unwrap(
      request.get<ApiEnvelope<ResourceAuthzView>>(
        `/api/v1/authz/resources/${type}/${encodeURIComponent(id)}/authz-view`,
      ),
    );
  },
  explainPermission(
    userId: number,
    action: string,
    resource?: ResourceRef,
  ): Promise<ExplanationResult> {
    const params: Record<string, string | number> = { user_id: userId, action };
    if (resource) {
      params.resource_type = resource.type;
      params.resource_id = resource.id;
    }
    return unwrap(request.get<ApiEnvelope<ExplanationResult>>('/api/v1/authz/explain', { params }));
  },
  getMyActionSet(): Promise<UserActionSet> {
    return unwrap(request.get<ApiEnvelope<UserActionSet>>('/api/v1/authz/me/action-set'));
  },
  listActions(): Promise<ActionListResponse> {
    return unwrap(request.get<ApiEnvelope<ActionListResponse>>('/api/v1/authz/actions'));
  },

  /* 审计日志 */
  queryAuditLogs(params: AuditLogQueryParams = {}): Promise<AuditLogListResponse> {
    return unwrap(
      request.get<ApiEnvelope<AuditLogListResponse>>('/api/v1/authz/audit-logs', { params }),
    );
  },
  exportAuditLogsUrl(params: AuditLogQueryParams = {}): string {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        q.append(k, String(v));
      }
    });
    return `/api/v1/authz/audit-logs/export?${q.toString()}`;
  },

  /* 报表 */
  reportGrantChanges(days = 30): Promise<ReportCounts> {
    return unwrap(
      request.get<ApiEnvelope<ReportCounts>>('/api/v1/authz/reports/grant-changes', {
        params: { days },
      }),
    );
  },
  reportRiskyActions(days = 30): Promise<ReportCounts> {
    return unwrap(
      request.get<ApiEnvelope<ReportCounts>>('/api/v1/authz/reports/risky-actions', {
        params: { days },
      }),
    );
  },
  reportVendorUploads(days = 30): Promise<VendorUploadCounts> {
    return unwrap(
      request.get<ApiEnvelope<VendorUploadCounts>>('/api/v1/authz/reports/vendor-uploads', {
        params: { days },
      }),
    );
  },
  reportGrantDistribution(): Promise<GrantDistribution> {
    return unwrap(
      request.get<ApiEnvelope<GrantDistribution>>('/api/v1/authz/reports/grant-distribution'),
    );
  },
  reportGrantsExpiring(days = 30): Promise<GrantsExpiringReport> {
    return unwrap(
      request.get<ApiEnvelope<GrantsExpiringReport>>('/api/v1/authz/reports/grants-expiring', {
        params: { days },
      }),
    );
  },

  /* Vendors */
  listVendors(): Promise<VendorListResp> {
    return unwrap(request.get<ApiEnvelope<VendorListResp>>('/api/v1/authz/vendors'));
  },
  createVendor(body: CreateVendorRequest): Promise<CreateVendorResponse> {
    return unwrap(request.post<ApiEnvelope<CreateVendorResponse>>('/api/v1/authz/vendors', body));
  },
  getVendor(id: number): Promise<VendorDetailResp> {
    return unwrap(request.get<ApiEnvelope<VendorDetailResp>>(`/api/v1/authz/vendors/${id}`));
  },
  updateVendor(id: number, body: UpdateVendorRequest): Promise<Vendor> {
    return unwrap(request.put<ApiEnvelope<Vendor>>(`/api/v1/authz/vendors/${id}`, body));
  },
  suspendVendor(id: number, body?: SuspendVendorRequest): Promise<VendorIDStatusResult> {
    return unwrap(
      request.post<ApiEnvelope<VendorIDStatusResult>>(`/api/v1/authz/vendors/${id}/suspend`, body ?? {}),
    );
  },
  extendVendor(id: number, body: ExtendVendorRequest): Promise<ExtendVendorResult> {
    return unwrap(
      request.post<ApiEnvelope<ExtendVendorResult>>(`/api/v1/authz/vendors/${id}/extend`, body),
    );
  },
  transferVendorPrimary(id: number, body: TransferPrimaryRequest): Promise<TransferPrimaryResult> {
    return unwrap(
      request.post<ApiEnvelope<TransferPrimaryResult>>(
        `/api/v1/authz/vendors/${id}/transfer-primary`,
        body,
      ),
    );
  },
  inviteVendorMember(id: number, body: InviteMemberRequest): Promise<InviteMemberResponse> {
    return unwrap(
      request.post<ApiEnvelope<InviteMemberResponse>>(
        `/api/v1/authz/vendors/${id}/members/invite`,
        body,
      ),
    );
  },
  suspendVendorMember(id: number, uid: number): Promise<SuspendMemberResult> {
    return unwrap(
      request.post<ApiEnvelope<SuspendMemberResult>>(
        `/api/v1/authz/vendors/${id}/members/${uid}/suspend`,
      ),
    );
  },
  getInvite(token: string): Promise<InviteInfo> {
    return unwrap(
      request.get<ApiEnvelope<InviteInfo>>(`/api/v1/authz/invites/${encodeURIComponent(token)}`),
    );
  },
};

/* ---- authz 破坏测试锚点（Phase 3-G） ---- */

/**
 * 显式访问 RoleTemplate.action_codes + has_critical + version —— 破坏测试锚点。
 * action_codes 是模板能力面（PRD §6.1）；version 用于缓存比对。
 */
export function roleTemplateIsActive(t: RoleTemplate): boolean {
  return t.action_codes.length > 0 && t.version > 0 && t.status === 'active';
}

/**
 * 显式访问 Grant.role_template_id + scope_type + status —— 破坏测试锚点。
 */
export function grantIsActive(g: Grant): boolean {
  return (
    g.role_template_id > 0 &&
    g.status === ('active' as GrantStatusType) &&
    g.scope_type !== ''
  );
}

/**
 * 显式访问 Vendor.primary_user_id + grant_expires_at + status —— 破坏测试锚点。
 */
export function vendorIsManageable(v: Vendor): boolean {
  return (
    v.primary_user_id > 0 &&
    !!v.grant_expires_at &&
    (v.status === ('active' as VendorStatus) || v.status === ('suspended' as VendorStatus))
  );
}

/**
 * 显式访问 ActionDef.code + risk + scope_types —— 破坏测试锚点。
 */
export function actionDefIsCritical(a: ActionDef): boolean {
  return a.code !== '' && a.risk === ('critical' as RiskLevel) && a.scope_types.length > 0;
}

/* ============================================================
 * Platform context typed client（9 个端点；Phase 3-G）
 *
 * 命名约定：domain VO（ResourceMetric / TodoItem / TrendSeries 等）gen 字段是 PascalCase（无 json tag）；
 * application DTO（RunningCardDTO / CostCardDTO 等）是 snake_case。yaml 已端到端描述真实 wire format。
 * ============================================================ */

export type ResourceMetric = components['schemas']['ResourceMetric'];
export type ResourceMetricResult = components['schemas']['ResourceMetricResult'];
export type ECSHostInfo = components['schemas']['ECSHostInfo'];
export type HostInfoResult = components['schemas']['HostInfoResult'];
export type DependencyHealth = components['schemas']['DependencyHealth'];
export type BackupJobStatus = components['schemas']['BackupJobStatus'];
export type BackupStatusResult = components['schemas']['BackupStatusResult'];
export type CertInfoDTO = components['schemas']['CertInfoDTO'];
export type PlatformDashboardResp = components['schemas']['PlatformDashboardResp'];
export type TrendSeries = components['schemas']['TrendSeries'];
export type TodoItem = components['schemas']['TodoItem'];
export type RunningCardDTO = components['schemas']['RunningCardDTO'];
export type RunningStatsDTO = components['schemas']['RunningStatsDTO'];
export type StorageBucketDTO = components['schemas']['StorageBucketDTO'];
export type StorageCapacityDTO = components['schemas']['StorageCapacityDTO'];
export type CostCardDTO = components['schemas']['CostCardDTO'];
export type CostTrendDTO = components['schemas']['CostTrendDTO'];
export type AiInteractionDTO = components['schemas']['AiInteractionDTO'];
export type BusinessTodosResp = components['schemas']['BusinessTodosResp'];
export type AuditSummaryDTO = components['schemas']['AuditSummaryDTO'];
export type AuthzAuditItemDTO = components['schemas']['AuthzAuditItemDTO'];
export type AppOpItemDTO = components['schemas']['AppOpItemDTO'];
export type AuditAuthzResp = components['schemas']['AuditAuthzResp'];
export type AuditAppOpsResp = components['schemas']['AuditAppOpsResp'];

/* ---- 前端窄化字面量 ---- */

export type ResourceLevel = 'ok' | 'warn' | 'danger';
export type BusinessPeriod = 'day' | 'week' | 'month' | 'year';
export type TodoSeverity = 'urgent' | 'warn' | 'info' | 'ok';
export type BackupKind = 'snapshot' | 'file';
export type BackupJobState =
  | 'done'
  | 'running'
  | 'failed'
  | 'delayed'
  | 'not_configured'
  | 'not_enabled';

export const platformClient = {
  getDashboard(): Promise<PlatformDashboardResp> {
    return unwrap(request.get<ApiEnvelope<PlatformDashboardResp>>('/api/v1/platform/dashboard'));
  },
  getBusinessTodos(): Promise<BusinessTodosResp> {
    return unwrap(
      request.get<ApiEnvelope<BusinessTodosResp>>('/api/v1/platform/business/todos'),
    );
  },
  getBusinessRunning(period: BusinessPeriod): Promise<RunningStatsDTO> {
    return unwrap(
      request.get<ApiEnvelope<RunningStatsDTO>>('/api/v1/platform/business/running', {
        params: { period },
      }),
    );
  },
  getBusinessStorage(): Promise<StorageCapacityDTO> {
    return unwrap(
      request.get<ApiEnvelope<StorageCapacityDTO>>('/api/v1/platform/business/storage'),
    );
  },
  getBusinessCost(period: BusinessPeriod): Promise<CostTrendDTO> {
    return unwrap(
      request.get<ApiEnvelope<CostTrendDTO>>('/api/v1/platform/business/cost', {
        params: { period },
      }),
    );
  },
  getBusinessAiInteraction(period: BusinessPeriod): Promise<AiInteractionDTO> {
    return unwrap(
      request.get<ApiEnvelope<AiInteractionDTO>>('/api/v1/platform/business/ai-interaction', {
        params: { period },
      }),
    );
  },
  getAuditSummary(date?: string): Promise<AuditSummaryDTO> {
    return unwrap(
      request.get<ApiEnvelope<AuditSummaryDTO>>('/api/v1/platform/audit/summary', {
        params: date ? { date } : undefined,
      }),
    );
  },
  getAuditAuthz(limit = 10): Promise<AuditAuthzResp> {
    return unwrap(
      request.get<ApiEnvelope<AuditAuthzResp>>('/api/v1/platform/audit/authz', {
        params: { limit },
      }),
    );
  },
  getAuditAppOps(limit = 10): Promise<AuditAppOpsResp> {
    return unwrap(
      request.get<ApiEnvelope<AuditAppOpsResp>>('/api/v1/platform/audit/app-ops', {
        params: { limit },
      }),
    );
  },
};

/* ---- platform 破坏测试锚点 ---- */

/**
 * 显式访问 PlatformDashboardResp.cpu + host + deps —— 破坏测试锚点。
 */
export function platformDashboardSummary(d: PlatformDashboardResp): string {
  const cpu = d.cpu.metric ? d.cpu.metric.Current : -1;
  const ok = d.host.host?.Status ?? 'unknown';
  return `cpu=${cpu} host=${ok} deps=${d.deps.length}`;
}

/**
 * 显式访问 RunningCardDTO.value + trend.Direction —— 破坏测试锚点。
 * Trend 是 PascalCase（domain VO 无 json tag），field 名 Direction / Series。
 */
export function runningCardTrendUp(c: RunningCardDTO): boolean {
  return c.value >= 0 && c.trend.Direction === 'up' && c.trend.Series.length === 7;
}

/**
 * 显式访问 TodoItem.Code + Severity（PascalCase）+ LinkPath —— 破坏测试锚点。
 */
export function todoNeedsAction(t: TodoItem): boolean {
  return (
    t.Code !== '' &&
    (t.Severity === ('urgent' as TodoSeverity) || t.Severity === ('warn' as TodoSeverity)) &&
    t.LinkPath !== ''
  );
}

/* ============================================================
 * UserMessage context typed client（4 个端点；Phase 3-G）
 * ============================================================ */

export type UserMessageDTO = components['schemas']['UserMessageDTO'];
export type UserMessageListResult = components['schemas']['UserMessageListResult'];
export type UnreadCountResult = components['schemas']['UnreadCountResult'];
export type MarkReadResult = components['schemas']['MarkReadResult'];
export type MarkAllReadResult = components['schemas']['MarkAllReadResult'];

/** 历史命名兼容（types/userMessage.ts 用 UserMessage 名称） */
export type UserMessage = UserMessageDTO;

/** 消息类型字面量（service 层 free-form，可扩展 content.* 等） */
export type UserMessageType =
  | 'authz.grant_expiring'
  | 'authz.grant_expired'
  | 'authz.vendor_created'
  | 'authz.vendor_primary_transferred'
  | string;

export interface UserMessageListParams {
  unread_only?: boolean;
  page?: number;
  page_size?: number;
}

export const userMessageClient = {
  list(params: UserMessageListParams = {}): Promise<UserMessageListResult> {
    return unwrap(
      request.get<ApiEnvelope<UserMessageListResult>>('/api/v1/user-messages', { params }),
    );
  },
  unreadCount(): Promise<UnreadCountResult> {
    return unwrap(
      request.get<ApiEnvelope<UnreadCountResult>>('/api/v1/user-messages/unread-count'),
    );
  },
  markRead(id: number): Promise<MarkReadResult> {
    return unwrap(request.post<ApiEnvelope<MarkReadResult>>(`/api/v1/user-messages/${id}/read`));
  },
  markAllRead(): Promise<MarkAllReadResult> {
    return unwrap(
      request.post<ApiEnvelope<MarkAllReadResult>>('/api/v1/user-messages/mark-all-read'),
    );
  },
};

/* ---- userMessage 破坏测试锚点 ---- */

/**
 * 显式访问 UserMessageDTO.is_read + type + created_at —— 破坏测试锚点。
 */
export function userMessageIsUnread(m: UserMessageDTO): boolean {
  return !m.is_read && m.type !== '' && m.created_at !== undefined;
}

/* ============================================================
 * 类型导出（给 TS 工程其它地方使用）
 * ============================================================ */

export type { paths, components, operations };
