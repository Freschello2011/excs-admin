/**
 * 专用控台 App SSO 回调占位页。
 *
 * - 控台 App 的 SSO `redirect_uri` 用 `/control-callback`（跟 admin 自己的
 *   `/login/callback` 彻底隔开），目的：admin SPA 路由到这里，组件是空壳，
 *   **绝不调用 authStore.handleLoginCallback**，从根上杜绝 admin 抢消费 code。
 * - Flutter WebView 在 `onPageStarted` 就会截获 callback URL 并 `loadRequest(about:blank)`，
 *   本页实际上可能都来不及渲染。即使在 macOS WKWebView 的时序下本页先加载，
 *   它也是纯占位 — 不跑任何副作用。
 * - 用户真人在浏览器里意外打开，看到一句提示也好过卡在空白。
 */
export default function ControlAppCallbackPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        gap: 12,
        color: '#666',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <p style={{ fontSize: '1rem', fontWeight: 600 }}>授权码已捕获</p>
      <p style={{ fontSize: '0.875rem' }}>请返回中控 App 查看登录进度</p>
    </div>
  );
}
