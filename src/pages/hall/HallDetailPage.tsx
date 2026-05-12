import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Spin, Space } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import { useCan } from '@/lib/authz/can';
import Can from '@/components/authz/Can';
import HallAuthzPanel from '@/components/authz/HallAuthzPanel';
import HallInfoTab from './tabs/HallInfoTab';
import HallConfigTab from './tabs/HallConfigTab';
import styles from './HallDetailPage.module.scss';

export default function HallDetailPage() {
  const { hallId: hallIdStr } = useParams<{ hallId: string }>();
  const hallId = Number(hallIdStr);
  const navigate = useNavigate();
  const canConfig = useCan('hall.update_config', { type: 'hall', id: String(hallId) });
  const setSelectedHall = useHallStore((s) => s.setSelectedHall);

  const { data: hall, isLoading } = useQuery({
    queryKey: queryKeys.hallDetail(hallId),
    queryFn: () => hallApi.getHall(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  // Sync sidebar selection when navigating to a hall detail page
  useEffect(() => {
    if (hall) {
      setSelectedHall(hallId, hall.name);
    }
  }, [hall, hallId, setSelectedHall]);

  if (isLoading) {
    return <Spin className={styles.spinCenter} />;
  }

  if (!hall) {
    return <div className={styles.notFound}>展厅不存在</div>;
  }

  const statusKey = hall.status === 'active' ? 'normal' : hall.status;

  return (
    <div>
      <PageHeader
        title={hall.name}
        extra={
          <Space>
            <StatusTag status={statusKey} />
            <Button onClick={() => navigate('/halls')}>返回列表</Button>
          </Space>
        }
      />

      {/* 基本信息 */}
      <div className={styles.section}>
        <HallInfoTab hall={hall} />
      </div>

      {/* 配置参数 */}
      <div className={styles.sectionLg}>
        <HallConfigTab hallId={hallId} hall={hall} canConfig={canConfig} />
      </div>

      {/* 权限分布（Phase 7.2 按资源视角） */}
      <Can action="user.view">
        <div className={styles.sectionLg}>
          <HallAuthzPanel hallId={hallId} hallName={hall.name} />
        </div>
      </Can>
    </div>
  );
}
