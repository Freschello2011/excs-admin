/**
 * device-mgmt-v2 P9-B 前端补齐：厂家凭据库 API 封装。
 *
 * 4 端点 admin only（catalog.view / catalog.edit）。后端 vendor_credential_handler.go
 * 直注 gin handler；本 wrapper 走 axios + 类型从 schema.gen.ts 派生（不动 codegen client.ts）。
 *
 * 安全：
 *   - List 不返 payload 明文，仅 phone_masked + complete + last_rotated_at
 *   - POST/PUT 提交明文 payload（phone/password/client_id/client_secret），后端立即 AES-256-GCM 加密
 *   - DELETE 被 device 引用时 409
 *
 * 另：在线验证 mcuid（POST /v2/devices/_test_smyoo_mcuid）也挂这里——同属"凭据 +
 * 闪优 mcuid"主题；admin 新建抽屉的 [🔗 在线验证] 按钮调用。
 */
import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type { components } from './gen/schema.gen';

export type VendorCredentialDTO = components['schemas']['VendorCredentialDTO'];
export type CreateVendorCredentialRequest = components['schemas']['CreateVendorCredentialRequest'];
export type UpdateVendorCredentialRequest = components['schemas']['UpdateVendorCredentialRequest'];
export type VendorCredentialCreatedDTO = components['schemas']['VendorCredentialCreatedDTO'];
export type VendorCredentialUpdatedDTO = components['schemas']['VendorCredentialUpdatedDTO'];

/** 在线验证响应（POST /v2/devices/_test_smyoo_mcuid）。
 *
 * 注意：当 isonline=false + 接口正常返回时不抛错；调用方据 isonline / mcuname 显示状态。
 * 接口出错（凭据缺失 / 网络超时 / 闪优云 5xx）时 envelope code !== 0，调用方应据 message 提示。
 */
export interface SmyooMcuidTestResponse {
  isonline: boolean;
  channelnum?: number;
  romversion?: string;
  mcuname?: string;
  latency_ms: number;
}

export const vendorCredentialApi = {
  list(vendorKey?: string): Promise<AxiosResponse<ApiResponse<VendorCredentialDTO[]>>> {
    return request.get('/api/v1/v2/vendor-credentials', {
      params: vendorKey ? { vendor_key: vendorKey } : undefined,
    });
  },
  create(
    body: CreateVendorCredentialRequest,
  ): Promise<AxiosResponse<ApiResponse<VendorCredentialCreatedDTO>>> {
    return request.post('/api/v1/v2/vendor-credentials', body);
  },
  update(
    id: number,
    body: UpdateVendorCredentialRequest,
  ): Promise<AxiosResponse<ApiResponse<VendorCredentialUpdatedDTO>>> {
    return request.put(`/api/v1/v2/vendor-credentials/${id}`, body);
  },
  delete(id: number): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return request.delete(`/api/v1/v2/vendor-credentials/${id}`);
  },
  testSmyooMcuid(body: {
    vendor_credential_id: number;
    deviceid: string;
  }): Promise<AxiosResponse<ApiResponse<SmyooMcuidTestResponse>>> {
    return request.post('/api/v1/v2/devices/_test_smyoo_mcuid', body, {
      // 验证失败应让调用方自己显示绿/红卡，axios 拦截器的全局 toast 会冗余
      skipErrorMessage: true,
    });
  },
};

/** 闪优 vendor_key=smyoo 的必填字段集合，与 02-server vendor_credential_service.go requiredKeys 对齐。 */
export const SMYOO_REQUIRED_KEYS = ['phone', 'password', 'client_id', 'client_secret'] as const;
