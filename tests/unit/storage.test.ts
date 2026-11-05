import { describe, expect, it } from 'vitest';
import { emptyStore, loadStore, sanitizeStore, saveStore, STORE_KEY } from '../../src/lib/storage';
import type { Deck } from '../../src/lib/deck';

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

  it('round-trips decks, the cards owned in each deck, and preferences', () => {
    const s = memoryStorage();
    const store = { ...emptyStore(), decks: [{ ...deck, owned: ['o-sol'], unownedBasics: ['o-swamp'] }] };
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
    expect(store.decks).toEqual([{ ...deck, owned: [], unownedBasics: [] }]);
    expect(store).not.toHaveProperty('owned');
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

// Ownership used to be one list shared by every deck (store.owned / store.unownedBasics). It now belongs to each deck,
// and anything saved in the old shape moves into the decks on load, so nobody loses ticks (docs/superpowers/plans/2026-11-05-owned-per-deck.md).
describe('migrating the old shared owned list into each deck', () => {
  const second: Deck = {
    id: 'd2',
    name: 'Other',
    format: 'commander',
    commander: { oracleId: 'o-other', name: 'Other Commander' },
    cards: [
      { card: { oracleId: 'o-sol', name: 'Sol Ring' }, qty: 1 },
      { card: { oracleId: 'o-signet', name: 'Arcane Signet' }, qty: 1 },
      { card: { oracleId: 'o-swamp', name: 'Swamp' }, qty: 8 },
    ],
    updatedAt: '2026-11-03T00:00:00.000Z',
  };
  const legacy = (over: Record<string, unknown> = {}) => ({
    version: 1,
    decks: [deck, second],
    owned: ['o-sol', 'o-signet', 'o-edgar', 'o-stranger'],
    unownedBasics: ['o-swamp', 'o-forest'],
    prefs: { view: 'grid' },
    ...over,
  });
  const byId = (decks: Deck[], id: string) => decks.find((d) => d.id === id)!;

  it('gives each deck the ticks for the cards it contains, commander included', () => {
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify(legacy()) }));
    expect(byId(store.decks, 'd1').owned).toEqual(['o-sol', 'o-edgar']);
    expect(byId(store.decks, 'd2').owned).toEqual(['o-sol', 'o-signet']);
  });

  it('keeps a card ticked in every deck that has it, so each deck looks as it did before', () => {
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify(legacy()) }));
    expect(byId(store.decks, 'd1').owned).toContain('o-sol');
    expect(byId(store.decks, 'd2').owned).toContain('o-sol');
  });

  it('moves unticked basic lands into the decks that have them and drops the rest', () => {
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify(legacy()) }));
    expect(byId(store.decks, 'd1').unownedBasics).toEqual([]);
    expect(byId(store.decks, 'd2').unownedBasics).toEqual(['o-swamp']);
  });

  it('drops ids that are in no deck, and leaves no shared list behind', () => {
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify(legacy()) }));
    expect(JSON.stringify(store)).not.toContain('o-stranger');
    expect(store).not.toHaveProperty('owned');
    expect(store).not.toHaveProperty('unownedBasics');
    expect(store.version).toBe(2);
    expect(store.prefs.view).toBe('grid');
  });

  it('marks every deck as migrated, even one with nothing ticked', () => {
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify(legacy({ owned: [], unownedBasics: [] })) }));
    expect(byId(store.decks, 'd1')).toMatchObject({ owned: [], unownedBasics: [] });
  });

  it('never overwrites a deck that already has its own ticks, so an old cached app cannot undo this', () => {
    const mine = { ...deck, owned: ['o-keep'] };
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify(legacy({ decks: [mine, second] })) }));
    expect(byId(store.decks, 'd1').owned).toEqual(['o-keep']);
    expect(byId(store.decks, 'd2').owned).toEqual(['o-sol', 'o-signet']);
  });

  it('gives the same result when loaded again and after saving', () => {
    const once = sanitizeStore(legacy());
    expect(sanitizeStore(JSON.parse(JSON.stringify(once)))).toEqual(once);
    const s = memoryStorage();
    saveStore(s, once);
    expect(loadStore(s).store).toEqual(once);
  });

  it('keeps only strings from a deck that has its own, damaged, fields', () => {
    const damaged = { ...deck, owned: ['o-sol', 3, null], unownedBasics: 'nope' };
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify({ version: 2, decks: [damaged], prefs: {} }) }));
    expect(store.decks[0].owned).toEqual(['o-sol']);
    expect(store.decks[0].unownedBasics ?? []).toEqual([]);
  });

  it('keeps one untouched copy of the old data the first time it migrates, and never overwrites it', () => {
    const raw = JSON.stringify(legacy());
    const s = memoryStorage({ [STORE_KEY]: raw });
    loadStore(s);
    expect(s.getItem(`${STORE_KEY}:before-owned-per-deck`)).toBe(raw);

    // A later load of already-migrated data leaves that copy as it was.
    saveStore(s, loadStore(s).store);
    loadStore(s);
    expect(s.getItem(`${STORE_KEY}:before-owned-per-deck`)).toBe(raw);
  });

  it('makes no copy when there is nothing to migrate', () => {
    const s = memoryStorage();
    saveStore(s, { ...emptyStore(), decks: [{ ...deck, owned: ['o-sol'], unownedBasics: [] }] });
    loadStore(s);
    expect(s.getItem(`${STORE_KEY}:before-owned-per-deck`)).toBeNull();
  });
});

describe('the first-use note preference', () => {
  const load = (prefs: unknown) => loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify({ version: 2, decks: [], prefs }) })).store.prefs;

  it('is absent by default, so a new device shows the note', () => {
    expect(emptyStore().prefs).toEqual({ view: 'list' });
    expect(load({ view: 'grid' })).toEqual({ view: 'grid' });
  });

  it('is kept only when it is exactly true', () => {
    expect(load({ view: 'list', helpDismissed: true })).toEqual({ view: 'list', helpDismissed: true });
    for (const bad of ['true', 1, null, false, {}]) expect(load({ view: 'list', helpDismissed: bad })).toEqual({ view: 'list' });
  });

  it('survives a save and a load', () => {
    const s = memoryStorage();
    saveStore(s, { ...emptyStore(), prefs: { view: 'grid', helpDismissed: true } });
    expect(loadStore(s).store.prefs).toEqual({ view: 'grid', helpDismissed: true });
  });
});

describe("bounding a deck's own owned lists", () => {
  it('removes duplicates and caps the length, so a hostile backup cannot make them huge', () => {
    const many = Array.from({ length: 5000 }, (_, i) => `id-${i}`);
    const big = { ...deck, owned: [...many, ...many], unownedBasics: many };
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify({ version: 2, decks: [big], prefs: {} }) }));
    expect(store.decks[0].owned).toHaveLength(1000);
    expect(new Set(store.decks[0].owned).size).toBe(1000);
    expect(store.decks[0].unownedBasics).toHaveLength(1000);
  });

  it('keeps an ordinary list exactly as it was', () => {
    const mine = { ...deck, owned: ['o-sol', 'o-gone'], unownedBasics: ['o-swamp'] };
    const { store } = loadStore(memoryStorage({ [STORE_KEY]: JSON.stringify({ version: 2, decks: [mine], prefs: {} }) }));
    expect(store.decks[0].owned).toEqual(['o-sol', 'o-gone']); // an id for a card removed from the deck stays: it may be re-added
  });
});
