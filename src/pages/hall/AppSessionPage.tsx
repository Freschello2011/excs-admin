import { useState } from 'react';
import { Tabs } from 'antd';
import { useHallStore } from '@/stores/hallStore';
import AppInstanceTab from './tabs/AppInstanceTab';
import ControlAppTab from './tabs/ControlAppTab';
import PageHeader from '@/components/common/PageHeader';

export default function AppSessionPage() {
  const [activeTab, setActiveTab] = useState('instances');
  const hallId = useHallStore((s) => s.selectedHallId);

  const tabItems = hallId ? [
    {
      key: 'instances',
      label: 'App 实例',
      children: <AppInstanceTab hallId={hallId} />,
    },
    {
      key: 'control-sessions',
      label: '中控会话',
      children: <ControlAppTab hallId={hallId} />,
    },
  ] : [];

  return (
    <div>
      <PageHeader title="App 与中控" />
      {hallId ? (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          style={{ marginTop: 8 }}
        />
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅
        </div>
      )}
    </div>
  );
}
