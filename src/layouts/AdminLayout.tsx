import { useEffect, useRef, useState, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch, Tooltip } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { useFieldMode } from '@/stores/fieldModeStore';
import FieldModeFab from '@/components/common/FieldModeFab';
import { useAuthStore } from '@/stores/authStore';
import { hasAnyAction } from '@/lib/authz/can';
import ForceChangePasswordModal from '@/components/auth/ForceChangePasswordModal';
import { useAppStore } from '@/stores/appStore';
import { useBrandingStore } from '@/stores/brandingStore';
import { useHallStore } from '@/stores/hallStore';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { HallListItem, ExhibitListItem } from '@/api/gen/client';
import CreateHallModal from '@/components/common/CreateHallModal';
import CreateExhibitModal from '@/components/common/CreateExhibitModal';
import NotificationBell from '@/components/notification/NotificationBell';
import ConnectStatusPill from '@/components/AppHeader/ConnectStatusPill';
import styles from './AdminLayout.module.scss';

const SIDEBAR_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 68;

/* ==================== Menu Configuration (v3: 双顶层) ==================== */

interface MenuItem {
  path: string;
  icon: string;
  label: string;
  /** Phase 5b：命中任一 action（或超管 '*'）即可见；缺省对全部登录用户可见 */
  requireActions?: string[];
}

interface MenuGroup {
  key: string;
  /** '' = no group header (flat items) */
  label: string;
  items: MenuItem[];
  /** default true when label is non-empty */
  collapsible?: boolean;
}

/** Region = 顶层分区：overview / hall / platform */
interface MenuRegion {
  key: 'overview' | 'hall' | 'platform';
  /** null = 不渲染 region header（总览） */
  label: string | null;
  groups: MenuGroup[];
}

function buildMenuRegions(selectedHallId?: number): MenuRegion[] {
  // 展厅管理 region 中带 :hallId 的路径（用于菜单 href 生成）
  const hallId = selectedHallId;

  return [
    /* ─── 总览：无 region header ─── */
    {
      key: 'overview',
      label: null,
      groups: [
        {
          key: 'overview-main',
          label: '',
          items: [
            { path: '/dashboard', icon: 'dashboard', label: '仪表盘', requireActions: ['dashboard.view'] },
            { path: '/halls', icon: 'museum', label: '展厅列表', requireActions: ['hall.view'] },
          ],
        },
      ],
    },

    /* ─── 展厅管理 ─── */
    {
      key: 'hall',
      label: '展厅管理',
      groups: [
        {
          key: 'hall-main',
          label: '',
          items: [
            {
              path: hallId ? `/halls/${hallId}/exhibits` : '/exhibits',
              icon: 'category',
              label: '展项管理',
              requireActions: ['exhibit.view', 'exhibit.edit'],
            },
            { path: '/devices', icon: 'devices_other', label: '设备管理', requireActions: ['device.view', 'device.edit', 'device.control'] },
            {
              path: hallId ? `/halls/${hallId}/triggers` : '/triggers',
              icon: 'sensors',
              label: '触发器',
              requireActions: ['device.edit', 'device.control'],
            },
            { path: '/scenes', icon: 'scene', label: '场景管理', requireActions: ['scene.view', 'scene.edit', 'scene.switch'] },
            {
              path: hallId ? `/halls/${hallId}/control-app` : '/control-app',
              icon: 'dashboard_customize',
              label: '中控管理',
              requireActions: ['panel.view', 'panel.edit'],
            },
            { path: '/contents', icon: 'folder_open', label: '内容总库', requireActions: ['content.view', 'content.edit', 'content.upload'] },
            { path: '/ai/avatars', icon: 'smart_toy', label: '数字人', requireActions: ['ai.view', 'ai.configure', 'ai.control'] },
            { path: '/shows', icon: 'movie', label: '演出管理', requireActions: ['show.view', 'show.edit', 'show.control'] },
          ],
        },
        {
          key: 'smarthome',
          label: '',
          items: [
            // 5 子页（网关 / 设备全景 / 规则 / 触发日志 / 告警）合并到 SmartHomeHubPage 的 5 tab，
            // requireActions 取并集：任一 action 命中即可见
            {
              path: '/smarthome', icon: 'home_iot_device', label: '智能家居',
              requireActions: ['smarthome.view', 'smarthome.manage_gateway', 'smarthome.manage_rule', 'smarthome.alert_ack'],
            },
          ],
        },
      ],
    },

    /* ─── 平台管理 ─── */
    {
      key: 'platform',
      label: '平台管理',
      groups: [
        {
          key: 'platform-catalog',
          label: '数据字典',
          collapsible: true,
          items: [
            // device-mgmt-v2 P6：4 tab 合并页（预置 / 协议 / 插件 / 触发器模板占位）
            { path: '/platform/device-catalog', icon: 'inventory_2', label: '设备目录', requireActions: ['catalog.view', 'catalog.edit'] },
          ],
        },
        {
          key: 'platform-assets',
          label: '内容资产',
          collapsible: true,
          items: [
            { path: '/platform/ai-avatar-library', icon: 'view_cozy', label: 'AI 形象库', requireActions: ['catalog.view', 'catalog.edit'] },
          ],
        },
        {
          key: 'analytics',
          label: '监控与分析',
          collapsible: true,
          items: [
            { path: '/analytics', icon: 'insights', label: '运营分析', requireActions: ['analytics.view'] },
            { path: '/analytics/storage', icon: 'cloud', label: '存储与费用', requireActions: ['analytics.view'] },
            { path: '/logs', icon: 'history', label: '操作日志', requireActions: ['audit.view'] },
          ],
        },
        {
          key: 'authz',
          label: '身份与权限',
          collapsible: true,
          items: [
            { path: '/platform/authz/users', icon: 'group', label: '用户', requireActions: ['user.view', 'user.manage'] },
            { path: '/platform/authz/role-templates', icon: 'manage_accounts', label: '角色模板', requireActions: ['user.grant', 'user.view'] },
            { path: '/platform/authz/grants', icon: 'key', label: '授权总览', requireActions: ['user.grant', 'user.view'] },
            { path: '/platform/authz/vendors', icon: 'business_center', label: '供应商', requireActions: ['vendor.view', 'vendor.manage'] },
            { path: '/platform/authz/audit', icon: 'fact_check', label: '权限审计', requireActions: ['audit.view'] },
            { path: '/platform/authz/reports', icon: 'insights', label: '合规报表', requireActions: ['audit.view'] },
          ],
        },
        {
          key: 'system-settings',
          label: '系统设置',
          collapsible: true,
          items: [
            { path: '/platform/sys-config', icon: 'settings', label: '系统参数', requireActions: ['config.view', 'config.edit'] },
            { path: '/platform/releases', icon: 'system_update', label: '版本管理', requireActions: ['release.view', 'release.manage'] },
            { path: '/notifications', icon: 'notifications', label: '通知管理', requireActions: ['notification.view', 'notification.edit'] },
          ],
        },
      ],
    },
  ];
}

const titleMap: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/halls': '展厅列表',
  '/devices': '设备管理',
  '/contents': '内容总库',
  '/analytics/storage': '存储与费用',
  '/scenes': '场景管理',
  '/shows': '演出管理',
  '/ai/avatars': '数字人',
  '/notifications': '通知管理',
  '/logs': '操作日志',
  '/smarthome': '智能家居',
  '/analytics': '运营分析',
  '/platform/device-catalog': '设备目录',
  '/platform/ai-avatar-library': 'AI 形象库',
  '/platform/authz/users': '用户',
  '/platform/sys-config': '系统参数',
  '/platform/releases': '版本管理',
  '/platform/authz/role-templates': '角色模板',
  '/platform/authz/grants': '授权总览',
  '/platform/authz/vendors': '供应商',
  '/platform/authz/audit': '权限审计',
  '/platform/authz/reports': '合规报表',
};

/** Match dynamic hall-level routes for page title */
function resolveTitleFromPath(pathname: string): string {
  // Authz 动态路径优先（Phase 6）
  if (/^\/platform\/authz\/role-templates\/(new|\d+\/edit)/.test(pathname)) return '编辑角色模板';
  if (/^\/platform\/authz\/users\/\d+\/grant$/.test(pathname)) return '授权向导';
  if (/^\/platform\/authz\/users\/\d+$/.test(pathname)) return '用户详情';
  if (/^\/platform\/authz\/vendors\/new$/.test(pathname)) return '新建供应商';
  if (/^\/platform\/authz\/vendors\/\d+$/.test(pathname)) return '供应商详情';
  // Dynamic hall-level routes — check first (before /halls catches all)
  if (/^\/halls\/\d+\/exhibits/.test(pathname)) return '展项管理';
  if (/^\/halls\/\d+\/exhibit-management/.test(pathname)) return '展项管理';
  if (/^\/halls\/\d+\/control-app/.test(pathname)) return '中控管理';
  if (/^\/halls\/\d+\/triggers/.test(pathname)) return '触发器';
  if (/^\/halls\/\d+$/.test(pathname)) return '展厅详情';
  // Static titleMap
  for (const [path, title] of Object.entries(titleMap)) {
    if (pathname === path || pathname.startsWith(path + '/')) return title;
  }
  return '总览';
}

/** 当前路由强依赖展项（未选 → 顶栏展项 selector 标记为必填） */
function isExhibitRequiredRoute(pathname: string): boolean {
  if (pathname === '/ai/avatars' || pathname.startsWith('/ai/avatars/')) return true;
  if (/^\/halls\/\d+\/(exhibits|exhibit-management)(\/|$)/.test(pathname)) return true;
  return false;
}

/**
 * 展项详情类路由：路径段内含 `:exhibitId`，顶栏切换展项时应"平行跳"到同类型路由的新展项页，
 * 而不是只改 `hallStore.selectedExhibitId` 让页面停留在旧展项。
 *
 * 触摸导航子页面（`/exhibits/:exhibitId/touch-nav`）→ 回退到展项详情页，
 * 避免目标展项非 touch_interactive 模式时进入无效路由。
 *
 * 返回 null 表示当前不在展项详情路由（走 store-only 分支：仅 setSelectedExhibit）。
 */
function replaceExhibitInPath(pathname: string, newExhibitId: number): string | null {
  let m = pathname.match(/^(\/halls\/\d+)\/exhibits\/\d+(?:\/[^?#]*)?$/);
  if (m) return `${m[1]}/exhibits/${newExhibitId}`;
  m = pathname.match(/^(\/halls\/\d+)\/exhibit-management\/\d+(?:\/[^?#]*)?$/);
  if (m) return `${m[1]}/exhibit-management/${newExhibitId}`;
  return null;
}

/** 当前路由所属区域（用于顶栏选择器状态） */
type RouteRegion = 'overview' | 'hall' | 'platform';
function resolveRouteRegion(pathname: string): RouteRegion {
  if (
    pathname.startsWith('/platform/') ||
    pathname.startsWith('/analytics/') ||
    pathname === '/oss-stats' || pathname.startsWith('/oss-stats/') ||
    pathname === '/notifications' || pathname.startsWith('/notifications/') ||
    pathname === '/logs' || pathname.startsWith('/logs/') ||
    // Legacy paths redirecting to /platform/*
    pathname === '/users' || pathname.startsWith('/users/') ||
    pathname === '/sys-config' || pathname.startsWith('/sys-config/') ||
    pathname === '/releases' || pathname.startsWith('/releases/')
  ) {
    return 'platform';
  }
  if (pathname === '/' || pathname === '/dashboard' || pathname === '/halls') {
    return 'overview';
  }
  return 'hall';
}

export default function AdminLayout() {
  const { message } = useMessage();
  const location = useLocation();
  const navigate = useNavigate();
  const userName = useAuthStore((s) => s.userName);
  const userAvatar = useAuthStore((s) => s.userAvatar);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  // 订阅 actionSet 变更，触发 canSeeItem 重算（登录 / 切换用户 / 刷新 token 后）
  useAuthStore((s) => s.actionSet);

  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const fieldModeEnabled = useFieldMode((s) => s.enabled);
  const toggleFieldMode = useFieldMode((s) => s.toggle);
  const handleFieldModeToggle = (next: boolean) => {
    toggleFieldMode();
    if (next) {
      message.warning('已开启现场模式 / 屏幕将保持常亮');
    } else {
      message.info('已关闭现场模式');
    }
  };

  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const selectedHallName = useHallStore((s) => s.selectedHallName);
  const setSelectedHall = useHallStore((s) => s.setSelectedHall);
  const clearSelectedHall = useHallStore((s) => s.clearSelectedHall);
  const selectedExhibitId = useHallStore((s) => s.selectedExhibitId);
  const selectedExhibitName = useHallStore((s) => s.selectedExhibitName);
  const setSelectedExhibit = useHallStore((s) => s.setSelectedExhibit);
  const clearSelectedExhibit = useHallStore((s) => s.clearSelectedExhibit);

  const menuRegions = buildMenuRegions(selectedHallId);
  const currentRegion = resolveRouteRegion(location.pathname);

  /* Hall / Exhibit data for global selectors */
  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 } as Record<string, unknown>),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data,
  });
  const halls = hallsData?.list ?? [];

  const { data: exhibitsData } = useQuery({
    queryKey: queryKeys.exhibits(selectedHallId!),
    queryFn: () => hallApi.getExhibits(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });
  const exhibits = exhibitsData ?? [];

  const queryClient = useQueryClient();

  /* Create Hall / Exhibit via top nav */
  const [showCreateHallModal, setShowCreateHallModal] = useState(false);
  const [showCreateExhibitModal, setShowCreateExhibitModal] = useState(false);

  const createHallMutation = useMutation({
    mutationFn: (data: Parameters<typeof hallApi.createHallViaMdm>[0]) => hallApi.createHallViaMdm(data),
    onSuccess: (res) => {
      const newHall = res.data.data;
      message.success(`展厅"${newHall.name}"创建成功`);
      queryClient.invalidateQueries({ queryKey: ['halls'] });
      setSelectedHall(newHall.id, newHall.name);
      setShowCreateHallModal(false);
    },
  });

  const createExhibitMutation = useMutation({
    mutationFn: (data: Parameters<typeof hallApi.createExhibit>[1]) => hallApi.createExhibit(selectedHallId!, data),
    onSuccess: (res) => {
      const newExhibit = res.data.data;
      message.success(`展项"${newExhibit.name}"创建成功`);
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(selectedHallId!) });
      setSelectedExhibit(newExhibit.id, newExhibit.name);
      setShowCreateExhibitModal(false);
    },
  });

  const brandingLoaded = useBrandingStore((s) => s.loaded);
  const brandingCompanyName = useBrandingStore((s) => s.companyName);
  const brandingSystemName = useBrandingStore((s) => s.systemName);
  const brandingLogoUrl = useBrandingStore((s) => s.logoUrl);
  const fetchBranding = useBrandingStore((s) => s.fetchBranding);

  // 从 systemName 派生简称和副标题（直接计算，确保响应式）
  const brandingShortName = (() => {
    const idx = brandingSystemName.indexOf(' ');
    return idx > 0 ? brandingSystemName.substring(0, idx) : brandingSystemName;
  })();
  const brandingSubtitle = (() => {
    const idx = brandingSystemName.indexOf(' ');
    return idx > 0 ? brandingSystemName.substring(idx + 1) : '';
  })();

  useEffect(() => {
    if (!brandingLoaded) {
      fetchBranding();
    }
  }, [brandingLoaded, fetchBranding]);

  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
  const avatarWrapperRef = useRef<HTMLDivElement>(null);

  const [showHallDropdown, setShowHallDropdown] = useState(false);
  const hallDropdownRef = useRef<HTMLDivElement>(null);
  const [showExhibitDropdown, setShowExhibitDropdown] = useState(false);
  const exhibitDropdownRef = useRef<HTMLDivElement>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'platform-catalog': true,
    'platform-assets': true,
    analytics: true,
    authz: true,
    'system-settings': true,
  });

  /* Page title */
  const currentPageTitle = resolveTitleFromPath(location.pathname);

  useEffect(() => {
    const title = resolveTitleFromPath(location.pathname);
    document.title = `${title} - ${brandingSystemName}`;
  }, [location.pathname, brandingSystemName]);

  /* Active menu detection */
  function isActiveMenu(path: string) {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/';
    }
    if (path === '/halls') {
      // Exact match only — don't highlight "展厅列表" when on hall sub-pages
      return location.pathname === '/halls';
    }
    if (path === '/analytics') {
      // Exact match (含 ?tab=) — 不在 /analytics/storage 上高亮"运营分析"
      return location.pathname === '/analytics';
    }
    return location.pathname.startsWith(path);
  }

  /** Phase 5b：按 requireActions 过滤菜单（命中任一 action 即可见；超管通配符自动放行） */
  function canSeeItem(item: MenuItem): boolean {
    if (!item.requireActions || item.requireActions.length === 0) return true;
    return hasAnyAction(item.requireActions);
  }

  /* Click outside to close dropdowns */
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (avatarWrapperRef.current && !avatarWrapperRef.current.contains(e.target as Node)) {
      setShowAvatarDropdown(false);
    }
    if (hallDropdownRef.current && !hallDropdownRef.current.contains(e.target as Node)) {
      setShowHallDropdown(false);
    }
    if (exhibitDropdownRef.current && !exhibitDropdownRef.current.contains(e.target as Node)) {
      setShowExhibitDropdown(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [handleClickOutside]);

  const handleLogout = () => {
    setShowAvatarDropdown(false);
    logout();
  };

  const toggleGroup = (key: string) => {
    if (!sidebarCollapsed) {
      setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const roleLabel = (() => {
    switch (user?.role) {
      case 'admin': return '管理员';
      case 'technician': return '技术员';
      case 'narrator': return '讲解员';
      case 'producer': return '制作人';
      default: return '用户';
    }
  })();

  return (
    <div className={styles['admin-layout']}>
      {/* Sidebar */}
      <aside
        className={`${styles['admin-layout__sidebar']} ${sidebarCollapsed ? styles['admin-layout__sidebar--collapsed'] : ''}`}
        style={{ width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
      >
        {/* Logo */}
        <div className={styles['admin-layout__sidebar-header']}>
          <div className={styles['admin-layout__logo-icon']}>
            {brandingLogoUrl ? (
              <img src={brandingLogoUrl} alt="Logo" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            ) : (
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>connected_tv</span>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className={styles['admin-layout__logo-text']}>
              <h1 className={styles['admin-layout__logo-title']}>{brandingShortName}</h1>
              <p className={styles['admin-layout__logo-subtitle']}>{brandingSubtitle}</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={styles['admin-layout__nav']}>
          {menuRegions.map((region) => {
            // Pre-filter visible items per group + drop empty groups
            const visibleGroups = region.groups
              .map((g) => ({ ...g, items: g.items.filter(canSeeItem) }))
              .filter((g) => g.items.length > 0);
            if (visibleGroups.length === 0) return null;

            return (
              <div key={region.key} className={styles['admin-layout__nav-region']}>
                {/* Region header — non-collapsible, visual separator */}
                {region.label && (
                  sidebarCollapsed ? (
                    <div className={styles['admin-layout__nav-region-divider-collapsed']} />
                  ) : (
                    <div className={styles['admin-layout__nav-region-label']}>
                      <span>{region.label}</span>
                    </div>
                  )
                )}

                {visibleGroups.map((group) => {
                  const isCollapsible = !!group.label && group.collapsible !== false;
                  const isExpanded = !isCollapsible || expandedGroups[group.key] || sidebarCollapsed;

                  return (
                    <div key={group.key}>
                      {/* Group label (collapsible sub-group header) */}
                      {group.label && (
                        <div
                          className={`${styles['admin-layout__nav-group-label']} ${isCollapsible ? styles['admin-layout__nav-group-label--clickable'] : ''}`}
                          onClick={isCollapsible ? () => toggleGroup(group.key) : undefined}
                        >
                          {!sidebarCollapsed && (
                            <>
                              <span>{group.label}</span>
                              {isCollapsible && (
                                <span className={`material-symbols-outlined ${styles['admin-layout__nav-group-arrow']}`}>
                                  {expandedGroups[group.key] ? 'expand_less' : 'expand_more'}
                                </span>
                              )}
                            </>
                          )}
                          {sidebarCollapsed && (
                            <span className={styles['admin-layout__nav-group-divider']} />
                          )}
                        </div>
                      )}

                      {/* Menu items */}
                      {isExpanded && group.items.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`${styles['admin-layout__nav-item']} ${
                            isActiveMenu(item.path) ? styles['admin-layout__nav-item--active'] : ''
                          }`}
                          title={sidebarCollapsed ? item.label : undefined}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={isActiveMenu(item.path) ? { fontVariationSettings: "'FILL' 1" } : undefined}
                          >
                            {item.icon}
                          </span>
                          {!sidebarCollapsed && item.label}
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className={styles['admin-layout__sidebar-footer']}>
          <button
            className={styles['admin-layout__collapse-btn']}
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <span className="material-symbols-outlined">
              {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
            </span>
            {!sidebarCollapsed && '收起侧边栏'}
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main
        className={styles['admin-layout__main']}
        style={{ marginLeft: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
      >
        {/* Top Bar */}
        <header
          className={styles['admin-layout__topbar']}
          style={{ left: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
        >
          <div className={styles['admin-layout__topbar-left']}>
            <h2 className={styles['admin-layout__page-title']}>{currentPageTitle}</h2>

            {/* Global Hall / Exhibit Selectors */}
            <div className={styles['admin-layout__global-selectors']}>
              {/* Hall selector pill — region-aware state */}
              {(() => {
                const isPlatform = currentRegion === 'platform';
                const isHallMissing = currentRegion === 'hall' && !selectedHallId;
                const hallPillClasses = [
                  styles['admin-layout__selector-pill'],
                  selectedHallId && !isPlatform ? styles['admin-layout__selector-pill--active'] : '',
                  isPlatform ? styles['admin-layout__selector-pill--disabled'] : '',
                  isHallMissing ? styles['admin-layout__selector-pill--warning'] : '',
                ].filter(Boolean).join(' ');
                const pillLabel = isHallMissing ? '请选择展厅' : (selectedHallName || '选择展厅');

                const button = (
                  <button
                    className={hallPillClasses}
                    aria-disabled={isPlatform}
                    onClick={() => {
                      if (isPlatform) return;
                      setShowHallDropdown((v) => !v);
                      setShowExhibitDropdown(false);
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>location_on</span>
                    <span className={styles['admin-layout__selector-pill-text']}>
                      {pillLabel}
                    </span>
                    {selectedHallId && !isPlatform ? (
                      <span
                        className={styles['admin-layout__selector-clear']}
                        role="button"
                        onClick={(e) => { e.stopPropagation(); clearSelectedHall(); }}
                        title="清除展厅选择"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                      </span>
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
                    )}
                  </button>
                );

                return (
                  <div className={styles['admin-layout__selector-wrapper']} ref={hallDropdownRef}>
                    {isPlatform ? (
                      <Tooltip title="该模块与展厅无关">{button}</Tooltip>
                    ) : (
                      button
                    )}
                    {showHallDropdown && !isPlatform && (
                      <div className={styles['admin-layout__selector-dropdown']}>
                        {halls.map((h: HallListItem) => (
                          <button
                            key={h.id}
                            className={`${styles['admin-layout__selector-option']} ${h.id === selectedHallId ? styles['admin-layout__selector-option--selected'] : ''}`}
                            onClick={() => {
                              setSelectedHall(h.id, h.name);
                              setShowHallDropdown(false);
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>museum</span>
                            {h.name}
                          </button>
                        ))}
                        {halls.length === 0 && (
                          <div className={styles['admin-layout__selector-empty']}>暂无展厅</div>
                        )}
                        {isAdmin() && (
                          <>
                            <div className={styles['admin-layout__selector-divider']} />
                            <button
                              className={styles['admin-layout__selector-option']}
                              onClick={() => { setShowHallDropdown(false); setShowCreateHallModal(true); }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                              新建展厅
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Exhibit selector pill — only shown when a hall is selected and not in platform region */}
              {selectedHallId && currentRegion !== 'platform' && (() => {
                const isExhibitRequired = isExhibitRequiredRoute(location.pathname);
                const isExhibitMissing = isExhibitRequired && !selectedExhibitId;
                const exhibitPillClasses = [
                  styles['admin-layout__selector-pill'],
                  selectedExhibitId ? styles['admin-layout__selector-pill--active'] : '',
                  isExhibitMissing ? styles['admin-layout__selector-pill--warning'] : '',
                ].filter(Boolean).join(' ');
                const exhibitPillLabel = isExhibitMissing
                  ? '请选择展项'
                  : (selectedExhibitName || '选择展项');

                return (
                <div className={styles['admin-layout__selector-wrapper']} ref={exhibitDropdownRef}>
                  <button
                    className={exhibitPillClasses}
                    onClick={() => { setShowExhibitDropdown((v) => !v); setShowHallDropdown(false); }}
                    title={isExhibitMissing ? '此页面需要选择展项' : undefined}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>adjust</span>
                    <span className={styles['admin-layout__selector-pill-text']}>
                      {exhibitPillLabel}
                    </span>
                    {selectedExhibitId ? (
                      <span
                        className={styles['admin-layout__selector-clear']}
                        role="button"
                        onClick={(e) => { e.stopPropagation(); clearSelectedExhibit(); }}
                        title="清除展项选择"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                      </span>
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
                    )}
                  </button>
                  {showExhibitDropdown && (
                    <div className={styles['admin-layout__selector-dropdown']}>
                      {exhibits.map((ex: ExhibitListItem) => (
                        <button
                          key={ex.id}
                          className={`${styles['admin-layout__selector-option']} ${ex.id === selectedExhibitId ? styles['admin-layout__selector-option--selected'] : ''}`}
                          onClick={() => {
                            setSelectedExhibit(ex.id, ex.name);
                            const target = replaceExhibitInPath(location.pathname, ex.id);
                            if (target) navigate(target);
                            setShowExhibitDropdown(false);
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>category</span>
                          {ex.name}
                        </button>
                      ))}
                      {exhibits.length === 0 && (
                        <div className={styles['admin-layout__selector-empty']}>暂无展项</div>
                      )}
                      {isAdmin() && (
                        <>
                          <div className={styles['admin-layout__selector-divider']} />
                          <button
                            className={styles['admin-layout__selector-option']}
                            onClick={() => { setShowExhibitDropdown(false); setShowCreateExhibitModal(true); }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                            新建展项
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                );
              })()}
            </div>
          </div>
          <div className={styles['admin-layout__topbar-right']}>
            <ConnectStatusPill />
            <Tooltip title={fieldModeEnabled ? '关闭现场模式（恢复办公室密度）' : '开启现场模式（大字号 / 高按钮 / 屏幕常亮 / 危险操作冷却）'}>
              <button
                type="button"
                className={`${styles['admin-layout__field-mode-chip']} ${fieldModeEnabled ? styles['admin-layout__field-mode-chip--active'] : ''}`}
                onClick={() => handleFieldModeToggle(!fieldModeEnabled)}
                aria-pressed={fieldModeEnabled}
              >
                <span className={styles['admin-layout__field-mode-emoji']} aria-hidden="true">🚧</span>
                <span className={styles['admin-layout__field-mode-text']}>现场实施模式</span>
                <Switch size="small" checked={fieldModeEnabled} onChange={handleFieldModeToggle} />
              </button>
            </Tooltip>
            <div className={styles['admin-layout__search-box']}>
              <label htmlFor="admin-global-search" className={styles['sr-only']}>搜索资源</label>
              <span className={`material-symbols-outlined ${styles['admin-layout__search-icon']}`}>search</span>
              <input
                id="admin-global-search"
                name="admin_global_search"
                type="text"
                className={styles['admin-layout__search-input']}
                placeholder="搜索..."
                autoComplete="off"
              />
            </div>
            <button
              className={styles['admin-layout__topbar-icon-btn']}
              onClick={toggleTheme}
              title={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
            >
              <span className="material-symbols-outlined">
                {theme === 'light' ? 'dark_mode' : 'light_mode'}
              </span>
            </button>
            <NotificationBell
              viewAllPath="/notifications"
              buttonClassName={styles['admin-layout__topbar-icon-btn']}
            />
            <button className={styles['admin-layout__topbar-icon-btn']}>
              <span className="material-symbols-outlined">help</span>
            </button>

            {/* Avatar with Dropdown */}
            <div className={styles['admin-layout__avatar-wrapper']} ref={avatarWrapperRef}>
              <div
                className={styles['admin-layout__topbar-avatar']}
                onClick={() => setShowAvatarDropdown((v) => !v)}
              >
                {userAvatar() ? (
                  <img src={userAvatar()} alt="Avatar" className={styles['admin-layout__topbar-avatar-img']} />
                ) : (
                  <span className={styles['admin-layout__topbar-avatar-fallback']}>
                    {userName()?.charAt(0) || 'U'}
                  </span>
                )}
              </div>

              {/* Dropdown Menu */}
              {showAvatarDropdown && (
                <div className={styles['admin-layout__avatar-dropdown']}>
                  <div className={styles['admin-layout__avatar-dropdown-header']}>
                    <div className={styles['admin-layout__avatar-dropdown-avatar']}>
                      {userAvatar() ? (
                        <img src={userAvatar()} alt="Avatar" />
                      ) : (
                        <span>{userName()?.charAt(0) || 'U'}</span>
                      )}
                    </div>
                    <div className={styles['admin-layout__avatar-dropdown-info']}>
                      <p className={styles['admin-layout__avatar-dropdown-name']}>{userName()}</p>
                      <p className={styles['admin-layout__avatar-dropdown-role']}>{roleLabel}</p>
                    </div>
                  </div>
                  <div className={styles['admin-layout__avatar-dropdown-divider']} />
                  <button
                    className={`${styles['admin-layout__avatar-dropdown-item']} ${styles['admin-layout__avatar-dropdown-item--danger']}`}
                    onClick={handleLogout}
                  >
                    <span className="material-symbols-outlined">logout</span>
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <div className={styles['admin-layout__content']}>
          <Outlet />

          {/* Footer */}
          <footer className={styles['admin-layout__footer']}>
            <p className={styles['admin-layout__footer-copy']}>© {new Date().getFullYear()} {brandingCompanyName}. All rights reserved.</p>
          </footer>
        </div>
      </main>

      {/* Create Hall Modal */}
      <CreateHallModal
        open={showCreateHallModal}
        loading={createHallMutation.isPending}
        onOk={(values) => createHallMutation.mutate(values)}
        onCancel={() => setShowCreateHallModal(false)}
      />

      {/* Create Exhibit Modal */}
      {selectedHallId && (
        <CreateExhibitModal
          open={showCreateExhibitModal}
          hallId={selectedHallId}
          existingCount={exhibits.length}
          loading={createExhibitMutation.isPending}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onOk={(values: any) => createExhibitMutation.mutate(values)}
          onCancel={() => setShowCreateExhibitModal(false)}
        />
      )}

      {/* Phase 11.9：首登强制改密 Modal（全局挂载；只有 user.must_change_pwd=true 时显示） */}
      <ForceChangePasswordModal />

      {/* device-mgmt-v2 P9-D：现场态浮动操作按钮（仅 fieldMode.enabled 时挂载） */}
      <FieldModeFab />
    </div>
  );
}
