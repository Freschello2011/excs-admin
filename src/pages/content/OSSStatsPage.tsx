import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, Select, Space, Statistic, Spin, Row, Col } from 'antd';

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div style={{ margin: '24px 0 12px', fontWeight: 500, color: 'var(--color-on-surface)' }}>
    {children}
  </div>
);
import { useMessage } from '@/hooks/useMessage';
import {
  DeleteOutlined,
  CloudOutlined,
  LockOutlined,
  FileImageOutlined,
  RocketOutlined,
  RobotOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import NASBucketCard from '@/components/nas/NASBucketCard';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { contentApi } from '@/api/content';
import { analyticsApi } from '@/api/analytics';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useHallStore } from '@/stores/hallStore';
import type { HallListItem } from '@/api/gen/client';
import type { BucketStats } from '@/api/gen/client';

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

interface BucketCardProps {
  title: string;
  icon: React.ReactNode;
  stats: BucketStats;
  color: string;
}

function BucketCard({ title, icon, stats, color }: BucketCardProps) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: color, color: '#fff', fontSize: 20,
        }}>
          {icon}
        </div>
        <span style={{ fontWeight: 500, fontSize: 16 }}>{title}</span>
      </div>
      <Row gutter={24}>
        <Col span={12}>
          <Statistic title="文件数量" value={stats.object_count} suffix="个" />
        </Col>
        <Col span={12}>
          <Statistic title="总大小" value={formatSize(stats.total_size_bytes)} />
        </Col>
      </Row>
    </Card>
  );
}

export default function OSSStatsPage({ embedded }: { embedded?: boolean } = {}) {
  const { message } = useMessage();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const setSelectedHall = useHallStore((s) => s.setSelectedHall);
  const clearSelectedHall = useHallStore((s) => s.clearSelectedHall);

  // Halls dropdown
  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 } as Record<string, unknown>),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data,
  });
  const halls = hallsData?.list ?? [];
  const hallOptions = halls.map((h: HallListItem) => ({ value: h.id, label: h.name }));

  // OSS stats（"展厅可分摊"分区，按 hallID 前缀累加）
  const { data: stats, isLoading } = useQuery({
    queryKey: queryKeys.ossStats(selectedHallId!),
    queryFn: () => contentApi.getOSSStats(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  // ADR-0027: "平台公共开销"分区（无 hallID 概念，全桶聚合；仅 admin 可见）
  const { data: platformStats } = useQuery({
    queryKey: queryKeys.ossStatsPlatform(),
    queryFn: () => analyticsApi.getPlatformOssStats(),
    select: (res) => res.data.data,
    enabled: isAdmin(),
  });

  const cleanupMutation = useMutation({
    mutationFn: ({ reason }: { reason?: string }) =>
      contentApi.triggerCleanup(selectedHallId!, reason),
    onSuccess: (res) => {
      const d = res.data.data;
      message.success(`清理完成：删除 ${d.deleted_objects} 个文件，释放 ${formatSize(d.freed_bytes)}`);
    },
    onError: (err: Error) => message.error(err.message || '清理失败'),
  });

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="存储统计"
          description="查看各展厅的 OSS 存储用量 + NAS 归档总量"
        />
      )}

      <Space wrap style={{ marginBottom: 24 }}>
        <Select
          style={{ width: 200 }}
          placeholder="选择展厅"
          allowClear
          value={selectedHallId}
          onChange={(v) => {
            if (v) {
              const hall = halls.find((h: HallListItem) => h.id === v);
              setSelectedHall(v, hall?.name ?? '');
            } else {
              clearSelectedHall();
            }
          }}
          options={hallOptions}
        />
        {isAdmin() && selectedHallId && (
          <RiskyActionButton
            action="content.cleanup"
            danger
            icon={<DeleteOutlined />}
            loading={cleanupMutation.isPending}
            confirmTitle="触发过期内容清理"
            confirmContent="将清理加密桶中所有 App 实例已确认就绪且超过保留天数的文件（与 NAS 归档无关，NAS 归档永不随此删除）。请填写操作原因（≥ 5 字，审计用）。"
            onConfirm={async (reason) => {
              await cleanupMutation.mutateAsync({ reason });
            }}
          >
            触发清理
          </RiskyActionButton>
        )}
      </Space>

      <SectionTitle>展厅可分摊（按展厅 ID 前缀累加）</SectionTitle>
      <Row gutter={[16, 16]}>
        {/* NAS 归档是跨展厅聚合统计，独立于展厅选择始终展示 */}
        {isAdmin() && (
          <Col xs={24} md={12} lg={6}>
            <NASBucketCard />
          </Col>
        )}

        {!selectedHallId ? (
          <Col xs={24} lg={isAdmin() ? 18 : 24}>
            <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
              请先选择展厅查看 OSS 存储用量
            </div>
          </Col>
        ) : isLoading ? (
          <Col xs={24} lg={isAdmin() ? 18 : 24}>
            <Spin style={{ display: 'flex', justifyContent: 'center', marginTop: 60 }} />
          </Col>
        ) : stats ? (
          <>
            <Col xs={24} md={12} lg={6}>
              <BucketCard
                title="原始桶 (excs-raw)"
                icon={<CloudOutlined />}
                stats={stats.raw_bucket}
                color="#1677ff"
              />
            </Col>
            <Col xs={24} md={12} lg={6}>
              <BucketCard
                title="加密桶 (excs-encrypted)"
                icon={<LockOutlined />}
                stats={stats.encrypted_bucket}
                color="#52c41a"
              />
            </Col>
            <Col xs={24} md={12} lg={6}>
              <BucketCard
                title="缩略图桶 (excs-thumbnail)"
                icon={<FileImageOutlined />}
                stats={stats.thumbnail_bucket}
                color="#faad14"
              />
            </Col>
          </>
        ) : null}
      </Row>

      {/* ADR-0027: 平台公共开销分区（仅 admin 可见，无 hallID 概念） */}
      {isAdmin() && (
        <>
          <SectionTitle>平台公共开销（无展厅概念，全平台共享）</SectionTitle>
          <Row gutter={[16, 16]}>
            {platformStats ? (
              <>
                <Col xs={24} md={12} lg={8}>
                  <BucketCard
                    title="App 发布包 (excs-releases)"
                    icon={<RocketOutlined />}
                    stats={platformStats.releases_bucket}
                    color="#13c2c2"
                  />
                </Col>
                <Col xs={24} md={12} lg={8}>
                  <BucketCard
                    title="数字人模板+TTS (excs-ai-assets)"
                    icon={<RobotOutlined />}
                    stats={platformStats.ai_assets_platform_bucket}
                    color="#eb2f96"
                  />
                </Col>
                <Col xs={24} md={12} lg={8}>
                  <BucketCard
                    title="Diag 录像 (excs-recordings)"
                    icon={<VideoCameraOutlined />}
                    stats={platformStats.recordings_bucket}
                    color="#fa541c"
                  />
                </Col>
              </>
            ) : (
              <Col xs={24}>
                <Spin style={{ display: 'flex', justifyContent: 'center', padding: 40 }} />
              </Col>
            )}
          </Row>
        </>
      )}
    </div>
  );
}
