import { describe, expect, it } from 'vitest';
import { buildQuery, MAX_QUERY, sortParams, SORTS, type Filters } from '../../src/lib/browse';

const base: Filters = { name: '', commanderLegal: true, advanced: '' };
const ok = (f: Partial<Filters>) => {
  const r = buildQuery({ ...base, ...f });
  if (!r.ok) throw new Error(`expected a query, got: ${r.error}`);
  return r.q;
};
const err = (f: Partial<Filters>) => {
  const r = buildQuery({ ...base, ...f });
  if (r.ok) throw new Error(`expected an error, got: ${r.q}`);
  return r;
};

describe('buildQuery', () => {
  it('searches Commander-legal cards when nothing else is set', () => {
    expect(ok({})).toBe('legal:commander');
  });

  it('drops the legality term when the toggle is off, and needs some other term then', () => {
    expect(ok({ commanderLegal: false, name: 'sol' })).toBe('name:"sol"');
    expect(err({ commanderLegal: false }).error).toMatch(/at least one/i);
  });

  it('matches every typed word in the name, in any order', () => {
    expect(ok({ name: '  mana   crypt ' })).toBe('legal:commander name:"mana" name:"crypt"');
  });

  it('escapes quotes and backslashes so user text cannot end the quoted word', () => {
    expect(ok({ name: 'a"b c\\d' })).toBe('legal:commander name:"a\\"b" name:"c\\\\d"');
  });

  it('ANDs the advanced box, wrapped so an "or" inside cannot escape the other filters', () => {
    expect(ok({ advanced: 't:elf or t:goblin' })).toBe('legal:commander (t:elf or t:goblin)');
    expect(ok({ name: 'x', advanced: '  ' })).toBe('legal:commander name:"x"');
  });

  it('refuses unbalanced parentheses in the advanced box instead of letting them escape the wrapper', () => {
    for (const bad of ['a) or (b', '(a', 'a)', 't:elf) or (t:goblin']) {
      const r = err({ advanced: bad });
      expect(r.field).toBe('advanced');
      expect(r.error).toMatch(/parenthes/i);
    }
  });

  it('does not count parentheses inside quotes or regex text', () => {
    expect(ok({ advanced: 'o:"draw (a) card"' })).toBe('legal:commander (o:"draw (a) card")');
    expect(ok({ advanced: 'o:/create (a|an) token/' })).toBe('legal:commander (o:/create (a|an) token/)');
  });

  it('never sends more than the limit: 900 characters pass, 901 do not (Scryfall silently truncates past ~1,000)', () => {
    const head = 'legal:commander (';
    const fill = (n: number) => 't:' + 'a'.repeat(n - 2);
    const fits = fill(MAX_QUERY - head.length - 1);
    expect(ok({ advanced: fits })).toHaveLength(MAX_QUERY);
    const r = err({ advanced: fits + 'a' });
    expect(r.field).toBe('advanced');
    expect(r.error).toMatch(/too long/i);
  });

  it('names the whole form, not the advanced box, when the advanced box is empty and the query is too long', () => {
    expect(err({ name: Array(200).fill('abcd').join(' ') }).field).toBe('form');
  });
});

describe('sortParams', () => {
  it('maps each sort to a Scryfall order with its natural direction', () => {
    const by = (id: string) => SORTS.find((s) => s.id === id)!;
    expect(sortParams('popularity', by('popularity').descending)).toEqual({ order: 'edhrec', dir: 'asc' });
    expect(sortParams('price', by('price').descending)).toEqual({ order: 'usd', dir: 'desc' });
    expect(sortParams('name', by('name').descending)).toEqual({ order: 'name', dir: 'asc' });
    expect(sortParams('mana', by('mana').descending)).toEqual({ order: 'cmc', dir: 'asc' });
    expect(sortParams('released', by('released').descending)).toEqual({ order: 'released', dir: 'desc' });
  });

  it('flips the direction when asked', () => {
    expect(sortParams('price', false)).toEqual({ order: 'usd', dir: 'asc' });
    expect(sortParams('name', true)).toEqual({ order: 'name', dir: 'desc' });
  });
});
