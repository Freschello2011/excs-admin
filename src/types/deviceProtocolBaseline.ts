/* ==================== Device Protocol Baseline ==================== */

/** 命令参数 JSON Schema（Draft 7 子集 + ExCS widget 提示） */
export type ParamsSchema = Record<string, unknown>;

/** 协议命令（型号命令 / 基线命令共用） */
export interface ProtocolCommand {
  code: string;
  name: string;
  category?: string;
  icon?: string;
  description?: string;
  params_schema?: ParamsSchema | null;
}

/** 连接参数 schema（JSON Schema 对象） */
export type ConnectionSchema = Record<string, unknown>;

/** 协议基线列表项 */
export interface ProtocolBaselineListItemDTO {
  id: number;
  protocol: string;
  name: string;
  command_count: number;
  updated_at: string;
}

/** 协议基线详情 */
export interface ProtocolBaselineDetailDTO {
  protocol: string;
  name: string;
  connection_schema: ConnectionSchema;
  commands: ProtocolCommand[];
  notes?: string;
}

/** PUT /protocol-baselines/:protocol body */
export interface UpdateProtocolBaselineBody {
  name?: string;
  connection_schema?: ConnectionSchema;
  commands?: ProtocolCommand[];
  notes?: string;
}
