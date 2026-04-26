import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useBrandingStore } from '@/stores/brandingStore';
import { redirectToSSO } from '@/api/request';
import { resolveAccountType } from '@/api/gen/client';

export default function LoginCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const handleLoginCallback = useAuthStore((s) => s.handleLoginCallback);
  const [error, setError] = useState<string | null>(null);

  const brandingLoaded = useBrandingStore((s) => s.loaded);
  const systemName = useBrandingStore((s) => s.systemName);
  const logoUrl = useBrandingStore((s) => s.logoUrl);
  const fetchBranding = useBrandingStore((s) => s.fetchBranding);

  useEffect(() => {
    if (!brandingLoaded) fetchBranding();
  }, [brandingLoaded, fetchBranding]);

  useEffect(() => {
    // 中控 App 短路 — 两道防线之一命中即跳过 code 消费：
    //   1) 控台 WebView 注入专属 UA（ExCSControlApp）
    //   2) 控台 SSO URL 的 redirect_uri 带 `?client=control-app` 查询参数
    // macOS WKWebView 上 setUserAgent 时序偶发不及格（loadRequest 先于 UA 生效），
    // 用 URL 参数做第二重保险；任一命中即短路，避免 admin SPA 抢消费一次性 SSO code。
    const isControlApp =
      navigator.userAgent.includes('ExCSControlApp') ||
      searchParams.get('client') === 'control-app';
    if (isControlApp) {
      return;
    }

    // SSO 拒绝授权时回调带 error 参数，优先处理
    const oauthError = searchParams.get('error');
    if (oauthError) {
      if (oauthError === 'access_denied') {
        setError('您已拒绝授权，无法登录');
      } else {
        const desc = searchParams.get('error_description');
        setError(desc || `授权失败（${oauthError}）`);
      }
      return;
    }

    const code = searchParams.get('code');
    if (!code) {
      setError('缺少授权码参数');
      return;
    }

    handleLoginCallback(code)
      .then(() => {
        // Phase 8 起按账号类型分流：vendor → /vendor，其余（internal/customer）→ /dashboard。
        // user 在 handleLoginCallback 内已写入 localStorage；从 store 取最新值即可。
        const u = useAuthStore.getState().user;
        const accountType = resolveAccountType(u);
        navigate(accountType === 'vendor' ? '/vendor' : '/dashboard', { replace: true });
      })
      .catch((err) => {
        setError(err?.message || '登录失败，请重试');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const brandingHeader = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      {logoUrl ? (
        <img src={logoUrl} alt="Logo" style={{ width: 56, height: 56, objectFit: 'contain' }} />
      ) : (
        <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--color-primary)' }}>connected_tv</span>
      )}
      <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{systemName}</p>
    </div>
  );

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        gap: '16px',
        color: 'var(--color-on-surface)',
      }}>
        {brandingHeader}
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--color-error)' }}>error</span>
        <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>登录失败</p>
        <p style={{ color: 'var(--color-outline)' }}>{error}</p>
        <button
          onClick={() => redirectToSSO({ prompt: 'login' })}
          style={{
            marginTop: 8,
            padding: '8px 24px',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          重新登录
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      gap: '16px',
    }}>
      {brandingHeader}
      <div className="loading-spinner" />
      <p style={{ color: 'var(--color-outline)' }}>正在登录...</p>
    </div>
  );
}
