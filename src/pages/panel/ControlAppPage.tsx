import { useState } from 'react';
import { Tabs } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { useHallStore } from '@/stores/hallStore';
import PanelEditorPage from './PanelEditorPage';
import PairingCodeTab from '@/pages/hall/tabs/PairingCodeTab';

export default function ControlAppPage() {
  const hallId = useHallStore((s) => s.selectedHallId);
  const [activeTab, setActiveTab] = useState<'panel' | 'pairing'>('panel');

  const tabItems = [
    {
      key: 'panel',
      label: '面板编辑',
      children: <PanelEditorPage />,
    },
    {
      key: 'pairing',
      label: '中控配对码',
      children: hallId ? (
        <PairingCodeTab hallId={hallId} mode="hall" />
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="中控管理" description="面板卡片布局与中控 App 配对码管理" />
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'panel' | 'pairing')}
        items={tabItems}
        style={{ marginTop: 8 }}
      />
    </div>
  );
}
