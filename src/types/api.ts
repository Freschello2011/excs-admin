/** Generic API response wrapper */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** Paginated list wrapper */
export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}
