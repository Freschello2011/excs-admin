/** Operation log list item */
export interface OperationLogItem {
  id: number;
  hall_id: number;
  hall_name: string;
  user_id: number;
  user_name: string;
  action: string;
  target_type: string;
  target_id: number;
  detail: string;
  ip: string;
  created_at: string;
}

/** Query params for operation log list */
export interface OperationLogParams {
  page: number;
  page_size: number;
  hall_id?: number;
  user_id?: number;
  action?: string;
  start_date?: string;
  end_date?: string;
}
