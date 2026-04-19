import { App } from 'antd';

/**
 * 在组件/自定义 hook 内替代 AntD 静态 `message.*` / `Modal.*` / `notification.*` 调用。
 * 返回的实例由 `<App>` 组件通过 context 注入，能正确跟随 ConfigProvider 主题
 * （尤其是暗黑模式下的背景/文字配色）。
 *
 * 用法：
 *   const { message, modal, notification } = useMessage();
 *   message.success('已保存');
 *   modal.confirm({ title: '确认删除？', onOk: () => ... });
 */
export function useMessage() {
  return App.useApp();
}
