import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type {
  HueBridgeDTO,
  CreateHueBridgeBody,
  UpdateHueBridgeBody,
  XiaomiGatewayDTO,
  CreateXiaomiGatewayBody,
  UpdateXiaomiGatewayBody,
  EventRuleDTO,
  CreateRuleBody,
  UpdateRuleBody,
  DryRunResultDTO,
  TriggerLogDTO,
  TriggerLogListParams,
  DeviceHealthDTO,
  GatewayHealthDTO,
  AlertDTO,
} from '@/types/smarthome';

export const smarthomeApi = {

  /* ==================== Hue Bridge ==================== */

  listHueBridges(hallId: number): Promise<AxiosResponse<ApiResponse<HueBridgeDTO[]>>> {
    return request.get('/api/v1/smarthome/hue-bridges', { params: { hall_id: hallId } });
  },

  getHueBridge(id: number): Promise<AxiosResponse<ApiResponse<HueBridgeDTO>>> {
    return request.get(`/api/v1/smarthome/hue-bridges/${id}`);
  },

  createHueBridge(data: CreateHueBridgeBody): Promise<AxiosResponse<ApiResponse<HueBridgeDTO>>> {
    return request.post('/api/v1/smarthome/hue-bridges', data);
  },

  updateHueBridge(id: number, data: UpdateHueBridgeBody): Promise<AxiosResponse<ApiResponse<HueBridgeDTO>>> {
    return request.put(`/api/v1/smarthome/hue-bridges/${id}`, data);
  },

  deleteHueBridge(id: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/smarthome/hue-bridges/${id}`);
  },

  /* ==================== Xiaomi Gateway ==================== */

  listXiaomiGateways(hallId: number): Promise<AxiosResponse<ApiResponse<XiaomiGatewayDTO[]>>> {
    return request.get('/api/v1/smarthome/xiaomi-gateways', { params: { hall_id: hallId } });
  },

  getXiaomiGateway(id: number): Promise<AxiosResponse<ApiResponse<XiaomiGatewayDTO>>> {
    return request.get(`/api/v1/smarthome/xiaomi-gateways/${id}`);
  },

  createXiaomiGateway(data: CreateXiaomiGatewayBody): Promise<AxiosResponse<ApiResponse<XiaomiGatewayDTO>>> {
    return request.post('/api/v1/smarthome/xiaomi-gateways', data);
  },

  updateXiaomiGateway(id: number, data: UpdateXiaomiGatewayBody): Promise<AxiosResponse<ApiResponse<XiaomiGatewayDTO>>> {
    return request.put(`/api/v1/smarthome/xiaomi-gateways/${id}`, data);
  },

  deleteXiaomiGateway(id: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/smarthome/xiaomi-gateways/${id}`);
  },

  /* ==================== EventRule ==================== */

  listRules(hallId: number): Promise<AxiosResponse<ApiResponse<EventRuleDTO[]>>> {
    return request.get('/api/v1/smarthome/rules', { params: { hall_id: hallId } });
  },

  getRule(id: string): Promise<AxiosResponse<ApiResponse<EventRuleDTO>>> {
    return request.get(`/api/v1/smarthome/rules/${id}`);
  },

  createRule(data: CreateRuleBody): Promise<AxiosResponse<ApiResponse<EventRuleDTO>>> {
    return request.post('/api/v1/smarthome/rules', data);
  },

  updateRule(id: string, data: UpdateRuleBody): Promise<AxiosResponse<ApiResponse<EventRuleDTO>>> {
    return request.put(`/api/v1/smarthome/rules/${id}`, data);
  },

  deleteRule(id: string): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/smarthome/rules/${id}`);
  },

  enableRule(id: string): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/smarthome/rules/${id}/enable`);
  },

  disableRule(id: string): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/smarthome/rules/${id}/disable`);
  },

  setDebugMode(id: string, debug: boolean): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/smarthome/rules/${id}/debug`, { debug });
  },

  dryRunRule(id: string): Promise<AxiosResponse<ApiResponse<DryRunResultDTO>>> {
    return request.post(`/api/v1/smarthome/rules/${id}/dry-run`);
  },

  /* ==================== TriggerLog ==================== */

  listTriggerLogs(params: TriggerLogListParams): Promise<AxiosResponse<ApiResponse<PaginatedData<TriggerLogDTO>>>> {
    return request.get('/api/v1/smarthome/trigger-logs', { params });
  },

  /* ==================== DeviceHealth ==================== */

  getDeviceHealth(hallId: number): Promise<AxiosResponse<ApiResponse<DeviceHealthDTO[]>>> {
    return request.get('/api/v1/smarthome/health', { params: { hall_id: hallId } });
  },

  getGatewayHealth(hallId: number): Promise<AxiosResponse<ApiResponse<GatewayHealthDTO[]>>> {
    return request.get('/api/v1/smarthome/health/gateways', { params: { hall_id: hallId } });
  },

  getDeviceHealthHistory(deviceId: number, since?: string): Promise<AxiosResponse<ApiResponse<DeviceHealthDTO[]>>> {
    return request.get(`/api/v1/smarthome/health/${deviceId}/history`, { params: since ? { since } : {} });
  },

  /* ==================== Alerts ==================== */

  listAlerts(hallId: number): Promise<AxiosResponse<ApiResponse<AlertDTO[]>>> {
    return request.get('/api/v1/smarthome/alerts', { params: { hall_id: hallId } });
  },

  ackAlert(alertKey: string): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post('/api/v1/smarthome/alerts/ack', { alert_key: alertKey });
  },
};
