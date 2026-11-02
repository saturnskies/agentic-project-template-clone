import { isDeck, type Deck } from './deck';

/** Everything Swapsmith keeps in the browser, under one versioned key (see ADR-001). */
export interface Store {
  version: 1;
  decks: Deck[];
  owned: string[];
  unownedBasics: string[];
  prefs: { view: 'grid' | 'list' };
}

export const STORE_KEY = 'swapsmith:v1';

export function emptyStore(): Store {
  return { version: 1, decks: [], owned: [], unownedBasics: [], prefs: { view: 'list' } };
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);

/** Reads the store. `persistent` is false when storage is missing or blocked (some private windows). */
export function loadStore(storage: Storage | null): { store: Store; persistent: boolean } {
  if (!storage) return { store: emptyStore(), persistent: false };
  let raw: string | null;
  try {
    raw = storage.getItem(STORE_KEY);
  } catch {
    return { store: emptyStore(), persistent: false };
  }
  if (raw == null) return { store: emptyStore(), persistent: true };

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
    if (!data || typeof data !== 'object') throw new Error('not an object');
  } catch {
    try {
      storage.setItem(`${STORE_KEY}:backup`, raw);
    } catch {
      // Nothing more we can do; start fresh.
    }
    return { store: emptyStore(), persistent: true };
  }

  const prefs = (data.prefs ?? {}) as Record<string, unknown>;
  return {
    store: {
      version: 1,
      decks: Array.isArray(data.decks) ? data.decks.filter(isDeck) : [],
      owned: strings(data.owned),
      unownedBasics: strings(data.unownedBasics),
      prefs: { view: prefs.view === 'grid' ? 'grid' : 'list' },
    },
    persistent: true,
  };
}

/** Saves the store; returns false when storage is missing, blocked or full. */
export function saveStore(storage: Storage | null, store: Store): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** The browser's localStorage, or null when accessing it throws. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
