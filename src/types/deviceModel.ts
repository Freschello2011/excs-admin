import type { ProtocolCommand } from './deviceProtocolBaseline';

/* ==================== Device Model ==================== */

export type DeviceModelStatus = 'active' | 'deprecated';

/** 型号列表项（含冗余字段） */
export interface DeviceModelListItem {
  id: number;
  subcategory_id: number;
  subcategory_code: string;
  subcategory_name: string;
  brand_id: number;
  brand_code: string;
  brand_name: string;
  brand_logo_url?: string;
  model_code: string;
  name: string;
  protocol: string;
  command_count: number;
  status: DeviceModelStatus;
  updated_at: string;
}

/** 型号详情 — clone 时 id 不返回，model_code / name 留空 */
export interface DeviceModelDetail {
  id?: number;
  subcategory_id: number;
  brand_id: number;
  model_code: string;
  name: string;
  protocol: string;
  connection_defaults?: Record<string, unknown> | null;
  commands: ProtocolCommand[];
  manual_url?: string;
  description?: string;
  status?: DeviceModelStatus;
  created_at?: string;
  updated_at?: string;
}

/** 创建型号请求体 */
export interface CreateModelBody {
  subcategory_id: number;
  /** brand_id / (brand_code + brand_name) 二选一；autocomplete 新建品牌时用后者 */
  brand_id?: number;
  brand_code?: string;
  brand_name?: string;
  model_code: string;
  name: string;
  protocol: string;
  connection_defaults?: Record<string, unknown> | null;
  commands: ProtocolCommand[];
  manual_url?: string;
  description?: string;
}

export interface UpdateModelBody {
  subcategory_id: number;
  brand_id: number;
  name: string;
  protocol: string;
  connection_defaults?: Record<string, unknown> | null;
  commands: ProtocolCommand[];
  manual_url?: string;
  description?: string;
}

export interface ModelListQuery {
  subcategory_id?: number;
  brand_id?: number;
  keyword?: string;
  status?: DeviceModelStatus;
  page?: number;
  page_size?: number;
}
