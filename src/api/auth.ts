import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type { LoginResponse, RefreshTokenResponse, MeResponse } from '@/types/auth';

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
};
