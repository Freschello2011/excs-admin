import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import RequireAuth from '@/components/guards/RequireAuth';
import RequireAdmin from '@/components/guards/RequireAdmin';
import ErrorBoundary from '@/components/ErrorBoundary';
import HallContextGuard from '@/components/common/HallContextGuard';
import { useHallStore } from '@/stores/hallStore';

/* ─── Auth pages (sync — needed for SSO callback) ─── */
import LoginCallbackPage from '@/pages/auth/LoginCallbackPage';
import ControlAppCallbackPage from '@/pages/auth/ControlAppCallbackPage';

/* ─── Lazy-loaded pages ─── */
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const HallListPage = lazy(() => import('@/pages/hall/HallListPage'));
const HallDetailPage = lazy(() => import('@/pages/hall/HallDetailPage'));
const ContentGroupListPage = lazy(() => import('@/pages/content/ContentGroupListPage'));
const ContentGroupDetailPage = lazy(() => import('@/pages/content/ContentGroupDetailPage'));
const SceneListPage = lazy(() => import('@/pages/command/SceneListPage'));
const ShowListPage = lazy(() => import('@/pages/show/ShowListPage'));
const ShowDetailPage = lazy(() => import('@/pages/show/ShowDetailPage'));
const ShowTimelinePage = lazy(() => import('@/pages/show/ShowTimelinePage'));
const DeviceListPage = lazy(() => import('@/pages/device/DeviceListPage'));
const DeviceDebugConsolePage = lazy(
  () => import('@/pages/device/DeviceDebugConsole/DeviceDebugConsolePage'),
);
const AiAvatarListPage = lazy(() => import('@/pages/ai/AiAvatarListPage'));
const AiAvatarLibraryPage = lazy(() => import('@/pages/ai/AiAvatarLibraryPage'));
// device-mgmt-v2 P6：4 tab 合并页（预置型号 / 协议库 / 插件 / 触发器模板占位）
const DeviceCatalogPage = lazy(() => import('@/pages/platform/DeviceCatalogPage'));
const TriggerListPage = lazy(() => import('@/pages/hall/TriggerListPage'));
const UserListPage = lazy(() => import('@/pages/user/UserListPage'));
const UserDetailPage = lazy(() => import('@/pages/user/UserDetailPage'));
const NotificationListPage = lazy(() => import('@/pages/notification/NotificationListPage'));
const OperationLogPage = lazy(() => import('@/pages/log/OperationLogPage'));
const SysConfigPage = lazy(() => import('@/pages/sys-config/SysConfigPage'));
const ExhibitDetailPage = lazy(() => import('@/pages/hall/ExhibitDetailPage'));
const ExhibitManagementPage = lazy(() => import('@/pages/hall/ExhibitManagementPage'));
const AppSessionPage = lazy(() => import('@/pages/hall/AppSessionPage'));
const ControlAppPage = lazy(() => import('@/pages/panel/ControlAppPage'));
const TouchNavEditorPage = lazy(() => import('@/pages/hall/TouchNavEditorPage'));
const StorageOverviewPage = lazy(() => import('@/pages/analytics/StorageOverviewPage'));
const AnalyticsHubPage = lazy(() => import('@/pages/analytics/AnalyticsHubPage'));
const ReleasesPage = lazy(() => import('@/pages/sys-config/ReleasesPage'));
const RoleTemplateListPage = lazy(() => import('@/pages/authz/RoleTemplateListPage'));
const RoleTemplateEditPage = lazy(() => import('@/pages/authz/RoleTemplateEditPage'));
const GrantListPage = lazy(() => import('@/pages/authz/GrantListPage'));
const GrantWizardPage = lazy(() => import('@/pages/authz/GrantWizardPage'));
const AuditLogListPage = lazy(() => import('@/pages/authz/AuditLogListPage'));
const AuditReportPage = lazy(() => import('@/pages/authz/AuditReportPage'));
const VendorListPage = lazy(() => import('@/pages/authz/VendorListPage'));
const VendorCreatePage = lazy(() => import('@/pages/authz/VendorCreatePage'));
const VendorDetailPage = lazy(() => import('@/pages/authz/VendorDetailPage'));
const AcceptInvitePage = lazy(() => import('@/pages/auth/AcceptInvitePage'));
const VendorLayout = lazy(() => import('@/layouts/VendorLayout'));
const MyContentsPage = lazy(() => import('@/pages/vendor/MyContentsPage'));
const TeamMembersPage = lazy(() => import('@/pages/vendor/TeamMembersPage'));
const VendorMessagesPage = lazy(() => import('@/pages/vendor/MessagesPage'));
const VendorSettingsPage = lazy(() => import('@/pages/vendor/SettingsPage'));
const GatewaysPage = lazy(() => import('@/pages/smarthome/GatewaysPage'));
const DeviceHealthPage = lazy(() => import('@/pages/smarthome/DeviceHealthPage'));
const RulesPage = lazy(() => import('@/pages/smarthome/RulesPage'));
const TriggerLogsPage = lazy(() => import('@/pages/smarthome/TriggerLogsPage'));
const AlertsPage = lazy(() => import('@/pages/smarthome/AlertsPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));

/* ─── Suspense wrapper ─── */
function SuspenseWrap({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <div className="loading-spinner" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** 展厅管理 region：Suspense + HallContextGuard */
function HallRoute({ children }: { children: React.ReactNode }) {
  return (
    <SuspenseWrap>
      <HallContextGuard>{children}</HallContextGuard>
    </SuspenseWrap>
  );
}

/** Legacy /users/:userId 与 /platform/users/:userId → /platform/authz/users/:userId 的参数化重定向 */
function LegacyUserDetailRedirect() {
  const { userId } = useParams<{ userId: string }>();
  return <Navigate to={`/platform/authz/users/${userId}`} replace />;
}

/** /platform/users/:userId/grant → /platform/authz/users/:userId/grant */
function LegacyGrantWizardRedirect() {
  const { userId } = useParams<{ userId: string }>();
  return <Navigate to={`/platform/authz/users/${userId}/grant`} replace />;
}

/** Legacy /halls/:hallId/pairing-codes → /halls/:hallId/exhibits?tab=pairing-codes */
function LegacyPairingCodesRedirect() {
  const { hallId } = useParams<{ hallId: string }>();
  return <Navigate to={`/halls/${hallId}/exhibits?tab=pairing-codes`} replace />;
}

/** 展厅范围的占位重定向：选好展厅后跳到 /halls/:id/<target>。
 *  由 HallContextGuard 拦截未选展厅状态（弹 modal） */
function HallScopedRedirect({ target }: { target: string }) {
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  if (!selectedHallId) return null; // Guard 已经弹了 modal
  return <Navigate to={`/halls/${selectedHallId}/${target}`} replace />;
}

/* ─── Router ─── */
export const router = createBrowserRouter([
  /* Root redirect */
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },

  /* ─── Login callback (no layout, no auth required) ─── */
  {
    path: '/login/callback',
    element: <LoginCallbackPage />,
  },

  /* ─── Control App 专用回调：no-op 占位，不消费 code，
     让 Flutter WebView 独占 SSO 授权码交换（见 ControlAppCallbackPage.tsx） */
  {
    path: '/control-callback',
    element: <ControlAppCallbackPage />,
  },

  /* ─── Authz Phase 8：邀请接受页（公开，无需登录） */
  {
    path: '/invite/:token',
    element: <SuspenseWrap><AcceptInvitePage /></SuspenseWrap>,
  },

  /* ─── device-mgmt-v2 P9-C.2：设备调试台（独立全屏，不进 AdminLayout） */
  {
    path: '/devices/:deviceId/debug',
    element: (
      <RequireAuth>
        <ErrorBoundary>
          <SuspenseWrap>
            <DeviceDebugConsolePage />
          </SuspenseWrap>
        </ErrorBoundary>
      </RequireAuth>
    ),
  },

  /* ─── Phase 9：供应商专属子树（独立 layout，不挂在 AdminLayout 下） ─── */
  {
    path: '/vendor',
    element: (
      <RequireAuth>
        <ErrorBoundary>
          <SuspenseWrap>
            <VendorLayout />
          </SuspenseWrap>
        </ErrorBoundary>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/vendor/contents" replace /> },
      { path: 'contents', element: <SuspenseWrap><MyContentsPage /></SuspenseWrap> },
      { path: 'team', element: <SuspenseWrap><TeamMembersPage /></SuspenseWrap> },
      { path: 'messages', element: <SuspenseWrap><VendorMessagesPage /></SuspenseWrap> },
      { path: 'settings', element: <SuspenseWrap><VendorSettingsPage /></SuspenseWrap> },
    ],
  },

  /* ─── Admin routes (AdminLayout) ─── */
  {
    path: '/',
    element: (
      <RequireAuth>
        <ErrorBoundary>
          <SuspenseWrap>
            <AdminLayout />
          </SuspenseWrap>
        </ErrorBoundary>
      </RequireAuth>
    ),
    children: [
      /* ─── 总览（全局入口，无需展厅上下文）─── */
      {
        path: 'dashboard',
        element: <SuspenseWrap><DashboardPage /></SuspenseWrap>,
      },
      {
        path: 'halls',
        element: <SuspenseWrap><HallListPage /></SuspenseWrap>,
      },

      /* ─── 展厅管理 region（需要 HallContextGuard）─── */
      {
        path: 'halls/:hallId',
        element: <HallRoute><HallDetailPage /></HallRoute>,
      },
      /* 展项管理（新路径：/halls/:id/exhibits，v3 合并后的入口） */
      {
        path: 'halls/:hallId/exhibits',
        element: <HallRoute><ExhibitManagementPage /></HallRoute>,
      },
      {
        path: 'halls/:hallId/exhibits/:exhibitId',
        element: <HallRoute><ExhibitDetailPage /></HallRoute>,
      },
      {
        path: 'halls/:hallId/exhibits/:exhibitId/touch-nav',
        element: <HallRoute><TouchNavEditorPage /></HallRoute>,
      },
      /* Legacy 展项管理路径，保留以兼容内部跳转 */
      {
        path: 'halls/:hallId/exhibit-management',
        element: <HallRoute><ExhibitManagementPage /></HallRoute>,
      },
      {
        path: 'halls/:hallId/exhibit-management/:exhibitId',
        element: <HallRoute><ExhibitDetailPage /></HallRoute>,
      },
      /* 中控 App（新路径：/halls/:id/control-app，含 [面板编辑][中控配对码] 两 tab） */
      {
        path: 'halls/:hallId/control-app',
        element: <HallRoute><ControlAppPage /></HallRoute>,
      },
      /* 虚拟路径：未选展厅时菜单 fallback → 弹 modal → 选好后跳 /halls/:id/<target> */
      {
        path: 'exhibits',
        element: <HallRoute><HallScopedRedirect target="exhibits" /></HallRoute>,
      },
      {
        path: 'control-app',
        element: <HallRoute><HallScopedRedirect target="control-app" /></HallRoute>,
      },
      /* Legacy 路径：原"设备与配对" → 展项管理 [配对码] tab（Step 10.1 后续修复 1） */
      {
        path: 'halls/:hallId/pairing-codes',
        element: <HallRoute><LegacyPairingCodesRedirect /></HallRoute>,
      },
      {
        path: 'halls/:hallId/app-sessions',
        element: <HallRoute><AppSessionPage /></HallRoute>,
      },
      /* Legacy /halls/:id/panel-editor → /halls/:id/control-app */
      {
        path: 'halls/:hallId/panel-editor',
        element: <HallRoute><HallScopedRedirect target="control-app" /></HallRoute>,
      },
      {
        path: 'devices',
        element: <HallRoute><DeviceListPage /></HallRoute>,
      },
      /* device-mgmt-v2 P6：触发器管理 */
      {
        path: 'halls/:hallId/triggers',
        element: <HallRoute><TriggerListPage /></HallRoute>,
      },
      {
        path: 'triggers',
        element: <HallRoute><HallScopedRedirect target="triggers" /></HallRoute>,
      },
      /* 内容总库（新路径合并未绑定内容） */
      {
        path: 'contents',
        element: <HallRoute><ContentGroupListPage /></HallRoute>,
      },
      /* Legacy /unbound-contents → /contents?bind=unbound */
      {
        path: 'unbound-contents',
        element: <Navigate to="/contents?bind=unbound" replace />,
      },
      {
        /* Legacy route redirect */
        path: 'content-groups',
        element: <Navigate to="/contents" replace />,
      },
      {
        /* Legacy route redirect (detail page) */
        path: 'content-groups/:groupId',
        element: <HallRoute><ContentGroupDetailPage /></HallRoute>,
      },
      {
        path: 'scenes',
        element: <HallRoute><SceneListPage /></HallRoute>,
      },
      {
        path: 'shows',
        element: <HallRoute><ShowListPage /></HallRoute>,
      },
      {
        path: 'shows/:showId',
        element: <HallRoute><ShowDetailPage /></HallRoute>,
      },
      {
        path: 'shows/:showId/timeline',
        element: <HallRoute><ShowTimelinePage /></HallRoute>,
      },
      {
        path: 'ai/avatars',
        element: <HallRoute><AiAvatarListPage /></HallRoute>,
      },
      /* SmartHome（展厅管理 region 的折叠子组，admin-only） */
      {
        path: 'smarthome/gateways',
        element: <RequireAdmin><HallRoute><GatewaysPage /></HallRoute></RequireAdmin>,
      },
      {
        path: 'smarthome/health',
        element: <RequireAdmin><HallRoute><DeviceHealthPage /></HallRoute></RequireAdmin>,
      },
      {
        path: 'smarthome/rules',
        element: <RequireAdmin><HallRoute><RulesPage /></HallRoute></RequireAdmin>,
      },
      {
        path: 'smarthome/trigger-logs',
        element: <RequireAdmin><HallRoute><TriggerLogsPage /></HallRoute></RequireAdmin>,
      },
      {
        path: 'smarthome/alerts',
        element: <RequireAdmin><HallRoute><AlertsPage /></HallRoute></RequireAdmin>,
      },

      /* ─── 平台管理 region（admin-only，与展厅无关）─── */
      /* device-mgmt-v2 P6：设备目录（4 tab 合并入口） */
      {
        path: 'platform/device-catalog',
        element: <RequireAdmin><SuspenseWrap><DeviceCatalogPage /></SuspenseWrap></RequireAdmin>,
      },
      {
        path: 'platform/ai-avatar-library',
        element: <RequireAdmin><SuspenseWrap><AiAvatarLibraryPage /></SuspenseWrap></RequireAdmin>,
      },
      /* Legacy AI 形象库路径 */
      {
        path: 'ai/avatar-library',
        element: <Navigate to="/platform/ai-avatar-library" replace />,
      },
      /* 监控与分析 — 两个聚合页 */
      /* 运营分析（运行概览 / 内容统计 / AI 互动 三 Tab） */
      {
        path: 'analytics',
        element: <RequireAdmin><SuspenseWrap><AnalyticsHubPage /></SuspenseWrap></RequireAdmin>,
      },
      /* 存储与费用（用量总览 / 文件浏览 / 费用分析 三 Tab） */
      {
        path: 'analytics/storage',
        element: <RequireAdmin><SuspenseWrap><StorageOverviewPage /></SuspenseWrap></RequireAdmin>,
      },
      /* Legacy 路径：保持 Dashboard 旧链接 / 老书签可用，自动跳到对应 Tab */
      {
        path: 'analytics/overview',
        element: <Navigate to="/analytics?tab=overview" replace />,
      },
      {
        path: 'analytics/content-stats',
        element: <Navigate to="/analytics?tab=content" replace />,
      },
      {
        path: 'analytics/ai-stats',
        element: <Navigate to="/analytics?tab=ai" replace />,
      },
      {
        path: 'oss-stats',
        element: <Navigate to="/analytics/storage?tab=usage" replace />,
      },
      {
        path: 'analytics/oss-browser',
        element: <Navigate to="/analytics/storage?tab=browse" replace />,
      },
      {
        path: 'analytics/cost',
        element: <Navigate to="/analytics/storage?tab=cost" replace />,
      },
      {
        path: 'notifications',
        element: <RequireAdmin><SuspenseWrap><NotificationListPage /></SuspenseWrap></RequireAdmin>,
      },
      {
        path: 'logs',
        element: <RequireAdmin><SuspenseWrap><OperationLogPage /></SuspenseWrap></RequireAdmin>,
      },
      /* 系统配置（新前缀 /platform/*） */
      {
        path: 'platform/sys-config',
        element: <RequireAdmin><SuspenseWrap><SysConfigPage /></SuspenseWrap></RequireAdmin>,
      },
      {
        path: 'platform/releases',
        element: <RequireAdmin><SuspenseWrap><ReleasesPage /></SuspenseWrap></RequireAdmin>,
      },
      /* 权限管理（Phase 6）——不挂 RequireAdmin，靠菜单 requireActions 过滤 + 后端 403 interceptor 兜底 */
      /* P0.5（2026-04-25）：用户列表 / 详情 / 三步授权向导 全族迁入 /platform/authz/users 下 */
      {
        path: 'platform/authz/users',
        element: <SuspenseWrap><UserListPage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/users/:userId',
        element: <SuspenseWrap><UserDetailPage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/users/:userId/grant',
        element: <SuspenseWrap><GrantWizardPage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/role-templates',
        element: <SuspenseWrap><RoleTemplateListPage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/role-templates/new',
        element: <SuspenseWrap><RoleTemplateEditPage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/role-templates/:id/edit',
        element: <SuspenseWrap><RoleTemplateEditPage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/grants',
        element: <SuspenseWrap><GrantListPage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/audit',
        element: <SuspenseWrap><AuditLogListPage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/reports',
        element: <SuspenseWrap><AuditReportPage /></SuspenseWrap>,
      },
      /* 供应商管理（Phase 8） */
      {
        path: 'platform/authz/vendors',
        element: <SuspenseWrap><VendorListPage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/vendors/new',
        element: <SuspenseWrap><VendorCreatePage /></SuspenseWrap>,
      },
      {
        path: 'platform/authz/vendors/:id',
        element: <SuspenseWrap><VendorDetailPage /></SuspenseWrap>,
      },
      /* Legacy /users /platform/users /sys-config /releases → 新位置 */
      {
        path: 'users',
        element: <Navigate to="/platform/authz/users" replace />,
      },
      {
        path: 'users/:userId',
        element: <LegacyUserDetailRedirect />,
      },
      /* P0.5（2026-04-25）：旧 /platform/users → /platform/authz/users 全族 redirect */
      {
        path: 'platform/users',
        element: <Navigate to="/platform/authz/users" replace />,
      },
      {
        path: 'platform/users/:userId',
        element: <LegacyUserDetailRedirect />,
      },
      {
        path: 'platform/users/:userId/grant',
        element: <LegacyGrantWizardRedirect />,
      },
      {
        path: 'sys-config',
        element: <Navigate to="/platform/sys-config" replace />,
      },
      {
        path: 'releases',
        element: <Navigate to="/platform/releases" replace />,
      },

      /* ─── 404 inside layout ─── */
      {
        path: '*',
        element: <SuspenseWrap><NotFound /></SuspenseWrap>,
      },
    ],
  },
]);
