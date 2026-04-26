/**
 * Smarthome 兼容壳 —— Phase 3-F OpenAPI 单源迁移。
 *
 * 老调用方（GatewaysPage / RulesPage / TriggerLogsPage / DeviceHealthPage / AlertsPage）
 * 用 react-query `select: (res) => res.data.data` 模式拆 envelope，期望
 * `Promise<AxiosResponse<ApiResponse<X>>>`。本文件代理到 `smarthomeClient`（已 unwrap），
 * 再用 `wrapAxios` 把单层数据塞回 axios 兼容 envelope，迁移期零调用方改动。
 *
 * 类型权威：`@/api/gen/client`（HueBridgeDTO / EventRuleDTO / TriggerLogDTO 等）。
 * `types/smarthome.ts` 已删除（与 sysConfig / dashboard / log 等同模式）。
 */
import type { AxiosResponse } from 'axios';
import type { ApiResponse, PaginatedData } from '@/types/api';
import {
  smarthomeClient,
  type HueBridgeDTO,
  type CreateHueBridgeRequest,
  type UpdateHueBridgeRequest,
  type XiaomiGatewayDTO,
  type CreateXiaomiGatewayRequest,
  type UpdateXiaomiGatewayRequest,
  type EventRuleDTO,
  type CreateEventRuleRequest,
  type UpdateEventRuleRequest,
  type DryRunResultDTO,
  type TriggerLogDTO,
  type TriggerLogListParams,
  type DeviceHealthDTO,
  type GatewayHealthDTO,
  type AlertDTO,
} from '@/api/gen/client';

/** 把 typed 单层数据塞回 axios 风格 envelope，迁移期 react-query select 老用法零改动。 */
function wrapAxios<T>(data: T): AxiosResponse<ApiResponse<T>> {
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: {} as any,
  };
}

export const smarthomeApi = {
  /* ==================== Hue Bridge ==================== */

  async listHueBridges(hallId: number): Promise<AxiosResponse<ApiResponse<HueBridgeDTO[]>>> {
    return wrapAxios(await smarthomeClient.listHueBridges(hallId));
  },

  async getHueBridge(id: number): Promise<AxiosResponse<ApiResponse<HueBridgeDTO>>> {
    return wrapAxios(await smarthomeClient.getHueBridge(id));
  },

  async createHueBridge(
    data: CreateHueBridgeRequest,
  ): Promise<AxiosResponse<ApiResponse<HueBridgeDTO>>> {
    return wrapAxios(await smarthomeClient.createHueBridge(data));
  },

  async updateHueBridge(
    id: number,
    data: UpdateHueBridgeRequest,
  ): Promise<AxiosResponse<ApiResponse<HueBridgeDTO>>> {
    return wrapAxios(await smarthomeClient.updateHueBridge(id, data));
  },

  async deleteHueBridge(id: number): Promise<AxiosResponse<ApiResponse<void>>> {
    await smarthomeClient.deleteHueBridge(id);
    return wrapAxios<void>(undefined as never);
  },

  /* ==================== Xiaomi Gateway ==================== */

  async listXiaomiGateways(
    hallId: number,
  ): Promise<AxiosResponse<ApiResponse<XiaomiGatewayDTO[]>>> {
    return wrapAxios(await smarthomeClient.listXiaomiGateways(hallId));
  },

  async getXiaomiGateway(id: number): Promise<AxiosResponse<ApiResponse<XiaomiGatewayDTO>>> {
    return wrapAxios(await smarthomeClient.getXiaomiGateway(id));
  },

  async createXiaomiGateway(
    data: CreateXiaomiGatewayRequest,
  ): Promise<AxiosResponse<ApiResponse<XiaomiGatewayDTO>>> {
    return wrapAxios(await smarthomeClient.createXiaomiGateway(data));
  },

  async updateXiaomiGateway(
    id: number,
    data: UpdateXiaomiGatewayRequest,
  ): Promise<AxiosResponse<ApiResponse<XiaomiGatewayDTO>>> {
    return wrapAxios(await smarthomeClient.updateXiaomiGateway(id, data));
  },

  async deleteXiaomiGateway(id: number): Promise<AxiosResponse<ApiResponse<void>>> {
    await smarthomeClient.deleteXiaomiGateway(id);
    return wrapAxios<void>(undefined as never);
  },

  /* ==================== EventRule ==================== */

  async listRules(hallId: number): Promise<AxiosResponse<ApiResponse<EventRuleDTO[]>>> {
    return wrapAxios(await smarthomeClient.listEventRules(hallId));
  },

  async getRule(id: string): Promise<AxiosResponse<ApiResponse<EventRuleDTO>>> {
    return wrapAxios(await smarthomeClient.getEventRule(id));
  },

  async createRule(
    data: CreateEventRuleRequest,
  ): Promise<AxiosResponse<ApiResponse<EventRuleDTO>>> {
    return wrapAxios(await smarthomeClient.createEventRule(data));
  },

  async updateRule(
    id: string,
    data: UpdateEventRuleRequest,
  ): Promise<AxiosResponse<ApiResponse<EventRuleDTO>>> {
    return wrapAxios(await smarthomeClient.updateEventRule(id, data));
  },

  async deleteRule(id: string): Promise<AxiosResponse<ApiResponse<void>>> {
    await smarthomeClient.deleteEventRule(id);
    return wrapAxios<void>(undefined as never);
  },

  async enableRule(id: string): Promise<AxiosResponse<ApiResponse<void>>> {
    await smarthomeClient.enableEventRule(id);
    return wrapAxios<void>(undefined as never);
  },

  async disableRule(id: string): Promise<AxiosResponse<ApiResponse<void>>> {
    await smarthomeClient.disableEventRule(id);
    return wrapAxios<void>(undefined as never);
  },

  async setDebugMode(id: string, debug: boolean): Promise<AxiosResponse<ApiResponse<void>>> {
    await smarthomeClient.setRuleDebugMode(id, debug);
    return wrapAxios<void>(undefined as never);
  },

  async dryRunRule(id: string): Promise<AxiosResponse<ApiResponse<DryRunResultDTO>>> {
    return wrapAxios(await smarthomeClient.dryRunEventRule(id));
  },

  /* ==================== TriggerLog ==================== */

  async listTriggerLogs(
    params: TriggerLogListParams,
  ): Promise<AxiosResponse<ApiResponse<PaginatedData<TriggerLogDTO>>>> {
    const page = await smarthomeClient.listTriggerLogs(params);
    return wrapAxios<PaginatedData<TriggerLogDTO>>({
      list: page.list ?? [],
      total: page.total,
      page: page.page,
      page_size: page.page_size,
    });
  },

  /* ==================== DeviceHealth ==================== */

  async getDeviceHealth(hallId: number): Promise<AxiosResponse<ApiResponse<DeviceHealthDTO[]>>> {
    return wrapAxios(await smarthomeClient.listDeviceHealth(hallId));
  },

  async getGatewayHealth(hallId: number): Promise<AxiosResponse<ApiResponse<GatewayHealthDTO[]>>> {
    return wrapAxios(await smarthomeClient.listGatewayHealth(hallId));
  },

  async getDeviceHealthHistory(
    deviceId: number,
    since?: string,
  ): Promise<AxiosResponse<ApiResponse<DeviceHealthDTO[]>>> {
    return wrapAxios(await smarthomeClient.listDeviceHealthHistory(deviceId, since));
  },

  /* ==================== Alerts ==================== */

  async listAlerts(hallId: number): Promise<AxiosResponse<ApiResponse<AlertDTO[]>>> {
    return wrapAxios(await smarthomeClient.listSmarthomeAlerts(hallId));
  },

  async ackAlert(alertKey: string): Promise<AxiosResponse<ApiResponse<void>>> {
    await smarthomeClient.ackSmarthomeAlert(alertKey);
    return wrapAxios<void>(undefined as never);
  },
};
