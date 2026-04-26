/**
 * Phase 2-A（OpenAPI 单源）：本文件保留 `commandApi` 命名空间但内部全部代理到 typed client
 * `@/api/gen/client` —— 字段名 / 参数 / 响应类型由 openapi.yaml 单源约束。
 *
 * 兼容策略：原 caller 用 react-query + `select: (res) => res.data.data` 读响应，本期保留这种
 * AxiosResponse 包壳，让调用方零改动。新页面建议直接用 commandClient（unwrap 后的瘦版本）。
 *
 * src/types/command.ts 已删除；类型从 @/api/gen/client 取。
 */
import type { AxiosResponse } from 'axios';
import type { ApiResponse } from '@/types/api';
import {
  commandClient,
  type SceneListItem,
  type SceneDetail,
  type CreateSceneRequest,
  type UpdateSceneRequest,
  type TouchNavGraph,
  type SaveTouchNavRequest,
} from './gen/client';

// 把 typed client 的 unwrap 后值再包回 AxiosResponse 形状，给老 caller 兜底。
async function wrap<T>(p: Promise<T>): Promise<AxiosResponse<ApiResponse<T>>> {
  const data = await p;
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  };
}

export const commandApi = {
  /* ==================== Scene ==================== */

  /** 场景列表（非分页） */
  getScenes(hallId: number): Promise<AxiosResponse<ApiResponse<SceneListItem[]>>> {
    return wrap(commandClient.listScenes(hallId));
  },

  /** 场景详情（含 actions） */
  getScene(sceneId: number): Promise<AxiosResponse<ApiResponse<SceneDetail>>> {
    return wrap(commandClient.getScene(sceneId));
  },

  /** 创建场景 —— SceneBody 与 CreateSceneRequest 等价（src/types/command.ts 历史命名）。 */
  createScene(data: CreateSceneRequest): Promise<AxiosResponse<ApiResponse<SceneDetail>>> {
    return wrap(commandClient.createScene(data));
  },

  /**
   * 更新场景 —— UpdateSceneRequest 不接受 hall_id（yaml 决策；hall 不可变）。
   * 老 caller 仍传 SceneBody（含 hall_id），这里在边界丢掉 hall_id 字段。
   */
  updateScene(
    sceneId: number,
    data: CreateSceneRequest | UpdateSceneRequest,
  ): Promise<AxiosResponse<ApiResponse<SceneDetail>>> {
    const { hall_id: _hallId, ...rest } = data as CreateSceneRequest;
    return wrap(commandClient.updateScene(sceneId, rest as UpdateSceneRequest));
  },

  /** 删除场景 */
  deleteScene(sceneId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return wrap(commandClient.deleteScene(sceneId));
  },

  /* ==================== Touch Nav ==================== */

  /** 获取展项触摸导航图 */
  getTouchNav(
    hallId: number,
    exhibitId: number,
  ): Promise<AxiosResponse<ApiResponse<TouchNavGraph>>> {
    return wrap(commandClient.getTouchNavGraph(hallId, exhibitId));
  },

  /** 保存展项触摸导航图（全量替换） */
  saveTouchNav(
    hallId: number,
    exhibitId: number,
    graph: TouchNavGraph | SaveTouchNavRequest,
  ): Promise<AxiosResponse<ApiResponse<TouchNavGraph>>> {
    // 老 caller 传 TouchNavGraph（含 exhibit_id）；yaml 的 SaveTouchNavRequest 只要 nodes。
    const body: SaveTouchNavRequest = { nodes: 'nodes' in graph ? graph.nodes : [] };
    return wrap(commandClient.saveTouchNavGraph(hallId, exhibitId, body));
  },
};

// 兼容老导入：src/types/command.ts 删除后，import 路径改为 '@/api/gen/client'，但部分页面
// 仍可能从这里引用类型。re-export 老类型名让旧 import 链可以指过来再去掉。
export type {
  SceneListItem,
  SceneDetail,
  SceneAction,
  CreateSceneRequest as SceneBody,
  TouchNavGraph,
  SaveTouchNavRequest,
} from './gen/client';
