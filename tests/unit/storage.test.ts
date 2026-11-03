import { describe, expect, it } from 'vitest';
import { emptyStore, loadStore, saveStore, STORE_KEY } from '../../src/lib/storage';
import { savedBracket, type Deck } from '../../src/lib/deck';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const deck: Deck = {
  id: 'd1',
  name: 'Edgar',
  format: 'commander',
  commander: { oracleId: 'o-edgar', name: 'Edgar Markov' },
  cards: [{ card: { oracleId: 'o-sol', name: 'Sol Ring' }, qty: 1 }],
  updatedAt: '2026-11-02T00:00:00.000Z',
};

describe('storage', () => {
  it('starts with an empty store when nothing is saved', () => {
    expect(loadStore(memoryStorage())).toEqual({ store: emptyStore(), persistent: true });
  });

  it('round-trips decks, owned cards and preferences', () => {
    const s = memoryStorage();
    const store = { ...emptyStore(), decks: [deck], owned: ['o-sol'] };
    expect(saveStore(s, store)).toBe(true);
    expect(loadStore(s).store).toEqual(store);
  });

  it('keeps a backup and starts fresh when the saved data is corrupt', () => {
    const s = memoryStorage({ [STORE_KEY]: '{not json' });
    expect(loadStore(s).store).toEqual(emptyStore());
    expect(s.getItem(`${STORE_KEY}:backup`)).toBe('{not json');
  });

  it('drops malformed decks but keeps valid ones', () => {
    const raw = JSON.stringify({ version: 1, decks: [deck, { id: 7 }, null], owned: 'nope' });
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: raw }));
    expect(store.decks).toEqual([deck]);
    expect(store.owned).toEqual([]);
  });

  it("keeps a deck's bracket pick for suggestions, and still loads decks saved before it existed", () => {
    const s = memoryStorage();
    const store = { ...emptyStore(), decks: [{ ...deck, bracket: 3 }, { ...deck, id: 'd2' }] };
    saveStore(s, store);
    const loaded = loadStore(s).store.decks;
    expect(savedBracket(loaded[0])).toBe(3);
    expect(savedBracket(loaded[1])).toBeUndefined();
  });

  it('ignores a saved bracket that is not 0 (all decks) to 5', () => {
    for (const bad of [6, -1, 2.5, '3', null]) expect(savedBracket({ ...deck, bracket: bad as unknown as number })).toBeUndefined();
    expect(savedBracket({ ...deck, bracket: 0 })).toBe(0);
  });

  it('reports non-persistent storage when it is missing or throws', () => {
    expect(loadStore(null)).toEqual({ store: emptyStore(), persistent: false });
    const throwing = { ...memoryStorage(), getItem: () => { throw new Error('SecurityError'); } } as Storage;
    expect(loadStore(throwing).persistent).toBe(false);
    const full = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceeded'); } } as Storage;
    expect(saveStore(full, emptyStore())).toBe(false);
    expect(saveStore(null, emptyStore())).toBe(false);
  });
});
