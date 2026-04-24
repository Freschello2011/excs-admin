/**
 * Phase 9 站内消息列表（复用组件）。
 *
 * 同时给 AdminLayout 的顶栏 popover（紧凑模式，showTabs=false/size='compact'）
 * 和 VendorLayout 下的 /vendor/messages 全页（showTabs=true）使用；两处列表结构一致、
 * 点击行为一致（标已读 + 跳 link_url）。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Empty, List, Pagination, Radio, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { userMessageApi } from '@/api/userMessage';
import { queryKeys } from '@/api/queryKeys';
import type { UserMessage } from '@/types/userMessage';

const { Text, Paragraph } = Typography;

interface NotificationListProps {
  /** 'compact' 顶栏 popover；'full' 全页（MessagesPage） */
  size?: 'compact' | 'full';
  /** 点击条目后的额外回调（popover 场景里用于关闭） */
  onItemClick?: () => void;
}

/** type → 中文 + 颜色；后端可能扩展新类型，未命中时 fallback 'default' */
const TYPE_META: Record<string, { label: string; color: string }> = {
  'authz.grant_expiring': { label: '授权到期提醒', color: 'orange' },
  'authz.grant_expired': { label: '授权已过期', color: 'red' },
  'authz.vendor_created': { label: '账号创建', color: 'blue' },
  'authz.vendor_primary_transferred': { label: '主账号变更', color: 'purple' },
};

export default function NotificationList({ size = 'full', onItemClick }: NotificationListProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = size === 'compact' ? 8 : 20;

  const params = useMemo(
    () => ({ unread_only: unreadOnly, page, page_size: pageSize }),
    [unreadOnly, page, pageSize],
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.userMessages(params as Record<string, unknown>),
    queryFn: () => userMessageApi.list(params),
    select: (res) => res.data.data,
    // 消息是实时类数据，进入可见区域刷一次；更精细的实时推送留到后续
    refetchOnWindowFocus: size === 'compact',
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => userMessageApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-messages'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => userMessageApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-messages'] });
    },
  });

  function handleItemClick(m: UserMessage) {
    if (!m.is_read) {
      markReadMutation.mutate(m.id);
    }
    if (m.link_url) {
      navigate(m.link_url);
    }
    onItemClick?.();
  }

  const list = data?.list ?? [];
  const total = data?.total ?? 0;
  const unread = data?.unread ?? 0;

  return (
    <div>
      {size === 'full' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Radio.Group
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(e) => {
              setUnreadOnly(e.target.value === 'unread');
              setPage(1);
            }}
            options={[
              { value: 'all', label: '全部' },
              { value: 'unread', label: `未读（${unread}）` },
            ]}
            optionType="button"
            buttonStyle="solid"
            size="small"
          />
          <Button
            size="small"
            disabled={unread === 0 || markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
          >
            全部标记已读
          </Button>
        </div>
      )}

      {size === 'compact' && unread > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 8px' }}>
          <Button size="small" type="link" onClick={() => markAllReadMutation.mutate()}>
            全部已读
          </Button>
        </div>
      )}

      {list.length === 0 && !isLoading ? (
        <Empty description="暂无消息" />
      ) : (
        <List
          loading={isLoading}
          dataSource={list}
          renderItem={(m) => {
            const meta = TYPE_META[m.type] ?? { label: m.type, color: 'default' };
            return (
              <List.Item
                key={m.id}
                style={{
                  padding: size === 'compact' ? '8px 12px' : '12px 0',
                  cursor: 'pointer',
                  background: m.is_read ? undefined : 'var(--ant-color-info-bg, rgba(22,119,255,0.04))',
                }}
                onClick={() => handleItemClick(m)}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Tag color={meta.color} style={{ margin: 0 }}>{meta.label}</Tag>
                      <Text strong style={{ fontSize: size === 'compact' ? 13 : 14 }}>{m.title}</Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {dayjs(m.created_at).format('MM-DD HH:mm')}
                    </Text>
                  </div>
                  <Paragraph
                    type="secondary"
                    ellipsis={{ rows: size === 'compact' ? 2 : 3 }}
                    style={{ marginBottom: 0, fontSize: 12 }}
                  >
                    {m.content}
                  </Paragraph>
                </div>
              </List.Item>
            );
          }}
        />
      )}

      {size === 'full' && total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger={false}
            showTotal={(t) => `共 ${t} 条`}
            onChange={(p) => setPage(p)}
          />
        </div>
      )}
    </div>
  );
}
