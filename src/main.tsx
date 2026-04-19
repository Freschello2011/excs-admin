import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useAppStore } from './stores/appStore';
import { useThemeTokens } from './hooks/useThemeTokens';
import { MessageBridge } from './components/MessageBridge';
import App from './App';
import './styles/global.scss';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Root() {
  const currentTheme = useAppStore((s) => s.theme);
  const tokens = useThemeTokens();

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: currentTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: tokens.primary,
            colorSuccess: tokens.success,
            colorWarning: tokens.warning,
            colorError: tokens.error,
            colorBgLayout: tokens.surface,
            colorText: tokens.onSurface,
            colorBorderSecondary: tokens.outline,
            borderRadius: 8,
            borderRadiusLG: 16,
            fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 13,
            // 全局阴影升级到 shadow-md 等级 —— 多层精致阴影
            boxShadow: '0 1px 2px rgba(24, 28, 60, 0.04), 0 4px 10px rgba(24, 28, 60, 0.05), 0 10px 24px -8px rgba(80, 60, 170, 0.10)',
            boxShadowSecondary: '0 2px 4px rgba(24, 28, 60, 0.04), 0 8px 24px rgba(24, 28, 60, 0.06), 0 24px 48px -12px rgba(80, 60, 170, 0.14)',
          },
          components: {
            Table: {
              cellPaddingBlock: 12,
              headerSplitColor: 'transparent',
              headerBg: currentTheme === 'dark' ? 'rgba(26, 33, 57, 0.6)' : 'rgba(241, 241, 248, 0.8)',
              headerColor: currentTheme === 'dark' ? '#E6E8F2' : '#0F1226',
              rowHoverBg: currentTheme === 'dark' ? 'rgba(166, 141, 255, 0.06)' : 'rgba(106, 78, 232, 0.04)',
              borderColor: currentTheme === 'dark' ? '#353E5C' : '#E0E1EC',
            },
            Menu: { itemSelectedBg: 'rgba(106, 78, 232, 0.12)' },
            Card: {
              borderRadiusLG: 16,
              headerBg: 'transparent',
              headerFontSize: 14,
              headerHeight: 48,
              // 关键：去边框 + 白底 + 立体阴影
              colorBorderSecondary: 'transparent',
              boxShadowTertiary: '0 1px 2px rgba(24, 28, 60, 0.04), 0 4px 10px rgba(24, 28, 60, 0.05), 0 10px 24px -8px rgba(80, 60, 170, 0.10)',
              colorBgContainer: currentTheme === 'dark' ? 'rgba(26, 33, 57, 0.6)' : 'rgba(255, 255, 255, 0.75)',
            },
            Statistic: {
              titleFontSize: 13,
              contentFontSize: 28,
            },
          },
        }}
      >
        <AntApp>
          <MessageBridge />
          <App />
        </AntApp>
      </ConfigProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />}
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
