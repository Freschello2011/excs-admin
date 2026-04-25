/**
 * BasicTab —— 用户详情页基本信息 Tab 根组件（PRD §8.8 v1.2，P1.2 重构）。
 *
 * 重构理由（2026-04-25）：
 *   - GrantSummaryCard / UserActionSetSummaryCard 与「权限」Tab 内 UserAuthzPanel
 *     高度重叠，两 Tab 间反复切换会让管理员困惑
 *   - 信息架构调整为 "BasicTab = 画像 + 危险区"，授权细节统一去「权限」Tab
 *   - UserProfileCard 已有「查看『权限』Tab」按钮 + 顶部 PillTabs 直跳
 *
 * 当前布局：
 *   - 左：UserProfileCard（画像 + 快捷操作 + 跳权限 Tab 链接）
 *   - 右：[VendorInfoCard 仅 vendor] → DangerZoneCard
 */
import { Col, Row } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import type { UserDetail } from '@/types/auth';
import UserProfileCard from './UserProfileCard';
import VendorInfoCard from './VendorInfoCard';
import DangerZoneCard from './DangerZoneCard';

interface Props {
  user: UserDetail;
  /** 由父级 UserDetailPage 注入：点 「查看『权限』Tab」按钮时切换 PillTabs */
  onSwitchToAuthz: () => void;
}

export default function BasicTab({ user, onSwitchToAuthz }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const isSelf = currentUser?.id === user.id;
  const queryClient = useQueryClient();

  const onDangerSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['user', 'detail', user.id] });
  };

  const isVendor = user.account_type === 'vendor' && user.vendor_id != null;

  return (
    <Row gutter={16}>
      <Col xs={24} lg={10}>
        <UserProfileCard
          user={user}
          isSelf={isSelf}
          onSwitchTab={onSwitchToAuthz}
        />
      </Col>
      <Col xs={24} lg={14}>
        {isVendor && <VendorInfoCard user={user} />}
        <DangerZoneCard user={user} isSelf={isSelf} onSuccess={onDangerSuccess} />
      </Col>
    </Row>
  );
}
