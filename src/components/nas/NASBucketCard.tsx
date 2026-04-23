import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Col, Divider, Row, Spin, Statistic, Tag, Tooltip } from 'antd';
import { CloudDownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { nasArchiveApi } from '@/api/nasArchive';
import { queryKeys } from '@/api/queryKeys';

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

function formatRelative(iso: string): string {
  const now = dayjs();
  const then = dayjs(iso);
  const diffSec = now.diff(then, 'second');
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  return then.format('YYYY-MM-DD HH:mm');
}

/**
 * NAS 归档卡片 —— 存储统计页右侧一张独立卡。
 * 数据来自后端 /api/v1/nas-archive/stats（DB 聚合 + 心跳合并），不走 NAS listdir。
 * 仅 isAdmin 路由可访问（ossStats 页面整页已是 admin only）。
 */
export function NASBucketCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.nasArchiveStats(),
    queryFn: () => nasArchiveApi.stats(),
    select: (res) => res.data.data,
    refetchInterval: 60_000, // 1 min auto refresh（心跳常态变化）
  });

  if (isLoading) {
    return (
      <Card>
        <Spin style={{ display: 'flex', justifyContent: 'center', padding: 24 }} />
      </Card>
    );
  }

  // 允许 data 为 undefined（接口不可用 / NAS 未配置）—— 仍然展示卡片外壳，
  // 避免"存储统计"页面上缺少一张卡造成布局错位或被误认为功能丢失。
  const counts = data?.count_by_status || ({} as Record<string, number>);
  const pending = counts.pending ?? 0;
  const syncing = counts.syncing ?? 0;
  const failed = counts.failed ?? 0;

  const agents = data?.agents ?? [];
  const onlineAgent = agents.find((a) => a.online);
  const anyAgent = agents[0];
  const headAgent = onlineAgent ?? anyAgent ?? null;

  const totalCount = data?.total_count ?? 0;
  const totalSize = data?.total_size ?? 0;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#722ed1',
            color: '#fff',
            fontSize: 20,
          }}
        >
          <CloudDownloadOutlined />
        </div>
        <span style={{ fontWeight: 500, fontSize: 16 }}>NAS 归档 (Synology)</span>
      </div>
      <Row gutter={24}>
        <Col span={12}>
          <Statistic title="归档文件数" value={totalCount} suffix="个" />
        </Col>
        <Col span={12}>
          <Statistic title="归档总大小" value={formatSize(totalSize)} />
        </Col>
      </Row>

      <Divider style={{ margin: '16px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--color-outline)' }}>Agent:</span>
          {isError ? (
            <>
              <Badge status="warning" />
              <span style={{ color: 'var(--color-outline)' }}>接口未就绪</span>
            </>
          ) : headAgent ? (
            <>
              <Badge status={headAgent.online ? 'success' : 'error'} />
              <span>{headAgent.online ? '在线' : '离线'}</span>
              <Tooltip title={`ID: ${headAgent.agent_id}  版本: ${headAgent.version || '-'}`}>
                <span style={{ color: 'var(--color-outline)', fontSize: 12 }}>
                  · 最后心跳 {formatRelative(headAgent.last_seen_at)}
                </span>
              </Tooltip>
            </>
          ) : (
            <>
              <Badge status="default" />
              <span style={{ color: 'var(--color-outline)' }}>无 Agent</span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tag color={pending > 0 ? 'orange' : 'default'}>待同步 {pending}</Tag>
          <Tag color={syncing > 0 ? 'blue' : 'default'}>同步中 {syncing}</Tag>
          <Tag color={failed > 0 ? 'red' : 'default'}>失败 {failed}</Tag>
        </div>
      </div>
    </Card>
  );
}

export default NASBucketCard;
