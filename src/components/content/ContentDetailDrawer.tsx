/**
 * ContentDetailDrawer —— Phase 12：内容详情抽屉。
 *
 * 内容：
 *   - 顶部：状态大徽章 + 文件名 + v 号 + 关键元数据（类型 / 大小 / 时长 / 上传时间）
 *   - 驳回原因区（仅 status=rejected）：原因码 Tag + 自由文本 + 驳回时间
 *   - 操作时间线：上传 → 驳回（可选）→ 接收（可选）→ 归档（可选）
 *   - 版本链：调 GET /contents/:id/versions，新→旧横向卡片
 *
 * 调用方：内容总库 / VendorDetailPage 上传内容 Tab / MyContentsPage 行点击触发。
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Drawer, Empty, Skeleton, Space, Tag, Timeline, Typography } from 'antd';
import ContentStatusTag from '@/components/content/ContentStatusTag';
import { contentApi } from '@/api/content';
import type { ContentDetail, ContentRejectReason } from '@/types/content';
import { REJECT_REASON_LABEL } from '@/types/content';

const { Text, Title, Paragraph } = Typography;

interface Props {
  open: boolean;
  contentId: number | null;
  onClose: () => void;
}

function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(s?: string): string {
  if (!s) return '-';
  return s.slice(0, 19).replace('T', ' ');
}

export default function ContentDetailDrawer({ open, contentId, onClose }: Props) {
  // 主体内容：始终调旧的 /contents/:id（兼容老内容、Phase 12 后端未部署的环境）
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['content', 'detail', contentId],
    queryFn: () => contentApi.getContent(contentId!),
    select: (res) => res.data.data as ContentDetail,
    enabled: open && contentId != null,
  });

  // 版本链：可选补充，404 / 5xx 均退化为"无历史版本"显示，不阻塞主体
  const { data: chain = [] } = useQuery({
    queryKey: ['content', 'versions', contentId],
    queryFn: async () => {
      try {
        const r = await contentApi.getVersionChain(contentId!);
        return (r.data.data ?? []) as ContentDetail[];
      } catch {
        return [] as ContentDetail[];
      }
    },
    enabled: open && contentId != null,
    retry: false,
  });

  const current = detail;
  const isLoading = detailLoading;

  const timelineItems = useMemo(() => {
    if (!current) return [];
    const items: { color: string; label: string; ts?: string }[] = [];
    items.push({ color: 'blue', label: `v${current.content_version ?? 1} 上传完成`, ts: current.created_at });
    if (current.status === 'rejected') {
      items.push({ color: 'red', label: '已驳回', ts: current.reviewed_at });
    } else if (current.status === 'bound') {
      items.push({ color: 'green', label: `已绑定到 ${current.hall_name ?? '展厅'}`, ts: current.reviewed_at });
    } else if (current.status === 'withdrawn') {
      items.push({ color: 'gray', label: '已撤回（供应商主动）' });
    } else if (current.status === 'archived') {
      items.push({ color: 'gray', label: '已归档（被新版本替换或运维归档）' });
    }
    return items;
  }, [current]);

  return (
    <Drawer
      title={current ? (
        <Space size={8}>
          <span>{current.name}</span>
          {current.content_version && current.content_version > 1 && (
            <Tag color="purple">v{current.content_version}</Tag>
          )}
          <ContentStatusTag status={current.status} />
        </Space>
      ) : '内容详情'}
      open={open}
      onClose={onClose}
      width={680}
      destroyOnHidden
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !current ? (
        <Empty description="未找到内容" />
      ) : (
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          {/* 元数据 */}
          <section>
            <Title level={5} style={{ marginTop: 0 }}>基本信息</Title>
            <Space size={[16, 6]} wrap>
              <Text type="secondary">类型：<Text>{current.type}</Text></Text>
              <Text type="secondary">大小：<Text>{formatFileSize(current.file_size)}</Text></Text>
              {current.duration > 0 && (
                <Text type="secondary">时长：<Text>{Math.round(current.duration / 1000)}s</Text></Text>
              )}
              <Text type="secondary">上传时间：<Text>{formatDate(current.created_at)}</Text></Text>
              {current.hall_name && (
                <Text type="secondary">展厅：<Tag color="blue">{current.hall_name}</Tag></Text>
              )}
            </Space>
          </section>

          {/* 驳回原因 — 仅 rejected */}
          {current.status === 'rejected' && (
            <section>
              <Title level={5} style={{ marginTop: 0, color: 'var(--ant-color-error)' }}>驳回原因</Title>
              <Space wrap size={6} style={{ marginBottom: 8 }}>
                {(current.reject_reasons ?? []).map((r) => (
                  <Tag key={r} color="red">{REJECT_REASON_LABEL[r as ContentRejectReason] ?? r}</Tag>
                ))}
              </Space>
              {current.reject_note && (
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  补充说明：{current.reject_note}
                </Paragraph>
              )}
              {current.reviewed_at && (
                <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                  驳回时间：{formatDate(current.reviewed_at)}
                </Paragraph>
              )}
            </section>
          )}

          {/* 操作时间线 */}
          <section>
            <Title level={5} style={{ marginTop: 0 }}>操作历史</Title>
            <Timeline
              items={timelineItems.map((it) => ({
                color: it.color,
                children: (
                  <Space direction="vertical" size={0}>
                    <Text>{it.label}</Text>
                    {it.ts && <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(it.ts)}</Text>}
                  </Space>
                ),
              }))}
            />
          </section>

          {/* 版本链 — 过滤掉自己（current.id），只显示更老的版本 */}
          {chain.filter((c) => c.id !== current.id).length > 0 && (
            <section>
              <Title level={5} style={{ marginTop: 0 }}>历史版本（{chain.filter((c) => c.id !== current.id).length}）</Title>
              <Space direction="vertical" style={{ width: '100%' }}>
                {chain.filter((c) => c.id !== current.id).map((old) => (
                  <div
                    key={old.id}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--ant-color-bg-layout)',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Space size={6}>
                      <Tag color="purple">v{old.content_version ?? 1}</Tag>
                      <Text>{old.name}</Text>
                      <ContentStatusTag status={old.status} />
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(old.created_at)}</Text>
                  </div>
                ))}
              </Space>
            </section>
          )}
        </Space>
      )}
    </Drawer>
  );
}
