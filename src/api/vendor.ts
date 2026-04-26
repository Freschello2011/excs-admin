/**
 * Vendor（供应商）API 封装 —— Phase 8 新增。
 *
 * 与后端 02-server/internal/interfaces/api/authz_vendor_handler.go 对齐。
 * 路由前缀沿用 /api/v1/authz/vendors（与 role-templates / grants 在同一 group 下）。
 */
import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  Vendor,
  VendorDetailResponse,
  CreateVendorBody,
  UpdateVendorBody,
  InviteMemberBody,
  InviteInfo,
  CreateVendorResponse,
  InviteMemberResponse,
} from '@/api/gen/client';

interface ListWrap<T> {
  list: T[];
}

export const vendorApi = {
  /* ---------------- 列表 / 详情 / CRUD ---------------- */

  list(): Promise<AxiosResponse<ApiResponse<ListWrap<Vendor>>>> {
    return request.get('/api/v1/authz/vendors');
  },

  get(id: number): Promise<AxiosResponse<ApiResponse<VendorDetailResponse>>> {
    return request.get(`/api/v1/authz/vendors/${id}`);
  },

  create(body: CreateVendorBody): Promise<AxiosResponse<ApiResponse<CreateVendorResponse>>> {
    return request.post('/api/v1/authz/vendors', body);
  },

  update(id: number, body: UpdateVendorBody): Promise<AxiosResponse<ApiResponse<Vendor>>> {
    return request.put(`/api/v1/authz/vendors/${id}`, body);
  },

  /* ---------------- 状态变更 / 延期 / 主账号转移 ---------------- */

  suspend(id: number, reason?: string): Promise<AxiosResponse<ApiResponse<{ id: number; status: string }>>> {
    return request.post(`/api/v1/authz/vendors/${id}/suspend`, { reason });
  },

  extend(id: number, newExpiresAt: string): Promise<AxiosResponse<ApiResponse<{ id: number; new_expires_at: string }>>> {
    return request.post(`/api/v1/authz/vendors/${id}/extend`, { new_expires_at: newExpiresAt });
  },

  transferPrimary(
    id: number,
    newPrimaryUserID: number,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<{ id: number; new_primary_user_id: number }>>> {
    return request.post(`/api/v1/authz/vendors/${id}/transfer-primary`, {
      new_primary_user_id: newPrimaryUserID,
      reason,
    });
  },

  /* ---------------- 子账号 ---------------- */

  inviteMember(id: number, body: InviteMemberBody): Promise<AxiosResponse<ApiResponse<InviteMemberResponse>>> {
    return request.post(`/api/v1/authz/vendors/${id}/members/invite`, body);
  },

  suspendMember(vendorID: number, memberID: number): Promise<AxiosResponse<ApiResponse<{ vendor_id: number; sub_user_id: number }>>> {
    return request.post(`/api/v1/authz/vendors/${vendorID}/members/${memberID}/suspend`);
  },

  /* ---------------- 邀请 token（公开） ---------------- */

  getInvite(token: string): Promise<AxiosResponse<ApiResponse<InviteInfo>>> {
    return request.get(`/api/v1/authz/invites/${token}`);
  },
};
