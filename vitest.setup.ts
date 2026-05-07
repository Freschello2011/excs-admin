import '@testing-library/jest-dom/vitest';

// Node 24 has a quirky localStorage when `--localstorage-file` is set without a path,
// which causes `localStorage.getItem is not a function`. Force a clean in-memory shim
// for both node and jsdom environments to keep module-load code paths happy
// (e.g. directConnectStore reads localStorage at import time).
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});

// jsdom 不实现 ResizeObserver —— antd 6 Select / Drawer / Slider 触发 dropdown 时
// 调 rc-resize-observer 走 ResizeObserver，缺会抛 ReferenceError。给个 noop。
// tsconfig.node.json 只挂 lib=ES2023，不带 DOM；用 Record 索引绕过 typeof globalThis。
{
  type GlobalRecord = Record<string, unknown>;
  const g = globalThis as unknown as GlobalRecord;
  if (typeof g.ResizeObserver === 'undefined') {
    class ResizeObserverShim {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    g.ResizeObserver = ResizeObserverShim;
  }
}
