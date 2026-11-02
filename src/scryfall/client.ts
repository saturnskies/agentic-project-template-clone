/**
 * The one way the app talks to Scryfall: requests are queued about 100 ms
 * apart (Scryfall asks for under ~10/s), 429s are retried with backoff, and
 * responses are cached for 24 h (prices only change daily).
 */

export const SCRYFALL_BASE = 'https://api.scryfall.com';

export type CacheEntry = { t: number; body: unknown };

export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
}

export interface ClientOptions {
  fetch?: typeof fetch;
  cache?: CacheStore;
  spacingMs?: number;
  ttlMs?: number;
  maxRetries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ScryfallClient {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body: unknown): Promise<T>;
}

export class ScryfallError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ScryfallError';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createClient(opts: ClientOptions = {}): ScryfallClient {
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const cache = opts.cache ?? idbCache();
  const spacingMs = opts.spacingMs ?? 100;
  const ttlMs = opts.ttlMs ?? DAY_MS;
  const maxRetries = opts.maxRetries ?? 3;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // A promise chain serializes network calls; lastStart spaces them out.
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;

  const throttled = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      const wait = lastStart + spacingMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      return task();
    });
    queue = run.catch(() => undefined);
    return run;
  };

  async function send<T>(path: string, init: RequestInit, cacheKey: string): Promise<T> {
    const hit = await safe(() => cache.get(cacheKey));
    if (hit && now() - hit.t <= ttlMs) return hit.body as T;

    for (let attempt = 0; ; attempt += 1) {
      const res = await throttled(() => doFetch(SCRYFALL_BASE + path, init));
      if (res.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const details = (body && typeof body === 'object' && 'details' in body && String(body.details)) || res.statusText;
        throw new ScryfallError(res.status, `Scryfall ${res.status}: ${details}`);
      }
      await safe(() => cache.set(cacheKey, { t: now(), body }));
      return body as T;
    }
  }

  return {
    get: (path) => send(path, { headers: { Accept: 'application/json' } }, `GET ${path}`),
    post: (path, body) => {
      const text = JSON.stringify(body);
      return send(path, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: text }, `POST ${path} ${text}`);
    },
  };
}

/** Storage can be blocked (private windows); the app must still work without it. */
async function safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

export function memoryCache(): CacheStore {
  const m = new Map<string, CacheEntry>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
}

export function idbCache(dbName = 'swapsmith-cache'): CacheStore {
  const STORE = 'responses';
  let dbp: Promise<IDBDatabase> | undefined;
  const db = () =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const store = (await db()).transaction(STORE, mode).objectStore(STORE);
    return new Promise<T>((resolve, reject) => {
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    get: (k) => tx<CacheEntry | undefined>('readonly', (s) => s.get(k)),
    set: async (k, v) => void (await tx('readwrite', (s) => s.put(v, k))),
  };
}
