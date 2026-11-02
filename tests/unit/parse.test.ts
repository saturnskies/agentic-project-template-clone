import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDeckList } from '../../src/lib/parse';

describe('parseDeckList', () => {
  it('parses the full Edgar Markov list: 78 entries, 100 cards', () => {
    const text = readFileSync(new URL('../fixtures/edgar-list.txt', import.meta.url), 'utf8');
    const { entries, errors } = parseDeckList(text);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(78);
    expect(entries.reduce((n, e) => n + e.qty, 0)).toBe(100);
    expect(entries[1]).toMatchObject({ qty: 1, name: 'Bloodline Keeper // Lord of Lineage' });
    expect(entries.at(-1)).toMatchObject({ qty: 9, name: 'Plains' });
  });

  it('accepts "1 Name", "1x Name", "1X Name" and a bare "Name" as qty 1', () => {
    const { entries } = parseDeckList('1 Sol Ring\n2x Swamp\n3X Plains\nArcane Signet');
    expect(entries.map((e) => [e.qty, e.name])).toEqual([
      [1, 'Sol Ring'], [2, 'Swamp'], [3, 'Plains'], [1, 'Arcane Signet'],
    ]);
  });

  it('reads a pinned printing from "(SET) number" and lowercases the set code', () => {
    const { entries } = parseDeckList('1 Edgar Markov (INR) 428\n1 Sol Ring (C21)');
    expect(entries[0]).toMatchObject({ name: 'Edgar Markov', set: 'inr', number: '428' });
    expect(entries[1]).toMatchObject({ name: 'Sol Ring', set: 'c21' });
    expect(entries[1].number).toBeUndefined();
  });

  it('strips export markers like *F* and *E* after the printing', () => {
    const { entries } = parseDeckList('1 Sol Ring (C21) 263 *F*');
    expect(entries[0]).toMatchObject({ name: 'Sol Ring', set: 'c21', number: '263' });
  });

  it('marks cards under a Commander header, and *CMDR* lines, as the commander', () => {
    const a = parseDeckList('Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring');
    expect(a.entries.map((e) => [e.name, e.isCommander])).toEqual([['Edgar Markov', true], ['Sol Ring', false]]);

    const b = parseDeckList('1 Sol Ring\n1 Edgar Markov *CMDR*');
    expect(b.entries[1]).toMatchObject({ name: 'Edgar Markov', isCommander: true });
  });

  it('ignores blank lines, comments and headers, with or without colons and counts', () => {
    const { entries, errors } = parseDeckList('// my deck\n# notes\nCreatures (31)\nMainboard:\n\n1 Sol Ring\n');
    expect(errors).toEqual([]);
    expect(entries.map((e) => e.name)).toEqual(['Sol Ring']);
  });

  it('leaves out sideboard and maybeboard cards, which are not part of a Commander deck', () => {
    const { entries } = parseDeckList('1 Sol Ring\nSideboard\n1 Swamp\nMaybeboard:\n1 Plains\nDeck\n1 Arcane Signet');
    expect(entries.map((e) => e.name)).toEqual(['Sol Ring', 'Arcane Signet']);
  });

  it('collapses extra spaces and keeps the original line number', () => {
    const { entries } = parseDeckList('\n  1   Vampire    Nighthawk  ');
    expect(entries[0]).toMatchObject({ name: 'Vampire Nighthawk', line: 2 });
  });

  it('reports a zero or huge quantity as an error instead of an entry', () => {
    const { entries, errors } = parseDeckList('0 Sol Ring\n1000 Swamp\n1 Plains');
    expect(entries.map((e) => e.name)).toEqual(['Plains']);
    expect(errors).toEqual([
      { line: 1, text: '0 Sol Ring', reason: 'Quantity must be between 1 and 999' },
      { line: 2, text: '1000 Swamp', reason: 'Quantity must be between 1 and 999' },
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseDeckList('   \n\n')).toEqual({ entries: [], errors: [] });
  });
});
