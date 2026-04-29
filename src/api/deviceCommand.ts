/**
 * device-mgmt-v2 P9-C — 设备调试台用：control + query 调用 wrapper。
 *
 * 控制类（POST /api/v1/commands/device）走 commandClient.sendDeviceCommand；
 * 查询类（POST /api/v1/v2/devices/:id/query）走 deviceV2Api.query。
 *
 * 调试台前端不需要自管 msg_id / cmd-ack——后端 sendDeviceCommand 返回 status='sent'
 * 后即认为已下发，retained MQTT 状态变化会通过 MQTT 订阅 / SSE 反馈到 UI。
 */
import request from './request';
import { commandClient, type CommandResult, type DeviceCommandRequest } from './gen/client';
import { deviceV2Api } from './deviceConnector';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export const deviceCommandApi = {
  /** 触发一条 control 指令（指令组 / 单格点击 / 全开 全关 都走这里） */
  control: (body: DeviceCommandRequest): Promise<CommandResult> =>
    commandClient.sendDeviceCommand(body),

  /** 立即触发一次 query（让设备主动回 retained state；用于"刷新状态"按钮） */
  queryNow: (deviceId: number) => deviceV2Api.query(deviceId),

  /** P9-C.2：admin 调试台 [刷新 ticket]——仅闪优等 plugin 委托类设备有效 */
  refreshCredentials: (deviceId: number) =>
    request.post<ApiEnvelope<{ refreshed_at: string }>>(
      `/api/v1/v2/devices/${deviceId}/refresh-credentials`,
    ),
};

export type { DeviceCommandRequest, CommandResult };
