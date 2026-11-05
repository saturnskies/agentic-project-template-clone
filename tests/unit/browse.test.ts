import { describe, expect, it } from 'vitest';
import { SAMPLES } from '../support/browse-samples';
import { allFormats, buildQuery, defaultFilters, defaultPrefs, legalityLabel, loadPrefs, MAX_QUERY, realOracleId, PREFS_KEY, savePrefs, sortParams, SORTS, type Filters } from '../../src/lib/browse';

const base: Filters = defaultFilters();
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

describe('buildQuery: every filter', () => {
  it('searches nothing extra by default', () => {
    expect(defaultFilters()).toMatchObject({ commanderLegal: true, colorMode: 'within', colors: [], rarities: [] });
    expect(ok({})).toBe('legal:commander');
  });

  it('builds the set, type, tribe and keyword terms, lowercased', () => {
    expect(ok({ set: ' CMR ' })).toBe('legal:commander set:cmr');
    expect(ok({ type: 'Legendary  Artifact' })).toBe('legal:commander t:legendary t:artifact');
    expect(ok({ tribe: 'Elf' })).toBe('legal:commander t:creature t:elf');
    expect(ok({ keyword: 'Flying' })).toBe('legal:commander kw:"flying"');
    expect(ok({ keyword: 'First Strike' })).toBe('legal:commander kw:"first strike"');
  });

  it('adds a role query as given', () => {
    expect(ok({ role: 'otag:ramp' })).toBe('legal:commander otag:ramp');
    expect(ok({ role: 'o:/create .* token/' })).toBe('legal:commander o:/create .* token/');
  });

  it('wraps a role query that has an "or" in it, so it cannot escape the other filters', () => {
    expect(ok({ role: '(keyword:lifelink or o:/gain .* life/)' })).toBe('legal:commander (keyword:lifelink or o:/gain .* life/)');
    expect(ok({ role: 'a or b' })).toBe('legal:commander (a or b)');
    expect(ok({ role: 'a OR b' })).toBe('legal:commander (a OR b)');
  });

  it('builds color identity three ways, in WUBRG order', () => {
    expect(ok({ colors: ['G', 'W'] })).toBe('legal:commander id<=wg');
    expect(ok({ colors: ['G', 'W'], colorMode: 'exactly' })).toBe('legal:commander id=wg');
    expect(ok({ colors: ['B', 'U', 'R'], colorMode: 'includes' })).toBe('legal:commander id>=ubr');
    expect(ok({ colors: ['C'] })).toBe('legal:commander id=c');
    expect(ok({ colors: ['C'], colorMode: 'includes' })).toBe('legal:commander id=c');
  });

  it('builds mana value ranges with either end optional, 0 and 99 allowed', () => {
    expect(ok({ mvMin: '2', mvMax: '4' })).toBe('legal:commander mv>=2 mv<=4');
    expect(ok({ mvMax: '0' })).toBe('legal:commander mv<=0');
    expect(ok({ mvMin: '99' })).toBe('legal:commander mv>=99');
    expect(ok({ mvMin: '3', mvMax: '3' })).toBe('legal:commander mv>=3 mv<=3');
  });

  it('builds rarity as one term or an or-group, ignoring unknown names', () => {
    expect(ok({ rarities: ['rare'] })).toBe('legal:commander r:r');
    expect(ok({ rarities: ['mythic', 'rare'] })).toBe('legal:commander (r:r or r:m)');
    expect(ok({ rarities: ['bogus'] })).toBe('legal:commander');
  });

  it('builds price ranges in dollars', () => {
    expect(ok({ priceMin: '1', priceMax: '5.50' })).toBe('legal:commander usd>=1 usd<=5.5');
    expect(ok({ priceMax: '0' })).toBe('legal:commander usd<=0');
    expect(ok({ priceMin: '12.34' })).toBe('legal:commander usd>=12.34');
  });

  it('puts the terms in a fixed order, the advanced box last', () => {
    expect(
      ok({ name: 'x', set: 'cmr', type: 'legendary', tribe: 'elf', keyword: 'flying', role: 'otag:ramp', colors: ['G'], mvMin: '2', mvMax: '4', rarities: ['rare'], priceMin: '1', priceMax: '5', advanced: 'is:reserved' }),
    ).toBe('legal:commander name:"x" set:cmr t:legendary t:creature t:elf kw:"flying" otag:ramp id<=g mv>=2 mv<=4 r:r usd>=1 usd<=5 (is:reserved)');
  });

  it('refuses a set code that is not 2 to 6 letters or digits', () => {
    for (const bad of ['a', 'toolong7', 'c m', 'cm-r', 'cmr)']) {
      const r = err({ set: bad });
      expect(r.field).toBe('set');
      expect(r.error).toMatch(/set code/i);
    }
    expect(ok({ set: 'ab' })).toContain('set:ab');
    expect(ok({ set: 'abc123' })).toContain('set:abc123');
  });

  it('refuses type words, a tribe or a keyword with characters that could change the search', () => {
    for (const bad of ['land"', 'a:b', 'x)', 'o:/a/']) expect(err({ type: bad }).field).toBe('type');
    for (const bad of ['elf or goblin', 'elf1', 'elf)', 'e:f']) expect(err({ tribe: bad }).field).toBe('tribe');
    for (const bad of ['fly1', 'flying)', '"x"', 'a:b', ' - ']) expect(err({ keyword: bad }).field).toBe('keyword');
    expect(ok({ tribe: 'Time-Lord' })).toContain('t:time-lord');
  });

  it('refuses colorless combined with colors', () => {
    const r = err({ colors: ['C', 'W'] });
    expect(r.field).toBe('colors');
    expect(r.error).toMatch(/colorless/i);
  });

  it('refuses mana values that are not whole numbers from 0 to 99, or a minimum above the maximum', () => {
    for (const bad of ['abc', '-1', '100', '2.5', '1e1']) {
      expect(err({ mvMin: bad }).field).toBe('mv');
      expect(err({ mvMax: bad }).field).toBe('mv');
    }
    const r = err({ mvMin: '5', mvMax: '4' });
    expect(r.field).toBe('mv');
    expect(r.error).toMatch(/minimum/i);
  });

  it('refuses prices that are not dollars with up to two decimals, or a minimum above the maximum', () => {
    for (const bad of ['abc', '-1', '1.234', '.5', '1,5', '$5']) {
      expect(err({ priceMin: bad }).field).toBe('price');
      expect(err({ priceMax: bad }).field).toBe('price');
    }
    const r = err({ priceMin: '5.01', priceMax: '5' });
    expect(r.field).toBe('price');
    expect(r.error).toMatch(/minimum/i);
    expect(ok({ priceMin: '5', priceMax: '5.00' })).toContain('usd<=5');
  });

  it('counts every filter toward the 900-character limit', () => {
    const r = err({ type: Array(120).fill('artifact').join(' '), advanced: 't:elf' });
    expect(r.error).toMatch(/too long/i);
  });

  it('still wraps the advanced box so an "or" there cannot escape the filters', () => {
    expect(ok({ set: 'cmr', advanced: 't:elf or t:goblin' })).toBe('legal:commander set:cmr (t:elf or t:goblin)');
  });
});

describe('preferences', () => {
  const memory = (initial: Record<string, string> = {}) => {
    const data = { ...initial };
    return { data, storage: { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) } as unknown as Storage };
  };

  it('starts with the grid, popularity, its natural direction and Commander-legal on', () => {
    expect(defaultPrefs()).toEqual({ version: 1, view: 'grid', sort: 'popularity', descending: false, commanderLegal: true });
    expect(loadPrefs(memory().storage)).toEqual({ prefs: defaultPrefs(), future: false });
    expect(loadPrefs(null)).toEqual({ prefs: defaultPrefs(), future: false });
  });

  it('round-trips what was saved, under its own key', () => {
    const m = memory();
    const prefs = { version: 1 as const, view: 'list' as const, sort: 'price' as const, descending: false, commanderLegal: false };
    expect(savePrefs(m.storage, prefs)).toBe(true);
    expect(Object.keys(m.data)).toEqual([PREFS_KEY]);
    expect(PREFS_KEY).toBe('swapsmith:browse');
    expect(loadPrefs(m.storage).prefs).toEqual(prefs);
  });

  it('repairs wrong shapes field by field and never throws', () => {
    const load = (raw: string) => loadPrefs(memory({ [PREFS_KEY]: raw }).storage).prefs;
    expect(load('{oops')).toEqual(defaultPrefs());
    expect(load('[]')).toEqual(defaultPrefs());
    expect(load('null')).toEqual(defaultPrefs());
    expect(load(JSON.stringify({ version: 1, view: 'table', sort: 'bogus', descending: 'yes', commanderLegal: 1 }))).toEqual(defaultPrefs());
    expect(load(JSON.stringify({ version: 1, view: 'list', sort: 'name', descending: true, commanderLegal: false }))).toEqual({ version: 1, view: 'list', sort: 'name', descending: true, commanderLegal: false });
  });

  it('flags a save from a newer version and reports defaults, so it is not overwritten', () => {
    const raw = JSON.stringify({ version: 2, view: 'list' });
    expect(loadPrefs(memory({ [PREFS_KEY]: raw }).storage)).toEqual({ prefs: defaultPrefs(), future: true });
  });

  it('reports blocked or full storage as false instead of throwing', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } } as unknown as Storage;
    expect(loadPrefs(blocked)).toEqual({ prefs: defaultPrefs(), future: false });
    expect(savePrefs(blocked, defaultPrefs())).toBe(false);
    expect(savePrefs(null, defaultPrefs())).toBe(false);
  });
});

describe('the recorded sample searches', () => {
  it.each(SAMPLES.map((x) => [x.id, x] as const))('the form builds the sample query for %s', (_id, sample) => {
    expect(ok(sample.filters)).toBe(sample.q);
  });
});

describe('legalityLabel', () => {
  it('says each Commander status in words, with a tone that is never colour alone', () => {
    expect(legalityLabel('legal')).toEqual({ text: 'Legal in Commander', tone: 'good' });
    expect(legalityLabel('not_legal')).toEqual({ text: 'Not legal in Commander', tone: 'bad' });
    expect(legalityLabel('banned')).toEqual({ text: 'Banned in Commander', tone: 'bad' });
    expect(legalityLabel('restricted')).toEqual({ text: 'Restricted in Commander', tone: 'bad' });
  });

  it('says unknown when the status is missing or not one Scryfall documents', () => {
    for (const odd of [undefined, '', 'maybe', 'LEGAL']) expect(legalityLabel(odd)).toEqual({ text: 'Commander legality unknown', tone: 'unknown' });
  });
});

describe('allFormats', () => {
  it('lists every format with a readable name and status, Commander first then A to Z', () => {
    expect(allFormats({ vintage: 'restricted', commander: 'legal', pauper_commander: 'not_legal', oldschool: 'banned' })).toEqual([
      { format: 'Commander', status: 'Legal' },
      { format: 'Old School', status: 'Banned' },
      { format: 'Pauper Commander', status: 'Not legal' },
      { format: 'Vintage', status: 'Restricted' },
    ]);
  });

  it('names the formats Scryfall spells without a separator the way people write them', () => {
    const names = allFormats({ paupercommander: 'legal', standardbrawl: 'legal', competitivebrawl: 'legal', predh: 'legal', oldschool: 'legal', premodern: 'legal', timeless: 'legal' }).map((f) => f.format);
    expect(names).toEqual(['Competitive Brawl', 'Old School', 'Pauper Commander', 'Pre-DH', 'Premodern', 'Standard Brawl', 'Timeless']);
  });

  it('skips missing values and unknown statuses instead of printing them', () => {
    expect(allFormats({ commander: 'legal', modern: undefined, pioneer: 'weird' })).toEqual([{ format: 'Commander', status: 'Legal' }]);
    expect(allFormats({})).toEqual([]);
  });
});

describe('realOracleId', () => {
  const card = (extra: object) => ({ id: 'printing-1', name: 'X', set: 's', set_name: 'S', collector_number: '1', color_identity: [], legalities: {}, finishes: [], prices: { usd: null, usd_foil: null, usd_etched: null }, ...extra });

  it('is the Oracle ID, from the card or from its first face', () => {
    expect(realOracleId(card({ oracle_id: 'o1' }))).toBe('o1');
    expect(realOracleId(card({ card_faces: [{ name: 'A', oracle_id: 'o2' }, { name: 'B' }] }))).toBe('o2');
  });

  it('is null when there is none, never the printing id, so a printing id is never taken for an Oracle ID', () => {
    expect(realOracleId(card({}))).toBeNull();
    expect(realOracleId(card({ card_faces: [{ name: 'A' }] }))).toBeNull();
    expect(realOracleId(card({ oracle_id: '' }))).toBeNull();
  });
});
