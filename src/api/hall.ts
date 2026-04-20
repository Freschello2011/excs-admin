import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type {
  HallListItem,
  HallListParams,
  HallDetail,
  HallConfigBody,
  ServicePeriodBody,
  HallRuntimeStatus,
  SyncMdmBody,
  SyncMdmResult,
  ExhibitListItem,
  ExhibitBody,
  ExhibitScript,
  DeviceListItem,
  DeviceListParams,
  DeviceBody,
  EffectiveCommand,
  AppInstanceListItem,
  SwitchMasterBody,
  PairingCodeListItem,
  BatchGenerateResult,
  ExportPairingCodeItem,
  GeneratePairingCodeBody,
  ControlAppSessionItem,
  SwitchControlHallBody,
  AnnouncedDevice,
} from '@/types/hall';

export const hallApi = {
  /* ==================== Hall ==================== */

  /** 1. 从 MDM 同步展厅数据 */
  syncMdm(data?: SyncMdmBody): Promise<AxiosResponse<ApiResponse<SyncMdmResult>>> {
    return request.post('/api/v1/halls/sync-mdm', data || {});
  },

  /** 1b. 通过 MDM 创建展厅（数据写回 MDM + 本地同步） */
  createHallViaMdm(data: {
    showroom_name: string;
    customer_id: number;
    contact_id?: number;
    address?: string;
    available_from?: string;
    available_to?: string;
    remark?: string;
  }): Promise<AxiosResponse<ApiResponse<HallListItem>>> {
    return request.post('/api/v1/halls/create-via-mdm', data);
  },

  /** 1c. 获取 MDM 客户列表（代理） */
  getMdmCustomers(): Promise<AxiosResponse<ApiResponse<{ list: Array<{ id: number; company_name: string; short_name: string }>; total: number }>>> {
    return request.get('/api/v1/mdm-proxy/customers');
  },

  /** 2. 展厅列表 */
  getHalls(params: HallListParams): Promise<AxiosResponse<ApiResponse<PaginatedData<HallListItem>>>> {
    return request.get('/api/v1/halls', { params });
  },

  /** 3. 展厅详情 */
  getHall(hallId: number): Promise<AxiosResponse<ApiResponse<HallDetail>>> {
    return request.get(`/api/v1/halls/${hallId}`);
  },

  /** 4. 更新展厅配置 */
  updateHallConfig(hallId: number, data: HallConfigBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/halls/${hallId}/config`, data);
  },

  /** 5. 更新服务期 */
  updateServicePeriod(hallId: number, data: ServicePeriodBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/halls/${hallId}/service-period`, data);
  },

  /** 6. 展厅运行状态 */
  getHallStatus(hallId: number): Promise<AxiosResponse<ApiResponse<HallRuntimeStatus>>> {
    return request.get(`/api/v1/halls/${hallId}/status`);
  },

  /* ==================== Exhibit ==================== */

  /** 7. 创建展项 */
  createExhibit(hallId: number, data: ExhibitBody): Promise<AxiosResponse<ApiResponse<ExhibitListItem>>> {
    return request.post(`/api/v1/halls/${hallId}/exhibits`, data);
  },

  /** 8. 更新展项 */
  updateExhibit(hallId: number, exhibitId: number, data: Partial<ExhibitBody>): Promise<AxiosResponse<ApiResponse<ExhibitListItem>>> {
    return request.put(`/api/v1/halls/${hallId}/exhibits/${exhibitId}`, data);
  },

  /** 9. 删除展项 */
  deleteExhibit(hallId: number, exhibitId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/halls/${hallId}/exhibits/${exhibitId}`);
  },

  /** 10. 展项列表 */
  getExhibits(hallId: number): Promise<AxiosResponse<ApiResponse<ExhibitListItem[]>>> {
    return request.get(`/api/v1/halls/${hallId}/exhibits`);
  },

  /** 11. 更新讲解词 */
  updateExhibitScripts(hallId: number, exhibitId: number, scripts: ExhibitScript[]): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/halls/${hallId}/exhibits/${exhibitId}/scripts`, { scripts });
  },

  /** 11a. 获取讲解词 */
  getExhibitScripts(hallId: number, exhibitId: number): Promise<AxiosResponse<ApiResponse<ExhibitScript[]>>> {
    return request.get(`/api/v1/halls/${hallId}/exhibits/${exhibitId}/scripts`);
  },

  /* ==================== Device ==================== */

  /** 12. 创建设备 */
  createDevice(data: DeviceBody): Promise<AxiosResponse<ApiResponse<DeviceListItem>>> {
    return request.post('/api/v1/devices', data);
  },

  /** 13. 更新设备 */
  updateDevice(deviceId: number, data: Partial<DeviceBody>): Promise<AxiosResponse<ApiResponse<DeviceListItem>>> {
    return request.put(`/api/v1/devices/${deviceId}`, data);
  },

  /** 14. 删除设备 */
  deleteDevice(deviceId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/devices/${deviceId}`);
  },

  /** 15. 设备列表 */
  getDevices(params: DeviceListParams): Promise<AxiosResponse<ApiResponse<DeviceListItem[]>>> {
    return request.get('/api/v1/devices', { params });
  },

  /** 16. 设备有效命令（模板+覆盖合并） */
  getEffectiveCommands(deviceId: number): Promise<AxiosResponse<ApiResponse<EffectiveCommand[]>>> {
    return request.get(`/api/v1/devices/${deviceId}/effective-commands`);
  },

  /* ==================== App Instance ==================== */

  /** 16. App 实例列表 */
  getAppInstances(hallId: number): Promise<AxiosResponse<ApiResponse<AppInstanceListItem[]>>> {
    return request.get(`/api/v1/halls/${hallId}/app-instances`);
  },

  /** 17. 解绑 App 实例 */
  unpairAppInstance(hallId: number, instanceId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/halls/${hallId}/app-instances/${instanceId}`);
  },

  /** 18. 切换主控实例 */
  switchMaster(hallId: number, data: SwitchMasterBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/halls/${hallId}/switch-master`, data);
  },

  /* ==================== Pairing Code ==================== */

  /** 19. 生成配对码 */
  generatePairingCode(hallId: number, data: GeneratePairingCodeBody): Promise<AxiosResponse<ApiResponse<PairingCodeListItem>>> {
    return request.post(`/api/v1/halls/${hallId}/pairing-codes`, data);
  },

  /** 20. 批量生成配对码 */
  batchGeneratePairingCodes(hallId: number): Promise<AxiosResponse<ApiResponse<BatchGenerateResult>>> {
    return request.post(`/api/v1/halls/${hallId}/pairing-codes/batch`);
  },

  /** 21. 重新生成配对码 */
  regeneratePairingCode(hallId: number, codeId: number): Promise<AxiosResponse<ApiResponse<PairingCodeListItem>>> {
    return request.post(`/api/v1/halls/${hallId}/pairing-codes/${codeId}/regenerate`);
  },

  /** 22. 解锁配对码 */
  unlockPairingCode(hallId: number, codeId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/halls/${hallId}/pairing-codes/${codeId}/unlock`);
  },

  /** 23. 配对码列表 */
  listPairingCodes(hallId: number, params?: { target_type?: string; status?: string }): Promise<AxiosResponse<ApiResponse<PairingCodeListItem[]>>> {
    return request.get(`/api/v1/halls/${hallId}/pairing-codes`, { params });
  },

  /** 24. 导出配对码 */
  exportPairingCodes(hallId: number): Promise<AxiosResponse<ApiResponse<ExportPairingCodeItem[]>>> {
    return request.get(`/api/v1/halls/${hallId}/pairing-codes/export`);
  },

  /** 设备播报 — 获取待配对设备列表 */
  listAnnouncedDevices(): Promise<AxiosResponse<ApiResponse<AnnouncedDevice[]>>> {
    return request.get('/api/v1/announced-devices');
  },

  /** 管理员确认配对播报设备 */
  pairAnnouncedDevice(hallId: number, data: { announce_code: string; exhibit_id: number }): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/halls/${hallId}/pair-announced`, data);
  },

  /** 25d. 生成调试配对码 */
  generateDebugPairingCode(hallId: number, data: { exhibit_id: number; ttl_hours?: number }): Promise<AxiosResponse<ApiResponse<PairingCodeListItem>>> {
    return request.post(`/api/v1/halls/${hallId}/pairing-codes/debug`, data);
  },

  /** 26d. 断开调试实例 */
  disconnectDebugInstance(hallId: number, instanceId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/halls/${hallId}/debug-instances/${instanceId}`);
  },

  /** 27d. 延长调试实例 TTL */
  extendDebugInstance(hallId: number, instanceId: number, data: { extend_hours: number }): Promise<AxiosResponse<ApiResponse<AppInstanceListItem>>> {
    return request.post(`/api/v1/halls/${hallId}/debug-instances/${instanceId}/extend`, data);
  },

  /* ==================== Control App Session ==================== */

  /** 25. 中控会话列表 */
  listControlAppSessions(hallId: number): Promise<AxiosResponse<ApiResponse<ControlAppSessionItem[]>>> {
    return request.get(`/api/v1/halls/${hallId}/control-app-sessions`);
  },

  /** 26. 切换中控展厅 */
  switchControlAppHall(hallId: number, sessionId: number, data: SwitchControlHallBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/halls/${hallId}/control-app-sessions/${sessionId}/switch-hall`, data);
  },
};
