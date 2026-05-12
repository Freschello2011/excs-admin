import { Navigate, useSearchParams } from 'react-router-dom';
import { Tabs } from 'antd';
import { useHallStore } from '@/stores/hallStore';
import { useCan } from '@/lib/authz/can';
import { useExhibitContextSync } from '@/hooks/useExhibitContextSync';
import ExhibitTab from './tabs/ExhibitTab';
import PairingCodeTab from './tabs/PairingCodeTab';
import PageHeader from '@/components/common/PageHeader';

type OuterTab = 'list' | 'pairing-codes';

export default function ExhibitManagementPage() {
  const hallId = useHallStore((s) => s.selectedHallId);
  const effectiveExhibitId = useExhibitContextSync();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: OuterTab = searchParams.get('tab') === 'pairing-codes' ? 'pairing-codes' : 'list';
  const canConfig = useCan('exhibit.edit', hallId ? { type: 'hall', id: String(hallId) } : undefined);

  // 顶栏已选中展项 → 直接进入展项详情（需保留配对码 tab 上下文时除外）
  if (hallId && effectiveExhibitId && activeTab === 'list') {
    return <Navigate to={`/halls/${hallId}/exhibit-management/${effectiveExhibitId}`} replace />;
  }

  const handleTabChange = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'list') next.delete('tab');
    else next.set('tab', v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="展项管理" />
      {hallId ? (
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={[
            {
              key: 'list',
              label: '展项列表',
              children: <ExhibitTab hallId={hallId} canConfig={canConfig} highlightExhibitId={effectiveExhibitId} />,
            },
            {
              key: 'pairing-codes',
              label: '配对码',
              children: <PairingCodeTab hallId={hallId} mode="exhibit" exhibitId={effectiveExhibitId} />,
            },
          ]}
        />
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅
        </div>
      )}
    </div>
  );
}
