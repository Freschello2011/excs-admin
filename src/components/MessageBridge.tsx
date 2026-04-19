import { useEffect } from 'react';
import { useMessage } from '@/hooks/useMessage';
import { messageBus } from '@/utils/messageBus';

/**
 * 把 `messageBus` 上的事件桥接到 AntD `<App>` context 注入的 message 实例，
 * 让 axios 拦截器等 React 树外的代码也能弹出跟随主题的 toast。
 *
 * 必须在 `<App>`（AntD）内渲染，且整个应用只需挂一次。
 */
export function MessageBridge() {
  const { message } = useMessage();

  useEffect(() => {
    return messageBus.on(({ level, content, duration }) => {
      message[level](content, duration);
    });
  }, [message]);

  return null;
}
