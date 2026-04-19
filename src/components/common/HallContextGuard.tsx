import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Modal, Button, Empty, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useHallStore } from '@/stores/hallStore';
import { useAuthStore } from '@/stores/authStore';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { HallListItem } from '@/types/hall';

/**
 * 包裹所有「展厅管理」region 的路由 element。
 *
 * 规则：
 * - URL 中已有 :hallId 参数 → 自动同步到 hallStore，放行。
 * - 未选展厅 → 弹「请选择展厅」modal，列出当前用户可访问的展厅。
 * - 已选展厅 → 放行。
 */
export default function HallContextGuard({ children }: { children: React.ReactNode }) {
  const params = useParams<{ hallId?: string }>();
  const urlHallId = params.hallId ? Number(params.hallId) : undefined;

  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const setSelectedHall = useHallStore((s) => s.setSelectedHall);

  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const needsHallList = !urlHallId && selectedHallId === undefined;

  const { data: hallsData, isLoading } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 } as Record<string, unknown>),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data,
    enabled: needsHallList,
  });

  const allHalls: HallListItem[] = useMemo(() => hallsData?.list ?? [], [hallsData]);

  const accessibleHalls: HallListItem[] = useMemo(() => {
    if (isAdmin()) return allHalls;
    const allowedIds = new Set(user?.hall_permissions?.map((hp) => hp.hall_id) ?? []);
    return allHalls.filter((h) => allowedIds.has(h.id));
  }, [allHalls, isAdmin, user]);

  // URL 中的 hallId 权威，自动同步到 store
  useEffect(() => {
    if (urlHallId && urlHallId !== selectedHallId) {
      const hall = allHalls.find((h) => h.id === urlHallId);
      setSelectedHall(urlHallId, hall?.name ?? `展厅 ${urlHallId}`);
    }
  }, [urlHallId, selectedHallId, allHalls, setSelectedHall]);

  if (urlHallId || selectedHallId) {
    return <>{children}</>;
  }

  return (
    <Modal
      title="请选择展厅"
      open
      closable={false}
      footer={null}
      maskClosable={false}
      keyboard={false}
      centered
    >
      <p style={{ marginBottom: 16, color: '#64748b' }}>
        该页面需要先选择展厅，请从下方选择：
      </p>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin />
        </div>
      ) : accessibleHalls.length === 0 ? (
        <Empty description="暂无可访问的展厅，请联系管理员分配权限" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accessibleHalls.map((hall) => (
            <Button
              key={hall.id}
              block
              size="large"
              icon={<span className="material-symbols-outlined" style={{ fontSize: 18 }}>museum</span>}
              onClick={() => setSelectedHall(hall.id, hall.name)}
              style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {hall.name}
            </Button>
          ))}
        </div>
      )}
    </Modal>
  );
}
