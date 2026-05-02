import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, Button, Spin, Space, App, Input, Select, Switch, Typography, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  DesktopOutlined,
  FileImageOutlined,
  FileTextOutlined,
  UserOutlined,
  TagOutlined,
  RightOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useHallStore } from '@/stores/hallStore';
import { useCan } from '@/lib/authz/can';
import ExhibitContentTab from './tabs/ExhibitContentTab';
import ExhibitTagsTab from './tabs/ExhibitTagsTab';
import ExhibitDistributionTab from './tabs/ExhibitDistributionTab';
import ExhibitScriptsTab from './tabs/ExhibitScriptsTab';
import ExhibitSlideshowTab from './tabs/ExhibitSlideshowTab';
import ExhibitDevicesTab from './tabs/ExhibitDevicesTab';
import ExhibitDebugTab from './tabs/ExhibitDebugTab';
import styles from './ExhibitDetailPage.module.scss';

const DISPLAY_MODE_LABEL: Record<string, string> = {
  normal: '普通展项',
  simple_fusion: '简易融合',
  touch_interactive: '触摸互动',
};

// ========== StatCard (内部小组件，和 DashboardPage 保持风格一致) ==========
interface KvCardProps {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  gradient?: boolean;
  /** 提供 onClick 时变成可点击卡（hover 抬升 + 右上角箭头） */
  onClick?: () => void;
  /** 可点击时的 a11y 标签（默认 label） */
  ariaLabel?: string;
}

function KvCard({ label, icon, value, unit, sub, gradient = true, onClick, ariaLabel }: KvCardProps) {
  const className = onClick ? `${styles.kv} ${styles.kvClickable}` : styles.kv;
  return (
    <div
      className={className}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? ariaLabel || label : undefined}
    >
      <div className={styles.kvLabel}>
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={
          gradient && typeof value !== 'object'
            ? `${styles.kvValue} ${styles.kvValueGradient}`
            : styles.kvValue
        }
      >
        {value}
        {unit && <span className={styles.kvUnit}>{unit}</span>}
      </div>
      {sub && <div className={styles.kvSub}>{sub}</div>}
      {onClick && <RightOutlined className={styles.kvArrow} />}
    </div>
  );
}

export default function ExhibitDetailPage() {
  const { hallId: hallIdStr, exhibitId: exhibitIdStr } = useParams<{ hallId: string; exhibitId: string }>();
  const hallId = Number(hallIdStr);
  const exhibitId = Number(exhibitIdStr);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const canManage = useCan('content.edit', { type: 'hall', id: String(hallId) });
  const clearSelectedExhibit = useHallStore((s) => s.clearSelectedExhibit);
  const selectedExhibitId = useHallStore((s) => s.selectedExhibitId);
  const setSelectedExhibit = useHallStore((s) => s.setSelectedExhibit);

  const [outerTab, setOuterTab] = useState<'info' | 'devContent'>('info');
  const [innerTab, setInnerTab] = useState('content');
  // [展项设备] tab → [调试] 跳转时预填 deviceId（P9-A 占位，P9-C 转设备调试台后会替换）
  const [debugDeviceId, setDebugDeviceId] = useState<number | undefined>(undefined);

  // 描述就地编辑
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  const queryClient = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof hallApi.updateExhibit>[2]) =>
      hallApi.updateExhibit(hallId, exhibitId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
    },
    onError: (err) => {
      message.error('保存失败：' + (err instanceof Error ? err.message : '未知错误'));
    },
  });

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

  const exhibit = exhibits.find((e) => e.id === exhibitId);
  const isLoading = hallLoading || exhibitsLoading;

  // 路径上的 exhibitId 同步到 store（方便顶栏 pill 显示与清除联动）
  useEffect(() => {
    if (exhibit && exhibit.id !== selectedExhibitId) {
      setSelectedExhibit(exhibit.id, exhibit.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibit]);

  // 顶栏 exhibit pill 的 X 被按 → store 外部清空 → 跳回列表
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

  // 后端 listExhibits 已 inline active 配对码（仅当 caller 持有 pairing.view 时填充）
  // 出口已用 effectivePairingStatus 修正过期，此处不需要再过滤 expires_at
  const currentCode = exhibit?.active_pairing_code ?? undefined;

  if (isLoading) {
    return <Spin style={{ display: 'flex', justifyContent: 'center', marginTop: 120 }} />;
  }

  if (!exhibit) {
    return <div style={{ textAlign: 'center', marginTop: 120, color: 'var(--color-outline)' }}>展项不存在</div>;
  }

  const pairingCodesUrl = `/halls/${hallId}/exhibits?tab=pairing-codes`;
  const modeLabel = DISPLAY_MODE_LABEL[exhibit.display_mode] ?? exhibit.display_mode;

  const copyPairCode = async () => {
    if (!currentCode) return;
    try {
      await navigator.clipboard.writeText(currentCode.code);
      message.success(`已复制配对码 ${currentCode.code}`);
    } catch {
      message.error('复制失败，请手动选择');
    }
  };

  // KV 卡点击：切到对应 tab
  const jumpToTab = (key: string) => {
    setOuterTab('devContent');
    setInnerTab(key);
  };

  // ========== 基本信息 Tab 内容 ==========
  const renderInfoTab = () => (
    <div style={{ marginTop: 8 }}>
      {/* 4 格 KV（点击跳到对应 tab） */}
      <div className={styles.kvGrid}>
        <KvCard
          label="绑定设备"
          icon={<DesktopOutlined />}
          value={exhibit.device_count}
          unit="台"
          onClick={() => jumpToTab('devices')}
          ariaLabel="跳到展项设备 tab"
        />
        <KvCard
          label="内容文件"
          icon={<FileImageOutlined />}
          value={exhibit.content_count}
          unit="项"
          onClick={() => jumpToTab('content')}
          ariaLabel="跳到内容文件 tab"
        />
        <KvCard
          label="讲解词"
          icon={<FileTextOutlined />}
          value={exhibit.script_count}
          unit="段"
          onClick={() => jumpToTab('scripts')}
          ariaLabel="跳到讲解词 tab"
        />
        <KvCard
          label="数字人"
          icon={<UserOutlined />}
          value={
            exhibit.has_ai_avatar ? (
              <StatusTag status="active" label="已绑定" />
            ) : (
              <StatusTag status="off" label="未绑定" />
            )
          }
          gradient={false}
          onClick={() => navigate(`/halls/${hallId}/ai/avatars`)}
          ariaLabel="去 AI 数字人配置"
        />
      </div>

      {/* 配对码强调卡（仅 admin 可见） */}
      {isAdmin() && (
        <div className={styles.pairCard}>
          {currentCode ? (
            <>
              <div className={styles.pairLeft}>
                <div className={styles.pairLabel}>当前配对码</div>
                <div className={styles.pairCode}>{currentCode.code}</div>
                <div className={styles.pairTtl}>
                  过期 {Math.max(1, Math.ceil(dayjs(currentCode.expires_at).diff(dayjs(), 'hour', true)))} 小时后
                </div>
              </div>
              <Space className={styles.pairActions}>
                <Button onClick={copyPairCode}>复制</Button>
                <Button type="primary" ghost>
                  <Link to={pairingCodesUrl}>管理配对码 →</Link>
                </Button>
              </Space>
            </>
          ) : (
            <>
              <div className={styles.pairLeft}>
                <div className={styles.pairLabel}>配对码</div>
                <div className={styles.pairEmpty}>暂无有效配对码</div>
              </div>
              <Space className={styles.pairActions}>
                <Button type="primary" ghost>
                  <Link to={pairingCodesUrl}>去生成 →</Link>
                </Button>
                <Button>
                  <Link to={pairingCodesUrl}>显示全部配对码</Link>
                </Button>
              </Space>
            </>
          )}
        </div>
      )}

      {/* 描述 + 展项设置 */}
      <div className={styles.sectionRow}>
        <div className={styles.sectionCard}>
          <div className={styles.sectionCardTitle}>
            <span>展项描述</span>
            {canManage && !descEditing && (
              <Tooltip title="编辑描述">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setDescDraft(exhibit.description || '');
                    setDescEditing(true);
                  }}
                />
              </Tooltip>
            )}
          </div>
          {descEditing ? (
            <div className={styles.descEditWrap}>
              <Input.TextArea
                rows={4}
                value={descDraft}
                maxLength={500}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="输入展项描述..."
                autoFocus
              />
              <div className={styles.descActions}>
                <Button size="small" onClick={() => setDescEditing(false)}>
                  取消
                </Button>
                <Button
                  size="small"
                  type="primary"
                  loading={updateMutation.isPending}
                  onClick={() => {
                    updateMutation.mutate(
                      { description: descDraft },
                      {
                        onSuccess: () => {
                          message.success('描述已保存');
                          setDescEditing(false);
                        },
                      },
                    );
                  }}
                >
                  保存
                </Button>
              </div>
            </div>
          ) : exhibit.description ? (
            <p
              className={`${styles.descText} ${canManage ? styles.descTextHover : ''}`}
              onClick={
                canManage
                  ? () => {
                      setDescDraft(exhibit.description || '');
                      setDescEditing(true);
                    }
                  : undefined
              }
              title={canManage ? '点击编辑' : undefined}
            >
              {exhibit.description}
            </p>
          ) : (
            <p
              className={`${styles.descText} ${styles.descEmpty} ${canManage ? styles.descTextHover : ''}`}
              onClick={
                canManage
                  ? () => {
                      setDescDraft('');
                      setDescEditing(true);
                    }
                  : undefined
              }
            >
              暂未填写描述{canManage && '，点击添加'}
            </p>
          )}
        </div>
        <div className={`${styles.sectionCard} ${styles.metaRowEditable}`}>
          <div className={styles.sectionCardTitle}>展项设置</div>
          <div className={styles.metaRow}>
            <span className={styles.metaKey}>
              <AppstoreOutlined /> 名称
            </span>
            <span className={styles.metaVal}>
              {canManage ? (
                <Typography.Text
                  editable={{
                    onChange: (next) => {
                      const v = (next || '').trim();
                      if (!v || v === exhibit.name) return;
                      updateMutation.mutate(
                        { name: v },
                        { onSuccess: () => message.success('名称已保存') },
                      );
                    },
                    triggerType: ['icon', 'text'],
                    maxLength: 100,
                  }}
                >
                  {exhibit.name}
                </Typography.Text>
              ) : (
                exhibit.name
              )}
            </span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaKey}>展示模式</span>
            <span className={styles.metaVal}>
              {canManage ? (
                <Select
                  size="small"
                  value={exhibit.display_mode}
                  options={[
                    { value: 'normal', label: '普通' },
                    { value: 'simple_fusion', label: '简易融合' },
                    { value: 'touch_interactive', label: '触摸互动' },
                  ]}
                  onChange={(v) => {
                    if (v === exhibit.display_mode) return;
                    updateMutation.mutate(
                      { display_mode: v },
                      { onSuccess: () => message.success('显示模式已切换') },
                    );
                  }}
                  disabled={updateMutation.isPending}
                />
              ) : (
                <span className={styles.tagMode}>{modeLabel}</span>
              )}
            </span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaKey}>
              <TagOutlined /> AI 标签
            </span>
            <span className={styles.metaVal}>
              {canManage ? (
                <Switch
                  size="small"
                  checked={exhibit.enable_ai_tag}
                  loading={updateMutation.isPending}
                  onChange={(v) => {
                    updateMutation.mutate(
                      { enable_ai_tag: v },
                      { onSuccess: () => message.success(v ? 'AI 标签已启用' : 'AI 标签已关闭') },
                    );
                  }}
                />
              ) : exhibit.enable_ai_tag ? (
                <StatusTag status="active" label="启用" />
              ) : (
                <StatusTag status="off" label="关闭" />
              )}
            </span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaKey}>排序</span>
            <span className={styles.metaVal}>
              <Tooltip title="在展项列表页拖拽行首「⋮⋮」手柄调整顺序">
                <span style={{ color: 'var(--color-outline)', cursor: 'help' }}>
                  {exhibit.sort_order}
                </span>
              </Tooltip>
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const innerTabItems = [
    {
      key: 'content',
      label: '内容文件',
      children: <ExhibitContentTab hallId={hallId} exhibitId={exhibitId} exhibit={exhibit} canManage={canManage} />,
    },
    {
      key: 'devices',
      label: '展项设备',
      children: (
        <ExhibitDevicesTab
          hallId={hallId}
          exhibitId={exhibitId}
          canManage={canManage}
          onOpenDebug={(deviceId) => {
            setDebugDeviceId(deviceId);
            setInnerTab('debug');
          }}
        />
      ),
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
    {
      key: 'debug',
      label: '调试',
      children: <ExhibitDebugTab hallId={hallId} exhibitId={exhibitId} defaultDeviceId={debugDeviceId} />,
    },
  ];

  const OUTER_TABS: { key: typeof outerTab; label: string }[] = [
    { key: 'info', label: '基本信息' },
    { key: 'devContent', label: '设备 / 内容' },
  ];

  return (
    <div>
      {/* 自写页头（AntD 5 已废弃 PageHeader） */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <h1 className={styles.pageHeaderTitle}>
            {exhibit.name}
            <span className={styles.tagMode}>{modeLabel}</span>
          </h1>
          {exhibit.description && (
            <p className={styles.pageHeaderDesc}>
              {exhibit.description.length > 80
                ? exhibit.description.slice(0, 80) + '…'
                : exhibit.description}
            </p>
          )}
        </div>
        <div className={styles.pageHeaderActions}>
          {exhibit.display_mode === 'touch_interactive' && (
            <Button onClick={() => navigate(`/halls/${hallId}/exhibits/${exhibitId}/touch-nav`)}>
              编辑触摸导航
            </Button>
          )}
          <Button
            onClick={() => {
              clearSelectedExhibit();
              navigate(`/halls/${hallId}/exhibits`);
            }}
          >
            返回展项列表
          </Button>
        </div>
      </div>

      {/* 外层玻璃胶囊 Tab 组（键盘 ←→ 切换、Home/End 跳首尾） */}
      <div className={styles.outerTabs} role="tablist" aria-label="展项详情 tab">
        {OUTER_TABS.map((t, idx) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={outerTab === t.key}
            tabIndex={outerTab === t.key ? 0 : -1}
            className={
              outerTab === t.key
                ? `${styles.outerTab} ${styles.outerTabActive}`
                : styles.outerTab
            }
            onClick={() => setOuterTab(t.key)}
            onKeyDown={(e) => {
              const last = OUTER_TABS.length - 1;
              let next: number | null = null;
              if (e.key === 'ArrowRight') next = idx === last ? 0 : idx + 1;
              else if (e.key === 'ArrowLeft') next = idx === 0 ? last : idx - 1;
              else if (e.key === 'Home') next = 0;
              else if (e.key === 'End') next = last;
              if (next !== null) {
                e.preventDefault();
                setOuterTab(OUTER_TABS[next].key);
                // focus 跟上（下一帧）
                requestAnimationFrame(() => {
                  const btns = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                  btns?.[next!]?.focus();
                });
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {outerTab === 'info' ? (
        renderInfoTab()
      ) : (
        <Tabs
          activeKey={innerTab}
          onChange={setInnerTab}
          items={innerTabItems}
          size="small"
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}
