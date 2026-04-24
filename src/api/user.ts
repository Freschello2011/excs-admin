import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type { UserListItem, UserDetail, SyncMDMResult, SSOSearchResult } from '@/types/auth';

export interface UserListParams {
  page: number;
  page_size: number;
  keyword?: string;
  role?: string;
  user_type?: string;
}

export interface SetHallPermissionsBody {
  hall_id: number;
  permissions: string[];
}

export interface ImportSSOUserBody {
  sso_user_id: string;
  name: string;
  phone?: string;
}

export interface SearchSSOUsersParams {
  keyword: string;
  page: number;
  page_size: number;
}

export const userApi = {
  /** 1. 用户列表 */
  getUsers(params: UserListParams): Promise<AxiosResponse<ApiResponse<PaginatedData<UserListItem>>>> {
    return request.get('/api/v1/auth/users', { params });
  },

  /** 2. 用户详情 */
  getUser(userId: number): Promise<AxiosResponse<ApiResponse<UserDetail>>> {
    return request.get(`/api/v1/auth/users/${userId}`);
  },

  /** 3. 分配角色 */
  assignRole(userId: number, role: string): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/auth/users/${userId}/role`, { role });
  },

  /** 4. 设置展厅权限 */
  setHallPermissions(userId: number, data: SetHallPermissionsBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/auth/users/${userId}/hall-permissions`, data);
  },

  /** 5. 撤销展厅权限 */
  revokeHallPermission(userId: number, hallId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/auth/users/${userId}/hall-permissions/${hallId}`);
  },

  /** 6. 同步 MDM 员工 */
  syncMDMEmployees(): Promise<AxiosResponse<ApiResponse<SyncMDMResult>>> {
    return request.post('/api/v1/auth/users/sync-mdm');
  },

  /** 7. 搜索 SSO 用户 */
  searchSSOUsers(params: SearchSSOUsersParams): Promise<AxiosResponse<ApiResponse<SSOSearchResult>>> {
    return request.get('/api/v1/auth/users/search-sso', { params });
  },

  /** 8. 导入 SSO 用户为供应商 */
  importSSOUser(data: ImportSSOUserBody): Promise<AxiosResponse<ApiResponse<UserDetail>>> {
    return request.post('/api/v1/auth/users/import-sso', data);
  },

  /** 9. 停用 / 恢复用户（v1.1 · PRD §8.8 / DDD §8.1bis） */
  patchStatus(
    userId: number,
    body: { status: 'active' | 'suspended'; reason?: string },
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.patch(`/api/v1/auth/users/${userId}/status`, body);
  },

  /** 10. 软删用户（v1.1 · DDD §9.12，status → archived） */
  deleteUser(
    userId: number,
    body: { reason: string },
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/auth/users/${userId}`, { data: body });
  },
};
