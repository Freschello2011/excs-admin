import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  ControlPanel,
  PanelSection,
  PanelCard,
  GenerateDefaultBody,
  AddSectionBody,
  UpdateSectionBody,
  ReorderSectionsBody,
  AddCardBody,
  UpdateCardBody,
  ReorderCardsBody,
} from '@/types/panel';

export const panelApi = {
  /* ==================== Panel ==================== */

  /** 获取展厅面板 */
  getPanel(hallId: number, config?: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse<ControlPanel>>> {
    return request.get(`/api/v1/halls/${hallId}/panel`, config);
  },

  /** 生成默认面板 */
  generateDefault(hallId: number, data?: GenerateDefaultBody): Promise<AxiosResponse<ApiResponse<ControlPanel>>> {
    return request.post(`/api/v1/halls/${hallId}/panel/generate-default`, data || {});
  },

  /* ==================== Section ==================== */

  /** 新增分区 */
  createSection(hallId: number, data: AddSectionBody): Promise<AxiosResponse<ApiResponse<PanelSection>>> {
    return request.post(`/api/v1/halls/${hallId}/panel/sections`, data);
  },

  /** 更新分区 */
  updateSection(hallId: number, sectionId: number, data: UpdateSectionBody): Promise<AxiosResponse<ApiResponse<PanelSection>>> {
    return request.put(`/api/v1/halls/${hallId}/panel/sections/${sectionId}`, data);
  },

  /** 删除分区 */
  deleteSection(hallId: number, sectionId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/halls/${hallId}/panel/sections/${sectionId}`);
  },

  /** 分区排序 */
  reorderSections(hallId: number, data: ReorderSectionsBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/halls/${hallId}/panel/sections/order`, data);
  },

  /* ==================== Card ==================== */

  /** 新增卡片 */
  createCard(hallId: number, sectionId: number, data: AddCardBody): Promise<AxiosResponse<ApiResponse<PanelCard>>> {
    return request.post(`/api/v1/halls/${hallId}/panel/sections/${sectionId}/cards`, data);
  },

  /** 更新卡片 */
  updateCard(hallId: number, cardId: number, data: UpdateCardBody): Promise<AxiosResponse<ApiResponse<PanelCard>>> {
    return request.put(`/api/v1/halls/${hallId}/panel/cards/${cardId}`, data);
  },

  /** 删除卡片 */
  deleteCard(hallId: number, cardId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/halls/${hallId}/panel/cards/${cardId}`);
  },

  /** 卡片排序 */
  reorderCards(hallId: number, sectionId: number, data: ReorderCardsBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/halls/${hallId}/panel/sections/${sectionId}/cards/order`, data);
  },
};
