import { useState } from 'react';
import { Tabs } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import NotificationConfigTab from './NotificationConfigTab';
import NotificationLogTab from './NotificationLogTab';

export default function NotificationListPage() {
  const [activeTab, setActiveTab] = useState('config');

  return (
    <div>
      <PageHeader title="通知管理" description="配置通知规则和查看通知记录" />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'config', label: '通知配置', children: <NotificationConfigTab /> },
          { key: 'logs', label: '通知记录', children: <NotificationLogTab /> },
        ]}
      />
    </div>
  );
}
