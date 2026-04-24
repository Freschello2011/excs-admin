/**
 * BasicTab —— 用户详情页基本信息 Tab 根组件（PRD §8.8）。
 *
 * 职责：组装 5 块卡片 + 根据 account_type 条件渲染 vendor 卡片；
 * isSelf 判定 + Grant 向导导航由本组件集中处理。
 */
import { Col, Row } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import type { UserDetail } from '@/types/auth';
import UserProfileCard from './UserProfileCard';
import GrantSummaryCard from './GrantSummaryCard';
import UserActionSetSummaryCard from './UserActionSetSummaryCard';
import VendorInfoCard from './VendorInfoCard';
import DangerZoneCard from './DangerZoneCard';

interface Props {
  user: UserDetail;
}

export default function BasicTab({ user }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const isSelf = currentUser?.id === user.id;
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const onSwitchTab = () => setSearchParams({ tab: 'authz' });
  const onGrantWizard = () => navigate(`/platform/users/${user.id}/grant`);
  const onDangerSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['user', 'detail', user.id] });
  };

  return (
    <Row gutter={16}>
      <Col xs={24} lg={8}>
        <UserProfileCard
          user={user}
          isSelf={isSelf}
          onSwitchTab={onSwitchTab}
          onGrantWizard={onGrantWizard}
        />
      </Col>
      <Col xs={24} lg={16}>
        <GrantSummaryCard userId={user.id} onGrantWizard={onGrantWizard} isSelf={isSelf} />
        <UserActionSetSummaryCard userId={user.id} />
        {user.account_type === 'vendor' && user.vendor_id != null && (
          <VendorInfoCard user={user} />
        )}
        <DangerZoneCard user={user} isSelf={isSelf} onSuccess={onDangerSuccess} />
      </Col>
    </Row>
  );
}
