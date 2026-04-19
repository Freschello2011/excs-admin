/**
 * 轻量事件总线，用于 React 树外（如 axios 拦截器）发起 message toast。
 * 组件层的 MessageBridge 会订阅 bus，用 App.useApp() 拿到的 message 实例展示，
 * 从而让脱离 ConfigProvider context 的 toast 也能跟随主题。
 */
export type MessageBusLevel = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface MessageBusPayload {
  level: MessageBusLevel;
  content: string;
  duration?: number;
}

type Listener = (payload: MessageBusPayload) => void;

const listeners = new Set<Listener>();

export const messageBus = {
  emit(payload: MessageBusPayload): void {
    listeners.forEach((l) => l(payload));
  },
  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
