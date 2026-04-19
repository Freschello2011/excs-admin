import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  ProtocolBaselineListItemDTO,
  ProtocolBaselineDetailDTO,
  UpdateProtocolBaselineBody,
} from '@/types/deviceProtocolBaseline';

export const deviceProtocolBaselineApi = {
  /** 列出设备协议基线 */
  list(): Promise<AxiosResponse<ApiResponse<ProtocolBaselineListItemDTO[]>>> {
    return request.get('/api/v1/protocol-baselines');
  },

  /** 协议基线详情 */
  get(protocol: string): Promise<AxiosResponse<ApiResponse<ProtocolBaselineDetailDTO>>> {
    return request.get(`/api/v1/protocol-baselines/${encodeURIComponent(protocol)}`);
  },

  /** 更新协议基线（admin only，极少使用） */
  update(
    protocol: string,
    data: UpdateProtocolBaselineBody,
  ): Promise<AxiosResponse<ApiResponse<ProtocolBaselineDetailDTO>>> {
    return request.put(`/api/v1/protocol-baselines/${encodeURIComponent(protocol)}`, data);
  },
};
