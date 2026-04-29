/**
 * device-mgmt-v2 P9-E.2 — 直连展厅 App 兜底状态机（ADR-0016）。
 *
 * 三态：
 *   cloud         — 默认；axios 走 VITE_API_BASE_URL
 *   lan           — 走展厅 App 9900；写云端依赖资源时拦截到 IndexedDB pendingWrites
 *   disconnected  — 云端 + 局域网都不通
 *
 * 持久化：
 *   - lanAddress / mode  → localStorage（轻量、需要跨刷新记住）
 *   - lanToken           → sessionStorage（敏感，关浏览器即清；本期最简实现）
 *   - pendingWrites      → IndexedDB（utils/pendingWriteDB.ts），不在内存 mirror
 *
 * 与 axios 的耦合点：request.ts 同时在 request / response interceptor 里 `useDirectConnect.getState()` 读
 * 当前状态、记录 cloudFailCounter 决定是否自动回落、把 pending op 推入 IndexedDB。
 */
import { create } from 'zustand';
import {
  addPending,
  countPending,
  removePending,
  type PendingOp,
} from '@/utils/pendingWriteDB';
import { messageBus } from '@/utils/messageBus';

export type ConnectMode = 'cloud' | 'lan' | 'disconnected';

const LS_MODE = 'excs-direct-connect-mode';
const LS_LAN_ADDRESS = 'excs-direct-connect-lan-address';
const SS_LAN_TOKEN = 'excs-direct-connect-lan-token';

interface State {
  mode: ConnectMode;
  cloudLatencyMs?: number;
  lanAddress?: string;
  lanToken?: string;
  pendingCount: number;
  /** 测试连接 / 自动回落时的最近一次错误 */
  lastError?: string;

  setLanConfig: (addr: string, token: string) => void;
  clearLanConfig: () => void;
  switchToLan: () => void;
  switchToCloud: () => Promise<void>;
  setDisconnected: (reason?: string) => void;
  setCloudLatency: (ms: number | undefined) => void;
  /** 暂存一笔写操作；返回是否被裁剪掉某些老的 op（toast warn） */
  enqueuePending: (op: Omit<PendingOp, 'id' | 'ts'>) => Promise<{ trimmed: number }>;
  refreshPendingCount: () => Promise<void>;
  removePendingOp: (id: string) => Promise<void>;
}

function loadInitial(): Pick<State, 'mode' | 'lanAddress' | 'lanToken'> {
  const mode = (localStorage.getItem(LS_MODE) as ConnectMode | null) || 'cloud';
  return {
    mode: mode === 'lan' || mode === 'disconnected' ? mode : 'cloud',
    lanAddress: localStorage.getItem(LS_LAN_ADDRESS) || undefined,
    lanToken: sessionStorage.getItem(SS_LAN_TOKEN) || undefined,
  };
}

export const useDirectConnect = create<State>((set, get) => ({
  ...loadInitial(),
  pendingCount: 0,
  cloudLatencyMs: undefined,
  lastError: undefined,

  setLanConfig: (addr, token) => {
    localStorage.setItem(LS_LAN_ADDRESS, addr);
    sessionStorage.setItem(SS_LAN_TOKEN, token);
    set({ lanAddress: addr, lanToken: token });
  },
  clearLanConfig: () => {
    localStorage.removeItem(LS_LAN_ADDRESS);
    sessionStorage.removeItem(SS_LAN_TOKEN);
    set({ lanAddress: undefined, lanToken: undefined });
  },
  switchToLan: () => {
    if (!get().lanAddress) {
      messageBus.emit({ level: 'warning', content: '请先配置展厅 App 局域网地址 + token' });
      return;
    }
    localStorage.setItem(LS_MODE, 'lan');
    set({ mode: 'lan', cloudLatencyMs: undefined });
    messageBus.emit({ level: 'info', content: '已切到本地直连模式' });
  },
  switchToCloud: async () => {
    localStorage.setItem(LS_MODE, 'cloud');
    set({ mode: 'cloud', lastError: undefined });
    messageBus.emit({ level: 'info', content: '已切回云端' });
    // flushPendingWrites 由 request.ts 监听 mode 变化触发；这里只切状态
    await get().refreshPendingCount();
  },
  setDisconnected: (reason) => {
    set({ mode: 'disconnected', lastError: reason });
  },
  setCloudLatency: (ms) => {
    set({ cloudLatencyMs: ms });
    if (get().mode === 'disconnected' && ms !== undefined) {
      // 云端恢复了——但 admin 之前手动设过 lan 时尊重选择，不抢回 cloud
      localStorage.setItem(LS_MODE, 'cloud');
      set({ mode: 'cloud', lastError: undefined });
    }
  },
  enqueuePending: async (op) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullOp: PendingOp = { ...op, id, ts: Date.now() };
    const result = await addPending(fullOp);
    await get().refreshPendingCount();
    return result;
  },
  refreshPendingCount: async () => {
    const count = await countPending();
    set({ pendingCount: count });
  },
  removePendingOp: async (id) => {
    await removePending(id);
    await get().refreshPendingCount();
  },
}));

// 启动时同步一次 pending 数（IndexedDB 异步）
void useDirectConnect.getState().refreshPendingCount();
