import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type { SceneListItem, SceneDetail, SceneBody, TouchNavGraph } from '@/types/command';

export const commandApi = {
  /* ==================== Scene ==================== */

  /** 场景列表（非分页） */
  getScenes(hallId: number): Promise<AxiosResponse<ApiResponse<SceneListItem[]>>> {
    return request.get('/api/v1/scenes', { params: { hall_id: hallId } });
  },

  /** 场景详情（含 actions） */
  getScene(sceneId: number): Promise<AxiosResponse<ApiResponse<SceneDetail>>> {
    return request.get(`/api/v1/scenes/${sceneId}`);
  },

  /** 创建场景 */
  createScene(data: SceneBody): Promise<AxiosResponse<ApiResponse<SceneDetail>>> {
    return request.post('/api/v1/scenes', data);
  },

  /** 更新场景 */
  updateScene(sceneId: number, data: SceneBody): Promise<AxiosResponse<ApiResponse<SceneDetail>>> {
    return request.put(`/api/v1/scenes/${sceneId}`, data);
  },

  /** 删除场景 */
  deleteScene(sceneId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/scenes/${sceneId}`);
  },

  /* ==================== Touch Nav ==================== */

  /** 获取展项触摸导航图 */
  getTouchNav(hallId: number, exhibitId: number): Promise<AxiosResponse<ApiResponse<TouchNavGraph>>> {
    return request.get(`/api/v1/halls/${hallId}/exhibits/${exhibitId}/touch-nav`);
  },

  /** 保存展项触摸导航图（全量替换） */
  saveTouchNav(hallId: number, exhibitId: number, graph: TouchNavGraph): Promise<AxiosResponse<ApiResponse<TouchNavGraph>>> {
    return request.put(`/api/v1/halls/${hallId}/exhibits/${exhibitId}/touch-nav`, graph);
  },
};
