import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type { LoginResponse, RefreshTokenResponse, MeResponse } from '@/types/auth';
import type { UserActionSet, ExplainResult, ResourceRef } from '@/types/authz';

export const authApi = {
  /** Exchange SSO authorization code for ExCS tokens */
  loginByCode(
    ssoCode: string,
    redirectUri: string,
  ): Promise<AxiosResponse<ApiResponse<LoginResponse>>> {
    return request.post('/api/v1/auth/login', {
      sso_code: ssoCode,
      redirect_uri: redirectUri,
    });
  },

  /** Refresh access token */
  refresh(
    refreshToken: string,
  ): Promise<AxiosResponse<ApiResponse<RefreshTokenResponse>>> {
    return request.post('/api/v1/auth/refresh', {
      refresh_token: refreshToken,
    });
  },

  /** Get current user info */
  getMe(): Promise<AxiosResponse<ApiResponse<MeResponse>>> {
    return request.get('/api/v1/auth/me');
  },

  /** 当前用户 action set（供前端 can() helper） */
  getMyActionSet(): Promise<AxiosResponse<ApiResponse<UserActionSet>>> {
    return request.get('/api/v1/authz/me/action-set');
  },

  /** 解释某个 action 的允许/拒绝原因（"为什么能/不能" 弹窗） */
  explainPermission(
    userId: number,
    action: string,
    resource?: ResourceRef,
  ): Promise<AxiosResponse<ApiResponse<ExplainResult>>> {
    const params: Record<string, string | number> = { user_id: userId, action };
    if (resource) {
      params.resource_type = resource.type;
      params.resource_id = resource.id;
    }
    return request.get('/api/v1/authz/explain', { params });
  },
};
