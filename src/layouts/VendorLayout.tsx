/**
 * VendorLayout —— 供应商专属 UI 骨架（Phase 9 / PRD §7.1 §7.8）。
 *
 * 和 AdminLayout 的关系：
 *   - 复用同一份 AdminLayout.module.scss（sidebar/topbar 变量、按钮样式、下拉菜单），
 *     不引入新样式表。ClassName 继续用 `admin-layout__*` 前缀。
 *   - 菜单由独立 `buildVendorMenu()` 构造，不复用 `buildMenuRegions()`，避免内部菜单
 *     污染 vendor 视图；vendor 没有 hall / exhibit 选择器，也没有平台管理区。
 *   - `TeamMembersPage` 前端再次用 `useAuthStore(s => s.user?.is_primary)` 做硬 gate；
 *     后端由 `RequireVendorSelfOrManage` 再兜底一次，双保险。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useBrandingStore } from '@/stores/brandingStore';
import NotificationBell from '@/components/notification/NotificationBell';
import ForceChangePasswordModal from '@/components/auth/ForceChangePasswordModal';
import styles from './AdminLayout.module.scss';

const SIDEBAR_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 68;

interface VendorMenuItem {
  path: string;
  icon: string;
  label: string;
  /** 仅主账号可见（团队成员管理）。其它菜单对主/子账号都可见。 */
  primaryOnly?: boolean;
}

function buildVendorMenu(isPrimary: boolean): VendorMenuItem[] {
  const items: VendorMenuItem[] = [
    { path: '/vendor/contents', icon: 'folder_open', label: '我的内容' },
  ];
  if (isPrimary) {
    items.push({ path: '/vendor/team', icon: 'group', label: '团队成员', primaryOnly: true });
  }
  items.push(
    { path: '/vendor/messages', icon: 'notifications', label: '消息' },
    { path: '/vendor/settings', icon: 'settings', label: '设置' },
  );
  return items;
}

/**
 * titleMap 键按"从长到短 / 从具体到泛"顺序排列；`resolveTitle` 遍历时第一个匹配即返回，
 * 保证 `/vendor/settings` 命中「设置」而不是被 `/vendor` 前缀先吞成「我的内容」。
 */
const TITLE_ENTRIES: Array<[string, string]> = [
  ['/vendor/contents', '我的内容'],
  ['/vendor/team', '团队成员'],
  ['/vendor/messages', '消息'],
  ['/vendor/settings', '设置'],
  ['/vendor', '我的内容'],
];

function resolveTitle(pathname: string): string {
  for (const [path, t] of TITLE_ENTRIES) {
    if (pathname === path || pathname.startsWith(path + '/')) return t;
  }
  return '供应商工作台';
}

export default function VendorLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const userName = useAuthStore((s) => s.userName);
  const userAvatar = useAuthStore((s) => s.userAvatar);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const isPrimary = user?.is_primary === true;
  const vendorName = user?.vendor_name || '供应商工作台';

  const brandingLoaded = useBrandingStore((s) => s.loaded);
  const brandingSystemName = useBrandingStore((s) => s.systemName);
  const brandingLogoUrl = useBrandingStore((s) => s.logoUrl);
  const brandingCompanyName = useBrandingStore((s) => s.companyName);
  const fetchBranding = useBrandingStore((s) => s.fetchBranding);

  useEffect(() => {
    if (!brandingLoaded) fetchBranding();
  }, [brandingLoaded, fetchBranding]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
  const avatarWrapperRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (avatarWrapperRef.current && !avatarWrapperRef.current.contains(e.target as Node)) {
      setShowAvatarDropdown(false);
    }
  }, []);
  useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [handleClickOutside]);

  const menu = buildVendorMenu(isPrimary);

  const currentPageTitle = resolveTitle(location.pathname);
  useEffect(() => {
    document.title = `${currentPageTitle} - ${brandingSystemName || 'ExCS'}`;
  }, [currentPageTitle, brandingSystemName]);

  function isActive(path: string) {
    if (path === '/vendor/contents') {
      return location.pathname === '/vendor' || location.pathname.startsWith('/vendor/contents');
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  const handleLogout = () => {
    setShowAvatarDropdown(false);
    logout();
  };

  return (
    <div className={styles['admin-layout']}>
      {/* Sidebar */}
      <aside
        className={`${styles['admin-layout__sidebar']} ${sidebarCollapsed ? styles['admin-layout__sidebar--collapsed'] : ''}`}
        style={{ width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
      >
        <div className={styles['admin-layout__sidebar-header']}>
          <div className={styles['admin-layout__logo-icon']}>
            {brandingLogoUrl ? (
              <img src={brandingLogoUrl} alt="Logo" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            ) : (
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>business_center</span>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className={styles['admin-layout__logo-text']}>
              <h1 className={styles['admin-layout__logo-title']} style={{ fontSize: 15, lineHeight: 1.2 }}>
                {vendorName}
              </h1>
              <p className={styles['admin-layout__logo-subtitle']}>
                {isPrimary ? '主账号' : '子账号'}
              </p>
            </div>
          )}
        </div>

        <nav className={styles['admin-layout__nav']}>
          {menu.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`${styles['admin-layout__nav-item']} ${
                isActive(item.path) ? styles['admin-layout__nav-item--active'] : ''
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span
                className="material-symbols-outlined"
                style={isActive(item.path) ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              {!sidebarCollapsed && item.label}
            </Link>
          ))}
        </nav>

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
        <header
          className={styles['admin-layout__topbar']}
          style={{ left: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
        >
          <div className={styles['admin-layout__topbar-left']}>
            <h2 className={styles['admin-layout__page-title']}>{currentPageTitle}</h2>
          </div>
          <div className={styles['admin-layout__topbar-right']}>
            <NotificationBell
              viewAllPath="/vendor/messages"
              buttonClassName={styles['admin-layout__topbar-icon-btn']}
            />

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
                      <p className={styles['admin-layout__avatar-dropdown-role']}>
                        {isPrimary ? '供应商主账号' : '供应商成员'}
                      </p>
                    </div>
                  </div>
                  <div className={styles['admin-layout__avatar-dropdown-divider']} />
                  <button
                    className={styles['admin-layout__avatar-dropdown-item']}
                    onClick={() => { setShowAvatarDropdown(false); navigate('/vendor/settings'); }}
                  >
                    <span className="material-symbols-outlined">settings</span>
                    账号设置
                  </button>
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

        <div className={styles['admin-layout__content']}>
          <Outlet />
          <footer className={styles['admin-layout__footer']}>
            <p className={styles['admin-layout__footer-copy']}>
              © {new Date().getFullYear()} {brandingCompanyName || 'ExCS'}. All rights reserved.
            </p>
          </footer>
        </div>
      </main>

      {/* Phase 11.9：首登强制改密 Modal */}
      <ForceChangePasswordModal />
    </div>
  );
}
