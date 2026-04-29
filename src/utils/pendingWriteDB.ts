/**
 * device-mgmt-v2 P9-E.2 — 直连模式 pending writes 持久化（IndexedDB）。
 *
 * 用途：直连模式（mode='lan'）下用户尝试写云端依赖的资源，request 拦截器把请求暂存，
 *      云端恢复后顺序回放。重启浏览器也不丢（IndexedDB），但若超过 MAX_PENDING (100)
 *      则丢最老的并 toast warn。
 *
 * 自写而非引入 localforage——本仓避免新增依赖；接口面 ≤ 5 个方法，足够本期使用。
 */

const DB_NAME = 'excs-direct-connect';
const STORE_NAME = 'pending-writes';
const DB_VERSION = 1;
export const MAX_PENDING = 100;

export interface PendingOp {
  id: string;
  ts: number;
  method: string;
  url: string;
  data?: unknown;
  params?: unknown;
  /** 给用户看的描述 — request interceptor 据 url + method 自动生成 */
  description: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function awaitReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listPending(): Promise<PendingOp[]> {
  try {
    const db = await openDB();
    const all = (await awaitReq(txStore(db, 'readonly').getAll())) as PendingOp[];
    return all.sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  }
}

export async function addPending(op: PendingOp): Promise<{ trimmed: number }> {
  const db = await openDB();
  await awaitReq(txStore(db, 'readwrite').put(op));
  // 溢出裁剪：超过 MAX_PENDING 时丢最老的
  const all = await listPending();
  let trimmed = 0;
  if (all.length > MAX_PENDING) {
    const overflow = all.slice(0, all.length - MAX_PENDING);
    for (const o of overflow) {
      await awaitReq(txStore(db, 'readwrite').delete(o.id));
      trimmed++;
    }
  }
  return { trimmed };
}

export async function removePending(id: string): Promise<void> {
  const db = await openDB();
  await awaitReq(txStore(db, 'readwrite').delete(id));
}

export async function clearPending(): Promise<void> {
  const db = await openDB();
  await awaitReq(txStore(db, 'readwrite').clear());
}

export async function countPending(): Promise<number> {
  try {
    const db = await openDB();
    return (await awaitReq(txStore(db, 'readonly').count())) as number;
  } catch {
    return 0;
  }
}

/** 给单次 request 打描述：admin UI 在 pending 列表里能看到「更新设备 #12」之类。 */
export function describeRequest(method: string, url: string): string {
  const m = method.toUpperCase();
  // 设备
  let match = url.match(/\/v2\/devices\/(\d+)\/channel-map/);
  if (match) return `${m} 设备 #${match[1]} 通道映射`;
  match = url.match(/\/v2\/devices\/(\d+)\/command-presets/);
  if (match) return `${m} 设备 #${match[1]} 指令组`;
  match = url.match(/\/v2\/devices\/(\d+)/);
  if (match) return `${m} 设备 #${match[1]}`;
  if (/\/v2\/devices/.test(url) && m === 'POST') return `${m} 新建设备`;
  // 触发器
  match = url.match(/\/v2\/triggers\/(\d+)/);
  if (match) return `${m} 触发器 #${match[1]}`;
  if (/\/v2\/triggers/.test(url) && m === 'POST') return `${m} 新建触发器`;
  // 场景
  match = url.match(/\/scenes\/(\d+)/);
  if (match) return `${m} 场景 #${match[1]}`;
  return `${m} ${url}`;
}
