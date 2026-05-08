import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { App as AntApp } from 'antd';
import AntdConfigProvider from './providers/AntdConfigProvider';
import { MessageBridge } from './components/MessageBridge';
import { LogoutBlockBridge } from './components/LogoutBlockBridge';
import App from './App';
import './styles/global.scss';
import './styles/field-mode-tokens.scss';

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
  return (
    <QueryClientProvider client={queryClient}>
      <AntdConfigProvider>
        <AntApp>
          <MessageBridge />
          <LogoutBlockBridge />
          <App />
        </AntApp>
      </AntdConfigProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />}
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
