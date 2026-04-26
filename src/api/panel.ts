// Phase 3-C：从手写 axios 调用迁到 OpenAPI typed client。
//
// `panelApi.*` 保留 AxiosResponse<ApiResponse<T>> 形态——react-query
// `select: (res) => res.data.data` / 老 `.then(res => res.data)` 调用方零改动；
// 内部全部代理到 `panelClient.*`（typed，剥 envelope）。
//
// 新调用方应直接用 `import { panelClient } from '@/api/gen/client'`。

import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { ApiResponse } from '@/types/api';
import {
  panelClient,
  type PanelDTO,
  type PanelSectionDTO,
  type PanelCardDTO,
  type GenerateDefaultPanelRequest,
  type AddPanelSectionRequest,
  type UpdatePanelSectionRequest,
  type ReorderPanelSectionsRequest,
  type AddPanelCardRequest,
  type UpdatePanelCardRequest,
  type ReorderPanelCardsRequest,
  type ListPanelVersionsParams,
  type PanelVersionListDTO,
  type PanelVersionDTO,
  type PanelVersionDetailDTO,
  type SavePanelDraftRequest,
  type RenamePanelVersionRequest,
  type PanelPublishResult,
} from './gen/client';

/** 把 typed client 的 unwrapped 结果包成老调用方期望的 AxiosResponse 兼容壳。 */
function envelope<T>(data: T): AxiosResponse<ApiResponse<T>> {
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    // axios runtime 字段，调用方实际只读 .data
    headers: {} as never,
    config: {} as never,
  } as AxiosResponse<ApiResponse<T>>;
}

export const panelApi = {
  /* ==================== Panel ==================== */

  /** 获取展厅面板 */
  getPanel(
    hallId: number,
    _config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<ApiResponse<PanelDTO>>> {
    return panelClient.getPanel(hallId).then(envelope);
  },

  /** 生成默认面板 */
  generateDefault(
    hallId: number,
    data?: GenerateDefaultPanelRequest,
  ): Promise<AxiosResponse<ApiResponse<PanelDTO>>> {
    return panelClient.generateDefaultPanel(hallId, data).then(envelope);
  },

  /* ==================== Section ==================== */

  /** 新增分区 */
  createSection(
    hallId: number,
    data: AddPanelSectionRequest,
  ): Promise<AxiosResponse<ApiResponse<PanelSectionDTO>>> {
    return panelClient.addPanelSection(hallId, data).then(envelope);
  },

  /** 更新分区 */
  updateSection(
    hallId: number,
    sectionId: number,
    data: UpdatePanelSectionRequest,
  ): Promise<AxiosResponse<ApiResponse<PanelSectionDTO>>> {
    return panelClient.updatePanelSection(hallId, sectionId, data).then(envelope);
  },

  /** 删除分区 */
  deleteSection(
    hallId: number,
    sectionId: number,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return panelClient.deletePanelSection(hallId, sectionId).then(envelope);
  },

  /** 分区排序 */
  reorderSections(
    hallId: number,
    data: ReorderPanelSectionsRequest,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return panelClient.reorderPanelSections(hallId, data).then(envelope);
  },

  /* ==================== Card ==================== */

  /** 新增卡片 */
  createCard(
    hallId: number,
    sectionId: number,
    data: AddPanelCardRequest,
  ): Promise<AxiosResponse<ApiResponse<PanelCardDTO>>> {
    return panelClient.addPanelCard(hallId, sectionId, data).then(envelope);
  },

  /** 更新卡片 */
  updateCard(
    hallId: number,
    cardId: number,
    data: UpdatePanelCardRequest,
  ): Promise<AxiosResponse<ApiResponse<PanelCardDTO>>> {
    return panelClient.updatePanelCard(hallId, cardId, data).then(envelope);
  },

  /** 删除卡片 */
  deleteCard(
    hallId: number,
    cardId: number,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return panelClient.deletePanelCard(hallId, cardId).then(envelope);
  },

  /** 卡片排序 */
  reorderCards(
    hallId: number,
    sectionId: number,
    data: ReorderPanelCardsRequest,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return panelClient.reorderPanelCards(hallId, sectionId, data).then(envelope);
  },

  /* ==================== Panel Versions（中控面板改版 P1 — 版本化与发布）==================== */

  /** 列版本（分页 + 状态筛选） */
  listVersions(
    hallId: number,
    params?: ListPanelVersionsParams,
  ): Promise<AxiosResponse<ApiResponse<PanelVersionListDTO>>> {
    return panelClient.listPanelVersions(hallId, params).then(envelope);
  },

  /** 保存草稿（生成新 PanelVersion，status=draft） */
  saveDraft(
    hallId: number,
    data: SavePanelDraftRequest,
  ): Promise<AxiosResponse<ApiResponse<PanelVersionDTO>>> {
    return panelClient.savePanelDraft(hallId, data).then(envelope);
  },

  /** 版本详情（含 snapshot_json） */
  getVersion(
    hallId: number,
    versionId: number,
  ): Promise<AxiosResponse<ApiResponse<PanelVersionDetailDTO>>> {
    return panelClient.getPanelVersionDetail(hallId, versionId).then(envelope);
  },

  /** 改版本名 */
  renameVersion(
    hallId: number,
    versionId: number,
    data: RenamePanelVersionRequest,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return panelClient.renamePanelVersion(hallId, versionId, data).then(envelope);
  },

  /** 删草稿（仅 status=draft） */
  deleteVersion(
    hallId: number,
    versionId: number,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return panelClient.deletePanelVersion(hallId, versionId).then(envelope);
  },

  /** 发布版本（覆盖 sections+cards 表 + MQTT 广播） */
  publishVersion(
    hallId: number,
    versionId: number,
  ): Promise<AxiosResponse<ApiResponse<PanelPublishResult>>> {
    return panelClient.publishPanelVersion(hallId, versionId).then(envelope);
  },
};
