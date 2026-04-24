/**
 * 供应商「消息」页 —— Phase 9 / PRD §7.9。
 *
 * 纯薄壳：NotificationList 全页模式，复用顶栏 popover 同一数据源 + 标已读交互。
 */
import { Card } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import NotificationList from '@/components/notification/NotificationList';

export default function MessagesPage() {
  return (
    <div>
      <PageHeader
        title="消息"
        description="授权到期、账号变更等通知会在此集中展示；点击消息可跳转到相关页面。"
      />
      <Card>
        <NotificationList size="full" />
      </Card>
    </div>
  );
}
