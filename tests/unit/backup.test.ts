import { describe, expect, it } from 'vitest';
import { backupFileName, BackupError, makeBackup, mergeBackup, parseBackup } from '../../src/lib/backup';
import { cleanDeckName, type Deck } from '../../src/lib/deck';
import { emptyStore, type Store } from '../../src/lib/storage';
import { backTarget } from '../../src/lib/nav';

const deck = (id: string, name: string, updatedAt: string): Deck => ({
  id,
  name,
  format: 'commander',
  commander: { oracleId: `o-${id}`, name: 'Edgar Markov' },
  cards: [{ card: { oracleId: 'o-sol', name: 'Sol Ring' }, qty: 1 }],
  updatedAt,
});
const store = (over: Partial<Store>): Store => ({ ...emptyStore(), ...over });

describe('backup round trip', () => {
  it('parses what makeBackup wrote', () => {
    const s = store({ decks: [deck('a', 'Edgar', '2026-01-01T00:00:00Z')], owned: ['o-sol'], unownedBasics: ['Swamp'], prefs: { view: 'grid' } });
    expect(parseBackup(makeBackup(s))).toEqual(s);
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date('2026-11-02T10:00:00Z'))).toBe('swapsmith-backup-2026-11-02.json');
  });

  it.each([
    ['not json', 'hello'],
    ['empty', ''],
    ['json null', 'null'],
    ['an array', '[]'],
    ['a different app', JSON.stringify({ app: 'other', backup: 1, store: {} })],
    ['a newer format', JSON.stringify({ app: 'swapsmith', backup: 2, store: {} })],
    ['no store', JSON.stringify({ app: 'swapsmith', backup: 1 })],
  ])('rejects %s', (_, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
  });

  it('drops damaged decks and keeps the good ones', () => {
    const good = deck('a', 'Edgar', '2026-01-01T00:00:00Z');
    const text = JSON.stringify({ app: 'swapsmith', backup: 1, store: { decks: [good, { id: 'x' }, 7], owned: ['o-sol', 3] } });
    const out = parseBackup(text);
    expect(out.decks).toEqual([good]);
    expect(out.owned).toEqual(['o-sol']);
  });
});

describe('mergeBackup', () => {
  it('adds decks that are only in the backup and keeps the current ones', () => {
    const cur = store({ decks: [deck('a', 'A', '2026-02-01T00:00:00Z')] });
    const bak = store({ decks: [deck('b', 'B', '2026-01-01T00:00:00Z')] });
    const r = mergeBackup(cur, bak);
    expect(r.store.decks.map((d) => d.id)).toEqual(['a', 'b']);
    expect(r).toMatchObject({ added: 1, updated: 0 });
  });

  it('keeps whichever copy of a deck was edited last', () => {
    const cur = store({ decks: [deck('a', 'New name', '2026-03-01T00:00:00Z'), deck('c', 'Old', '2026-01-01T00:00:00Z')] });
    const bak = store({ decks: [deck('a', 'Old name', '2026-02-01T00:00:00Z'), deck('c', 'Newer', '2026-02-01T00:00:00Z')] });
    const r = mergeBackup(cur, bak);
    expect(r.store.decks.find((d) => d.id === 'a')!.name).toBe('New name');
    expect(r.store.decks.find((d) => d.id === 'c')!.name).toBe('Newer');
    expect(r).toMatchObject({ added: 0, updated: 1 });
  });

  it('combines owned cards without duplicates and never removes any', () => {
    const r = mergeBackup(store({ owned: ['a', 'b'], unownedBasics: ['Swamp'] }), store({ owned: ['b', 'c'], unownedBasics: ['Forest'] }));
    expect(r.store.owned.sort()).toEqual(['a', 'b', 'c']);
    expect(r.store.unownedBasics.sort()).toEqual(['Forest', 'Swamp']);
  });

  it('keeps the current view preference', () => {
    const r = mergeBackup(store({ prefs: { view: 'grid' } }), store({ prefs: { view: 'list' } }));
    expect(r.store.prefs.view).toBe('grid');
  });

  it('does not change the stores it was given', () => {
    const cur = store({ decks: [deck('a', 'A', '2026-02-01T00:00:00Z')] });
    mergeBackup(cur, store({ decks: [deck('b', 'B', '2026-01-01T00:00:00Z')] }));
    expect(cur.decks).toHaveLength(1);
  });
});

describe('cleanDeckName', () => {
  it('trims and collapses spaces', () => expect(cleanDeckName('  Edgar   Vampires ')).toBe('Edgar Vampires'));
  it.each(['', '   ', '\n\t'])('rejects empty input %j', (raw) => expect(cleanDeckName(raw)).toBeNull());
  it('limits the length', () => expect(cleanDeckName('x'.repeat(200))).toHaveLength(80));
  it('keeps text that looks like markup as plain text', () => expect(cleanDeckName('<b>hi</b>')).toBe('<b>hi</b>'));
});

describe('backTarget', () => {
  it('goes home from a deck, a shared deck and the other screens', () => {
    for (const r of ['#/deck/abc', '/deck/abc', '#d=xyz', '/paste', '#/new']) expect(backTarget(r)).toBe('#/');
  });
  it('leaves the app from home', () => {
    for (const r of ['', '#', '/', '#/']) expect(backTarget(r)).toBeNull();
  });
});
