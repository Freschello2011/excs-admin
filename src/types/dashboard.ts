/** Dashboard stats overview */
export interface DashboardStats {
  hall_count: number;
  online_device_count: number;
  content_count: number;
  today_operation_count: number;
}

/** Daily online rate data point */
export interface DailyOnlineRate {
  date: string;
  rate: number;
}

/** Recent content update item */
export interface RecentContentItem {
  id: number;
  name: string;
  hall_name: string;
  status: string;
  updated_at: string;
}

/** Recent operation log item (simplified) */
export interface RecentLogItem {
  id: number;
  user_name: string;
  action: string;
  detail: string;
  created_at: string;
}

/** Full dashboard data */
export interface DashboardData {
  stats: DashboardStats;
  online_rate_trend: DailyOnlineRate[];
  recent_contents: RecentContentItem[];
  recent_logs: RecentLogItem[];
}
