/**
 * Phase 1（OpenAPI 单源）：本文件保留 `userApi` 命名空间，但内部全部代理到 typed client
 * `@/api/gen/client` —— 字段名 / 参数 / 响应类型由 openapi.yaml 单源约束。
 *
 * 调用方接口签名保持向后兼容（只多了：返回值不再嵌 AxiosResponse；types 来自 gen 包）；
 * 已对所有现有 caller（UserListPage / UserDetailPage / ImportSupplierModal / DangerZoneCard /
 * HallAuthzPanel / UserAuthzPanel / GrantWizardPage / GrantListPage / NotificationConfigTab）
 * 同步更新。
 */
import {
  authClient,
  type ListUsersParams as GenListUsersParams,
  type SearchSsoUsersParams as GenSearchSsoUsersParams,
  type ImportSSOUserRequest,
  type SetHallPermissionsRequest,
  type AssignRoleRequest,
  type PatchUserStatusRequest,
  type DeleteUserRequest,
  type UserListItem,
  type UserDetail,
  type SyncMDMResult,
  type SSOSearchUser,
  type PageData,
} from './gen/client';

export type UserListParams = GenListUsersParams;
export type SearchSSOUsersParams = GenSearchSsoUsersParams;
export type SetHallPermissionsBody = SetHallPermissionsRequest;
export type ImportSSOUserBody = ImportSSOUserRequest;

export const userApi = {
  /** 1. 用户列表 */
  getUsers(params: UserListParams): Promise<PageData<UserListItem>> {
    return authClient.listUsers(params);
  },

  /** 2. 用户详情 */
  getUser(userId: number): Promise<UserDetail> {
    return authClient.getUser(userId);
  },

  /** 3. 分配角色（DEPRECATED Phase 5a） */
  assignRole(userId: number, role: AssignRoleRequest['role']): Promise<void> {
    return authClient.assignRole(userId, { role });
  },

  /** 4. 设置展厅权限（DEPRECATED Phase 5a） */
  setHallPermissions(userId: number, data: SetHallPermissionsBody): Promise<void> {
    return authClient.setHallPermissions(userId, data);
  },

  /** 5. 撤销展厅权限（DEPRECATED Phase 5a） */
  revokeHallPermission(userId: number, hallId: number): Promise<void> {
    return authClient.revokeHallPermissions(userId, hallId);
  },

  /** 6. 同步 MDM 员工 */
  syncMDMEmployees(): Promise<SyncMDMResult> {
    return authClient.syncMdmEmployees();
  },

  /** 7. 搜索 SSO 用户 */
  searchSSOUsers(params: SearchSSOUsersParams): Promise<PageData<SSOSearchUser>> {
    return authClient.searchSsoUsers(params);
  },

  /** 8. 导入 SSO 用户为供应商 */
  importSSOUser(data: ImportSSOUserBody): Promise<UserDetail> {
    return authClient.importSsoUser(data);
  },

  /** 9. 停用 / 恢复用户（v1.1 · PRD §8.8 / DDD §8.1bis） */
  patchStatus(userId: number, body: PatchUserStatusRequest): Promise<void> {
    return authClient.patchUserStatus(userId, body);
  },

  /** 10. 软删用户（v1.1 · DDD §9.12，status → archived） */
  deleteUser(userId: number, body: DeleteUserRequest): Promise<void> {
    return authClient.deleteUser(userId, body);
  },
};
