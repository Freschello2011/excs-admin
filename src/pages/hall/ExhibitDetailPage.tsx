import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Tabs, Button, Spin, Space, Breadcrumb, Descriptions, Tag } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '@/components/common/PageHeader';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useHallStore } from '@/stores/hallStore';
import ExhibitContentTab from './tabs/ExhibitContentTab';
import ExhibitTagsTab from './tabs/ExhibitTagsTab';
import ExhibitDistributionTab from './tabs/ExhibitDistributionTab';
import ExhibitScriptsTab from './tabs/ExhibitScriptsTab';
import ExhibitSlideshowTab from './tabs/ExhibitSlideshowTab';

const DISPLAY_MODE_LABEL: Record<string, string> = {
  normal: '普通展项',
  simple_fusion: '简易融合',
  touch_interactive: '触摸互动',
};

export default function ExhibitDetailPage() {
  const { hallId: hallIdStr, exhibitId: exhibitIdStr } = useParams<{ hallId: string; exhibitId: string }>();
  const hallId = Number(hallIdStr);
  const exhibitId = Number(exhibitIdStr);
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const hasPermission = useAuthStore((s) => s.hasHallPermission);
  const clearSelectedExhibit = useHallStore((s) => s.clearSelectedExhibit);
  const selectedExhibitId = useHallStore((s) => s.selectedExhibitId);
  const setSelectedExhibit = useHallStore((s) => s.setSelectedExhibit);

  const [outerTab, setOuterTab] = useState<'info' | 'devContent'>('info');
  const [innerTab, setInnerTab] = useState('content');

  const { data: _hall, isLoading: hallLoading } = useQuery({
    queryKey: queryKeys.hallDetail(hallId),
    queryFn: () => hallApi.getHall(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  const { data: exhibits = [], isLoading: exhibitsLoading } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  const { data: pairingCodes = [] } = useQuery({
    queryKey: queryKeys.pairingCodes(hallId),
    queryFn: () => hallApi.listPairingCodes(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0 && isAdmin(),
  });

  const exhibit = exhibits.find((e) => e.id === exhibitId);
  const isLoading = hallLoading || exhibitsLoading;
  const canManage = isAdmin() || hasPermission(hallId, 'content_manage');

  // 路径上的 exhibitId 同步到 store（方便顶栏 pill 显示与清除联动）
  useEffect(() => {
    if (exhibit && exhibit.id !== selectedExhibitId) {
      setSelectedExhibit(exhibit.id, exhibit.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibit]);

  // 顶栏 exhibit pill 的 X 被按 → store 外部清空 → 跳回列表（路径上的 /:exhibitId 也一并脱离）
  const syncedRef = useRef(false);
  useEffect(() => {
    if (selectedExhibitId === exhibitId && exhibitId > 0) {
      syncedRef.current = true;
      return;
    }
    if (syncedRef.current && selectedExhibitId === undefined && hallId > 0) {
      navigate(`/halls/${hallId}/exhibits`, { replace: true });
    }
  }, [selectedExhibitId, exhibitId, hallId, navigate]);

  if (isLoading) {
    return <Spin style={{ display: 'flex', justifyContent: 'center', marginTop: 120 }} />;
  }

  if (!exhibit) {
    return <div style={{ textAlign: 'center', marginTop: 120, color: 'var(--color-outline)' }}>展项不存在</div>;
  }

  const currentCode = pairingCodes.find(
    (c) =>
      c.target_type === 'exhibit' &&
      c.target_id === exhibitId &&
      c.status === 'active' &&
      dayjs(c.expires_at).isAfter(dayjs()),
  );

  const pairingCodesUrl = `/halls/${hallId}/exhibits?tab=pairing-codes`;

  const renderCurrentCode = () => {
    if (!isAdmin()) {
      return <span style={{ color: 'var(--color-outline)' }}>—</span>;
    }
    if (currentCode) {
      const hoursLeft = Math.max(1, Math.ceil(dayjs(currentCode.expires_at).diff(dayjs(), 'hour', true)));
      return (
        <Space size="middle">
          <span style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, fontWeight: 600 }}>
            {currentCode.code}
          </span>
          <span style={{ color: 'var(--color-outline)' }}>过期 {hoursLeft} 小时后</span>
          <Link to={pairingCodesUrl}>管理 →</Link>
        </Space>
      );
    }
    return (
      <Space size="middle">
        <span style={{ color: 'var(--color-outline)' }}>无有效配对码</span>
        <Link to={pairingCodesUrl}>管理 →</Link>
      </Space>
    );
  };

  const innerTabItems = [
    {
      key: 'content',
      label: '内容文件',
      children: <ExhibitContentTab hallId={hallId} exhibitId={exhibitId} exhibit={exhibit} canManage={canManage} />,
    },
    {
      key: 'tags',
      label: '标签管理',
      children: <ExhibitTagsTab hallId={hallId} exhibitId={exhibitId} canManage={canManage} />,
    },
    {
      key: 'distribution',
      label: '分发状态',
      children: <ExhibitDistributionTab hallId={hallId} exhibitId={exhibitId} canManage={canManage} />,
    },
    {
      key: 'scripts',
      label: '讲解词',
      children: <ExhibitScriptsTab hallId={hallId} exhibitId={exhibitId} canManage={canManage} />,
    },
    {
      key: 'slideshow',
      label: '图文汇报',
      children: <ExhibitSlideshowTab hallId={hallId} exhibitId={exhibitId} canManage={canManage} />,
    },
  ];

  const outerTabItems = [
    {
      key: 'info',
      label: '基本信息',
      children: (
        <Descriptions column={1} bordered size="middle" style={{ marginTop: 8 }}>
          <Descriptions.Item label="名称">{exhibit.name}</Descriptions.Item>
          <Descriptions.Item label="展示模式">
            <Tag>{DISPLAY_MODE_LABEL[exhibit.display_mode] ?? exhibit.display_mode}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="描述">{exhibit.description || '—'}</Descriptions.Item>
          <Descriptions.Item label="排序">{exhibit.sort_order}</Descriptions.Item>
          <Descriptions.Item label="AI 标签">{exhibit.enable_ai_tag ? '启用' : '关闭'}</Descriptions.Item>
          <Descriptions.Item label="当前配对码">{renderCurrentCode()}</Descriptions.Item>
          <Descriptions.Item label="设备数">{exhibit.device_count}</Descriptions.Item>
          <Descriptions.Item label="内容文件数">{exhibit.content_count}</Descriptions.Item>
          <Descriptions.Item label="讲解词条数">{exhibit.script_count}</Descriptions.Item>
          <Descriptions.Item label="数字人">{exhibit.has_ai_avatar ? '已绑定' : '未绑定'}</Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: 'devContent',
      label: '设备 / 内容',
      children: (
        <Tabs
          activeKey={innerTab}
          onChange={setInnerTab}
          items={innerTabItems}
          size="small"
          style={{ marginTop: 8 }}
        />
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to={`/halls/${hallId}/exhibits`} onClick={clearSelectedExhibit}>展项管理</Link> },
          { title: exhibit.name },
        ]}
      />

      <PageHeader
        title={exhibit.name}
        description={DISPLAY_MODE_LABEL[exhibit.display_mode] ?? '普通展项'}
        extra={
          <Space>
            {exhibit.display_mode === 'touch_interactive' && (
              <Button onClick={() => navigate(`/halls/${hallId}/exhibits/${exhibitId}/touch-nav`)}>
                编辑触摸导航
              </Button>
            )}
            <Button onClick={() => { clearSelectedExhibit(); navigate(`/halls/${hallId}/exhibits`); }}>返回展项列表</Button>
          </Space>
        }
      />

      <Tabs
        activeKey={outerTab}
        onChange={(k) => setOuterTab(k as 'info' | 'devContent')}
        items={outerTabItems}
        style={{ marginTop: 8 }}
      />
    </div>
  );
}
