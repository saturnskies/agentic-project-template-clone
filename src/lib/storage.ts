import { isDeck, type Deck } from './deck';

/**
 * Everything Swapsmith keeps in the browser, under one versioned key (see ADR-001). The key stays
 * `swapsmith:v1`: the `version` field inside is what moves. Version 2 keeps the owned cards on each deck;
 * version 1 had one list shared by every deck, and `sanitizeStore` moves that into the decks on load.
 */
export interface Store {
  version: 2;
  decks: Deck[];
  /** `helpDismissed` is set once the first-use note about Owned and Keep has been dismissed on this device. */
  prefs: { view: 'grid' | 'list'; helpDismissed?: true };
}

export const STORE_KEY = 'swapsmith:v1';
const MIGRATION_BACKUP_KEY = `${STORE_KEY}:before-owned-per-deck`;

export function emptyStore(): Store {
  return { version: 2, decks: [], prefs: { view: 'list' } };
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

  // The first time the old shared owned list is migrated into the decks, keep the old data as it was.
  // Nothing reads this copy; it only exists so a mistake can never cost anyone their decks.
  if (('owned' in data || 'unownedBasics' in data) && !storage.getItem(MIGRATION_BACKUP_KEY)) {
    try {
      storage.setItem(MIGRATION_BACKUP_KEY, raw);
    } catch {
      // Storage full or blocked: the migration still works, just without the safety copy.
    }
  }

  return { store: sanitizeStore(data), persistent: true };
}

/**
 * Builds a valid Store from untrusted parsed JSON: bad decks and fields are dropped, never thrown on.
 * A store saved in the old shape (one `owned` / `unownedBasics` list for every deck) is migrated here, so
 * loading, restoring an old backup and opening an old cached copy of the data all end up the same way.
 */
export function sanitizeStore(data: Record<string, unknown>): Store {
  const prefs = (data.prefs ?? {}) as Record<string, unknown>;
  const legacy = 'owned' in data || 'unownedBasics' in data ? { owned: strings(data.owned), unownedBasics: strings(data.unownedBasics) } : null;
  return {
    version: 2,
    decks: (Array.isArray(data.decks) ? data.decks.filter(isDeck) : []).map((d) => withOwnership(d, legacy)),
    prefs: { view: prefs.view === 'grid' ? 'grid' : 'list', ...(prefs.helpDismissed === true ? { helpDismissed: true as const } : {}) },
  };
}

/**
 * A deck that already has its own ticks keeps them (cleaned up), even if old shared lists are also
 * present: an old cached copy of the app saving the old shape must not undo the migration. Otherwise the
 * old shared lists are copied in, keeping only the cards this deck contains, so it looks as it did before.
 */
function withOwnership(deck: Deck, legacy: { owned: string[]; unownedBasics: string[] } | null): Deck {
  const raw = deck as unknown as Record<string, unknown>;
  if ('owned' in raw || 'unownedBasics' in raw) return { ...deck, owned: strings(raw.owned), unownedBasics: strings(raw.unownedBasics) };
  if (!legacy) return deck;
  const ids = new Set([deck.commander.oracleId, ...deck.cards.map((e) => e.card.oracleId)]);
  const mine = (list: string[]) => [...new Set(list.filter((id) => ids.has(id)))];
  return { ...deck, owned: mine(legacy.owned), unownedBasics: mine(legacy.unownedBasics) };
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
