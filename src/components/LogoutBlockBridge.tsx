import { useEffect } from 'react';
import { useMessage } from '@/hooks/useMessage';

/**
 * Bug 5b：监听 `excs:logout-blocked` window 事件，当 request.ts 检测到用户在编辑器
 * dirty / 有 timeline 草稿残留时阻断硬踢，改为弹 Modal 让用户先导出/保存草稿。
 *
 * 触发路径（仅一种 reason 走这里）：timeline_draft —— request.ts shouldBlockLogoutForDraft
 * 命中时 dispatchEvent。Modal 关闭即让用户继续编辑（autosave 已落盘草稿可恢复）。
 *
 * 必须在 AntD `<App>` 内渲染（用 useApp 拿主题感知的 modal 实例）。
 */
export function LogoutBlockBridge() {
  const { modal } = useMessage();

  useEffect(() => {
    function onBlocked(e: Event) {
      const detail = (e as CustomEvent<{ reason: string; confirm?: () => void }>).detail;
      if (!detail || detail.reason !== 'timeline_draft') return;

      modal.warning({
        title: '会话已过期，但检测到未保存的演出草稿',
        content:
          '为防止丢稿，已暂停自动跳转到登录页。请先打开演出时间线编辑器，确认草稿已落盘 / 导出 JSON 备份；完成后点【确认重新登录】回到 SSO 登录页。',
        okText: '我已保存好，重新登录',
        cancelText: '继续编辑',
        // antd modal.warning 默认无 cancel；强制开
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ closable: true, maskClosable: false, okCancel: true } as any),
        onOk: () => detail.confirm?.(),
      });
    }
    window.addEventListener('excs:logout-blocked', onBlocked);
    return () => window.removeEventListener('excs:logout-blocked', onBlocked);
  }, [modal]);

  return null;
}
