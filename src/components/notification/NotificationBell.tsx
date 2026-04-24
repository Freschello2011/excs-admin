/**
 * Phase 9 顶栏 🔔 badge + popover 组件。
 *
 * 两处复用：
 *   - AdminLayout 顶栏替换原"点一下跳 /notifications"的静态按钮；
 *   - VendorLayout 顶栏直接使用。
 *
 * 点击跳转：compact 列表里点单条消息 → 跳 m.link_url；popover 底部"查看全部"跳到
 * `viewAllPath`（由外部传；AdminLayout→/notifications；VendorLayout→/vendor/messages）。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Popover } from 'antd';
import { userMessageApi } from '@/api/userMessage';
import { queryKeys } from '@/api/queryKeys';
import NotificationList from './NotificationList';

interface NotificationBellProps {
  /** 点"查看全部"跳到哪个页面（AdminLayout: /notifications；VendorLayout: /vendor/messages） */
  viewAllPath: string;
  /** 按钮外层样式 class（复用宿主 Layout 的图标按钮样式） */
  buttonClassName?: string;
}

export default function NotificationBell({ viewAllPath, buttonClassName }: NotificationBellProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // 顶栏 badge：30s 一刷；窗口聚焦也刷；生产环境后续可换 SSE/MQTT 推送。
  const { data } = useQuery({
    queryKey: queryKeys.userMessagesUnreadCount,
    queryFn: () => userMessageApi.unreadCount(),
    select: (res) => res.data.data?.unread ?? 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
  const unread = data ?? 0;

  const content = (
    <div style={{ width: 360, maxHeight: 480, overflowY: 'auto' }}>
      <NotificationList size="compact" onItemClick={() => setOpen(false)} />
      <div style={{ borderTop: '1px solid var(--ant-color-border-secondary, #eee)', padding: 8, textAlign: 'center' }}>
        <Button
          type="link"
          size="small"
          onClick={() => {
            setOpen(false);
            navigate(viewAllPath);
          }}
        >
          查看全部消息
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      destroyOnHidden
      styles={{ container: { padding: 0 } }}
    >
      <button type="button" className={buttonClassName} aria-label="消息通知">
        <Badge count={unread} size="small" offset={[-2, 2]}>
          <span className="material-symbols-outlined">notifications</span>
        </Badge>
      </button>
    </Popover>
  );
}
