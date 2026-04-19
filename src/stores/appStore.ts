import { create } from 'zustand';

/* ==================== Types ==================== */

type Theme = 'light' | 'dark';

interface AppState {
  sidebarCollapsed: boolean;
  globalLoading: boolean;
  pageTitle: string;
  theme: Theme;
}

interface AppActions {
  /* Derived */
  sidebarWidth: () => number;

  /* Actions */
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setGlobalLoading: (loading: boolean) => void;
  setPageTitle: (title: string) => void;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

type AppStore = AppState & AppActions;

/* ==================== Helpers ==================== */

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('excs-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('excs-theme', theme);
}

/* ==================== Store ==================== */

const initialTheme = getInitialTheme();
applyTheme(initialTheme);

export const useAppStore = create<AppStore>()((set, get) => ({
  /* ==================== State ==================== */
  sidebarCollapsed: false,
  globalLoading: false,
  pageTitle: '',
  theme: initialTheme,

  /* ==================== Derived ==================== */
  sidebarWidth: () => (get().sidebarCollapsed ? 64 : 256),

  /* ==================== Actions ==================== */
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setGlobalLoading: (loading) => set({ globalLoading: loading }),
  setPageTitle: (title) => set({ pageTitle: title }),
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    set({ theme: next });
  },
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
