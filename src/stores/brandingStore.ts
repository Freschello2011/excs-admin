import { create } from 'zustand';
import axios from 'axios';

interface BrandingState {
  companyName: string;
  systemName: string;
  logoUrl: string;
  loaded: boolean;
}

interface BrandingActions {
  fetchBranding: () => Promise<void>;
  /** 系统简称（如 "ExCS"） */
  shortName: () => string;
  /** 系统副标题（如 "展控系统"） */
  subtitle: () => string;
}

type BrandingStore = BrandingState & BrandingActions;

const DEFAULT_COMPANY = '北京无界创羿科技有限公司';
const DEFAULT_SYSTEM = 'ExCS 展控系统';

export const useBrandingStore = create<BrandingStore>()((set, get) => ({
  companyName: DEFAULT_COMPANY,
  systemName: DEFAULT_SYSTEM,
  logoUrl: '',
  loaded: false,

  fetchBranding: async () => {
    try {
      const baseURL = import.meta.env.VITE_API_BASE_URL || '';
      const res = await axios.get(`${baseURL}/api/v1/branding`);
      if (res.data?.code === 0 && res.data.data) {
        const { company_name, system_name, logo_url } = res.data.data;
        set({
          companyName: company_name || DEFAULT_COMPANY,
          systemName: system_name || DEFAULT_SYSTEM,
          logoUrl: logo_url || '',
          loaded: true,
        });
      }
    } catch {
      // 失败时使用默认值
      set({ loaded: true });
    }
  },

  shortName: () => {
    const name = get().systemName;
    // 取空格前的部分作为简称
    const idx = name.indexOf(' ');
    return idx > 0 ? name.substring(0, idx) : name;
  },

  subtitle: () => {
    const name = get().systemName;
    const idx = name.indexOf(' ');
    return idx > 0 ? name.substring(idx + 1) : '';
  },
}));
