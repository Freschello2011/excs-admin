/**
 * Phase 2-C：api/hall.ts 重写为 AxiosResponse 兼容壳，背后代理到 typed
 * `hallClient`（src/api/gen/client.ts）。
 *
 * 设计原则（沿用 Phase 2-B content.ts 模板）：
 *   - **零调用方改动**：所有 `hallApi.xxx().then(res => res.data.data)` 老调用继续工作
 *     （保留 AxiosResponse<ApiResponse<T>> 的形状）。
 *   - **新代码直接走 hallClient**：拿到剥 envelope 后的 typed 对象。
 *   - **类型从 `@/api/gen/client` 单源派生**：types/hall.ts 删除后，调用方 import
 *     批量改到这里。
 */

import type { AxiosResponse } from 'axios';
import type {
  AnnouncedDevice,
  AppInstanceListItem,
  BatchGenerateResult,
  ControlAppSessionItem,
  CreateExhibitRequest,
  CreateHallViaMdmRequest,
  DeviceDTO,
  DeviceListItem,
  EffectiveCommand,
  ElectionResultDTO,
  ExhibitDTO,
  ExhibitListItem,
  ExhibitScript,
  ExportPairingCodeItem,
  ExtendDebugInstanceRequest,
  GenerateDebugPairingCodeRequest,
  GeneratePairingCodeBody,
  HallConfigBody,
  HallDetail,
  HallListItem,
  HallListPage,
  HallMasterStatusDTO,
  HallRuntimeStatus,
  OperationMode,
  ListDevicesParams,
  ListHallsParams,
  ListPairingCodesParams,
  MdmCustomer,
  PairAnnouncedRequest,
  PairingCodeListItem,
  ServicePeriodBody,
  SwitchControlHallBody,
  SwitchControlHallResponse,
  SyncMdmBody,
  SyncMdmResultLegacy,
  UpdateDeviceRequest,
  UpdateExhibitRequest,
  UpdateHallMasterPriorityRequest,
} from './gen/client';
import { hallClient } from './gen/client';

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

type PaginatedData<T> = {
  list: T[];
  total: number;
  page: number;
  page_size: number;
};

/**
 * 把 typed `hallClient.xxx()` 的 Promise<T>（已剥 envelope）反向包装回
 * AxiosResponse<ApiResponse<T>>，给老调用方保留 res.data / res.data.data 写法。
 */
async function asAxiosResp<T>(p: Promise<T>): Promise<AxiosResponse<ApiResponse<T>>> {
  const data = await p;
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  } as AxiosResponse<ApiResponse<T>>;
}

export const hallApi = {
  /* ==================== Hall ==================== */

  syncMdm(data?: SyncMdmBody): Promise<AxiosResponse<ApiResponse<SyncMdmResultLegacy>>> {
    return asAxiosResp(hallClient.syncFromMdm(data ?? {}));
  },

  createHallViaMdm(data: CreateHallViaMdmRequest): Promise<AxiosResponse<ApiResponse<HallDetail>>> {
    return asAxiosResp(hallClient.createViaMdm(data));
  },

  getMdmCustomers(): Promise<AxiosResponse<ApiResponse<MdmCustomer[]>>> {
    return asAxiosResp(hallClient.getMdmCustomers());
  },

  getHalls(params: ListHallsParams): Promise<AxiosResponse<ApiResponse<PaginatedData<HallListItem>>>> {
    return asAxiosResp(
      hallClient.listHalls(params).then<PaginatedData<HallListItem>>((p: HallListPage) => ({
        list: p.list,
        total: p.total,
        page: p.page,
        page_size: p.page_size,
      })),
    );
  },

  getHall(hallId: number): Promise<AxiosResponse<ApiResponse<HallDetail>>> {
    return asAxiosResp(hallClient.getHall(hallId));
  },

  updateHallConfig(hallId: number, data: HallConfigBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.updateHallConfig(hallId, data));
  },

  updateServicePeriod(
    hallId: number,
    data: ServicePeriodBody,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.updateServicePeriod(hallId, data, reason));
  },

  getHallStatus(hallId: number): Promise<AxiosResponse<ApiResponse<HallRuntimeStatus>>> {
    return asAxiosResp(hallClient.getHallStatus(hallId));
  },

  /* ==================== Exhibit ==================== */

  createExhibit(
    hallId: number,
    data: CreateExhibitRequest,
  ): Promise<AxiosResponse<ApiResponse<ExhibitDTO>>> {
    return asAxiosResp(hallClient.createExhibit(hallId, data));
  },

  updateExhibit(
    hallId: number,
    exhibitId: number,
    data: UpdateExhibitRequest,
  ): Promise<AxiosResponse<ApiResponse<ExhibitDTO>>> {
    return asAxiosResp(hallClient.updateExhibit(hallId, exhibitId, data));
  },

  deleteExhibit(hallId: number, exhibitId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.deleteExhibit(hallId, exhibitId));
  },

  reorderExhibits(
    hallId: number,
    exhibitIds: number[],
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.reorderExhibits(hallId, exhibitIds));
  },

  getExhibits(hallId: number): Promise<AxiosResponse<ApiResponse<ExhibitListItem[]>>> {
    return asAxiosResp(hallClient.listExhibits(hallId));
  },

  updateExhibitScripts(
    hallId: number,
    exhibitId: number,
    scripts: ExhibitScript[],
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.updateExhibitScripts(hallId, exhibitId, scripts));
  },

  getExhibitScripts(
    hallId: number,
    exhibitId: number,
  ): Promise<AxiosResponse<ApiResponse<ExhibitScript[]>>> {
    return asAxiosResp(hallClient.getExhibitScripts(hallId, exhibitId));
  },

  /* ==================== Device ====================
   * device-mgmt-v2 P7-Cleanup 起创建只走 POST /v2/devices（types/deviceConnector + api/device.ts）。
   */

  updateDevice(
    deviceId: number,
    data: UpdateDeviceRequest,
  ): Promise<AxiosResponse<ApiResponse<DeviceListItem>>> {
    return asAxiosResp(hallClient.updateDevice(deviceId, data));
  },

  deleteDevice(deviceId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.deleteDevice(deviceId));
  },

  getDevices(params: ListDevicesParams): Promise<AxiosResponse<ApiResponse<DeviceDTO[]>>> {
    return asAxiosResp(hallClient.listDevices(params));
  },

  getEffectiveCommands(deviceId: number): Promise<AxiosResponse<ApiResponse<EffectiveCommand[]>>> {
    return asAxiosResp(hallClient.getEffectiveCommands(deviceId));
  },

  /* ==================== App Instance ==================== */

  getAppInstances(hallId: number): Promise<AxiosResponse<ApiResponse<AppInstanceListItem[]>>> {
    return asAxiosResp(hallClient.listAppInstances(hallId));
  },

  unpairAppInstance(
    hallId: number,
    instanceId: number,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.unpairAppInstance(hallId, instanceId));
  },

  /* ==================== hall_master 选举 v2（hall.md §1.5）====================
   * 高风险：action=hall.switch_master RequireReason=true。reason ≥ 5 字必填。
   */

  updateHallMasterPriority(
    hallId: number,
    data: UpdateHallMasterPriorityRequest,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.updateHallMasterPriority(hallId, data, reason));
  },

  getHallMasterStatus(
    hallId: number,
  ): Promise<AxiosResponse<ApiResponse<HallMasterStatusDTO>>> {
    return asAxiosResp(hallClient.getHallMasterStatus(hallId));
  },

  electHallMaster(
    hallId: number,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<ElectionResultDTO>>> {
    return asAxiosResp(hallClient.electHallMaster(hallId, reason));
  },

  /**
   * 切换运营模式。production 切换需 reason ≥ 5 字（后端 RequireReason）；
   * 其余 3 态 reason 可空。
   */
  changeOperationMode(
    hallId: number,
    operationMode: OperationMode,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.changeOperationMode(hallId, operationMode, reason));
  },

  /* ==================== Pairing Code ====================
   * pairing.manage / pairing.debug 标了 RequireReason: true（critical action）。
   * 后端 middleware 会拒绝缺 reason 的请求（HTTP 400 + reason_required）。
   * reason 通过 hallClient 第三参数注入 X-Action-Reason header。
   */

  generatePairingCode(
    hallId: number,
    data: GeneratePairingCodeBody,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<PairingCodeListItem>>> {
    return asAxiosResp(hallClient.generatePairingCode(hallId, data, reason));
  },

  batchGeneratePairingCodes(
    hallId: number,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<BatchGenerateResult>>> {
    return asAxiosResp(hallClient.batchGeneratePairingCodes(hallId, reason));
  },

  regeneratePairingCode(
    hallId: number,
    codeId: number,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<PairingCodeListItem>>> {
    return asAxiosResp(hallClient.regeneratePairingCode(hallId, codeId, reason));
  },

  unlockPairingCode(
    hallId: number,
    codeId: number,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.unlockPairingCode(hallId, codeId, reason));
  },

  listPairingCodes(
    hallId: number,
    params?: ListPairingCodesParams,
  ): Promise<AxiosResponse<ApiResponse<PairingCodeListItem[]>>> {
    return asAxiosResp(hallClient.listPairingCodes(hallId, params ?? {}));
  },

  exportPairingCodes(
    hallId: number,
  ): Promise<AxiosResponse<ApiResponse<ExportPairingCodeItem[]>>> {
    return asAxiosResp(hallClient.exportPairingCodes(hallId));
  },

  listAnnouncedDevices(): Promise<AxiosResponse<ApiResponse<AnnouncedDevice[]>>> {
    return asAxiosResp(hallClient.listAnnouncedDevices());
  },

  pairAnnouncedDevice(
    hallId: number,
    data: PairAnnouncedRequest,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.pairAnnouncedDevice(hallId, data));
  },

  generateDebugPairingCode(
    hallId: number,
    data: GenerateDebugPairingCodeRequest,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<PairingCodeListItem>>> {
    return asAxiosResp(hallClient.generateDebugPairingCode(hallId, data, reason));
  },

  disconnectDebugInstance(
    hallId: number,
    instanceId: number,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosResp(hallClient.disconnectDebugInstance(hallId, instanceId, reason));
  },

  extendDebugInstance(
    hallId: number,
    instanceId: number,
    data: ExtendDebugInstanceRequest,
  ): Promise<AxiosResponse<ApiResponse<AppInstanceListItem>>> {
    return asAxiosResp(hallClient.extendDebugInstance(hallId, instanceId, data));
  },

  /* ==================== Control App Session ==================== */

  listControlAppSessions(
    hallId: number,
  ): Promise<AxiosResponse<ApiResponse<ControlAppSessionItem[]>>> {
    return asAxiosResp(hallClient.listControlAppSessions(hallId));
  },

  switchControlAppHall(
    hallId: number,
    sessionId: number,
    data: SwitchControlHallBody,
  ): Promise<AxiosResponse<ApiResponse<SwitchControlHallResponse | null>>> {
    return asAxiosResp(hallClient.switchControlAppHall(hallId, sessionId, data));
  },

  cleanupStaleControlSessions(
    hallId: number,
  ): Promise<AxiosResponse<ApiResponse<{ deleted: number }>>> {
    return asAxiosResp(hallClient.cleanupStaleControlSessions(hallId));
  },
};
