/**
 * The one way the app talks to Scryfall: requests are queued about 100 ms
 * apart (Scryfall asks for under ~10/s), searches and lookups 500 ms apart,
 * 429s and dropped connections are retried with backoff, and responses are
 * cached for 24 h (prices only change daily).
 */

export const SCRYFALL_BASE = 'https://api.scryfall.com';

export type CacheEntry = { t: number; body: unknown };

export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
}

export interface ClientOptions {
  /** Another host with the same queue, retry and cache (EDHREC). Defaults to Scryfall. */
  base?: string;
  /** The host's name in error messages. */
  service?: string;
  fetch?: typeof fetch;
  cache?: CacheStore;
  spacingMs?: number;
  /** Minimum gap between Scryfall's heavier endpoints (search, named, collection), which rate-limit sooner. */
  heavySpacingMs?: number;
  ttlMs?: number;
  maxRetries?: number;
  /** Most requests open at once; start times are also spaced by spacingMs. */
  maxInFlight?: number;
  /** A request with no answer after this long is abandoned and retried like a dropped connection. */
  timeoutMs?: number;
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
  const base = opts.base ?? SCRYFALL_BASE;
  const service = opts.service ?? 'Scryfall';
  // Another host's replies are cached under its own base, so a shared cache can't mix them up.
  const keyPrefix = base === SCRYFALL_BASE ? '' : `${base} `;
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const cache = opts.cache ?? idbCache();
  const spacingMs = opts.spacingMs ?? 100;
  const heavySpacingMs = opts.heavySpacingMs ?? 500;
  const ttlMs = opts.ttlMs ?? DAY_MS;
  const maxRetries = opts.maxRetries ?? 3;
  const maxInFlight = opts.maxInFlight ?? 4;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // Start times are handed out spacingMs apart, and at most maxInFlight requests are open at once.
  // Replies may overlap, so one slow reply doesn't hold up the rest.
  let queue: Promise<void> = Promise.resolve();
  let lastStart = -Infinity;
  let lastHeavyStart = -Infinity;
  let open = 0;
  const waiting: Array<() => void> = [];

  const acquire = () => (open < maxInFlight ? (open += 1, Promise.resolve()) : new Promise<void>((r) => waiting.push(r)));
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else open -= 1;
  };

  // Scryfall returned 429s to bursts of searches at 10/s (2026-11-02), so these go out at most ~2/s.
  const isHeavy = (path: string) => /^\/cards\/(search|named|collection)\b/.test(path);

  const throttled = <T>(path: string, task: () => Promise<T>): Promise<T> => {
    const heavy = isHeavy(path);
    const slot = queue.then(async () => {
      await acquire();
      const wait = Math.max(lastStart + spacingMs, heavy ? lastHeavyStart + heavySpacingMs : -Infinity) - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      if (heavy) lastHeavyStart = lastStart;
    });
    queue = slot;
    return slot.then(async () => {
      try {
        return await task();
      } finally {
        release();
      }
    });
  };

  async function send<T>(path: string, init: RequestInit, cacheKey: string): Promise<T> {
    const hit = await safe(() => cache.get(cacheKey));
    if (hit && now() - hit.t <= ttlMs) return hit.body as T;

    for (let attempt = 0; ; attempt += 1) {
      let res: Response;
      try {
        res = await throttled(path, async () => {
          const abort = new AbortController();
          const timer = setTimeout(() => abort.abort(), timeoutMs);
          try {
            return await doFetch(base + path, { ...init, signal: abort.signal });
          } finally {
            clearTimeout(timer);
          }
        });
      } catch (e) {
        // A dropped connection, a request that timed out, or a reply the browser blocks (such as a
        // rate-limit page without CORS headers) has no status: back off and retry like a 429.
        if (attempt < maxRetries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new ScryfallError(0, `Couldn't reach ${service}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (res.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const details = (body && typeof body === 'object' && 'details' in body && String(body.details)) || res.statusText;
        throw new ScryfallError(res.status, `${service} ${res.status}: ${details}`);
      }
      await safe(() => cache.set(cacheKey, { t: now(), body }));
      return body as T;
    }
  }

  return {
    get: (path) => send(path, { headers: { Accept: 'application/json' } }, `${keyPrefix}GET ${path}`),
    post: (path, body) => {
      const text = JSON.stringify(body);
      return send(path, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: text }, `${keyPrefix}POST ${path} ${text}`);
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
