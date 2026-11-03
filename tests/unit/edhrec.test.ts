import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRACKETS, categoryFor, commanderSlug, estimateBracket, pagePath, parsePage, type EdhPage } from '../../src/lib/edhrec';
import type { FixtureMap } from '../support/fixtures';

// Real EDHREC replies recorded 2026-11-03 by tests/unit/record-fixtures.test.ts (RECORD=1).
const recorded: FixtureMap = JSON.parse(readFileSync(new URL('../fixtures/edhrec-edgar.json', import.meta.url), 'utf8'));
const body = (slug: string) => recorded[`GET https://json.edhrec.com/pages/commanders/${slug}.json`].body;
const edgar = (() => {
  const parsed = parsePage(body('edgar-markov'));
  if (parsed?.kind !== 'page') throw new Error('fixture is not a page');
  return parsed.page;
})();
const card = (page: EdhPage, name: string) => page.cards.find((c) => c.name === name);

describe('commanderSlug', () => {
  // Each slug below answered 200 from json.edhrec.com on 2026-11-03.
  it.each([
    [['Edgar Markov'], 'edgar-markov'],
    [["Atraxa, Praetors' Voice"], 'atraxa-praetors-voice'],
    [['Lim-Dûl the Necromancer'], 'lim-dul-the-necromancer'],
    [['Sméagol, Helpful Guide'], 'smeagol-helpful-guide'],
    [['Kongming, "Sleeping Dragon"'], 'kongming-sleeping-dragon'],
    [['Esika, God of the Tree // The Prismatic Bridge'], 'esika-god-of-the-tree'],
    [['Tymna the Weaver', 'Thrasios, Triton Hero'], 'thrasios-triton-hero-tymna-the-weaver'],
    [['Silas Renn, Seeker Adept', 'Rograkh, Son of Rohgahh'], 'rograkh-son-of-rohgahh-silas-renn-seeker-adept'],
  ])('%j → %s', (names, slug) => {
    expect(commanderSlug(names)).toBe(slug);
  });
});

describe('parsePage', () => {
  it('reads the deck count, themes and average type counts from a real page', () => {
    expect(edgar.numDecks).toBeGreaterThan(50_000);
    expect(edgar.themes.map((t) => t.label)).toContain('Vampires');
    expect(edgar.themes.every((t) => /^[a-z0-9-]+$/.test(t.slug) && t.count > 0)).toBe(true);
    expect(edgar.typeCounts.Land).toBeGreaterThan(30);
    expect(edgar.typeCounts.Artifact).toBeGreaterThan(0);
  });

  it('lists each card once, with inclusion and synergy, under its EDHREC type list', () => {
    const names = edgar.cards.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(card(edgar, 'Skullclamp')).toMatchObject({ category: 'Utility Artifacts' });
    expect(card(edgar, 'Exquisite Blood')).toMatchObject({ category: 'Enchantments' });
    expect(card(edgar, 'Sol Ring')).toMatchObject({ category: 'Mana Artifacts' });
    for (const c of edgar.cards) {
      expect(c.inclusion).toBeGreaterThanOrEqual(0);
      expect(c.inclusion).toBeLessThanOrEqual(1);
      expect(Math.abs(c.synergy)).toBeLessThanOrEqual(1);
    }
  });

  it('takes the type list a card is in when it first appeared in a mixed list such as Top Cards', () => {
    const top = { container: { json_dict: { cardlists: [
      { tag: 'topcards', cardviews: [{ name: 'Blood Artist', num_decks: 8, potential_decks: 10, synergy: 0.6 }] },
      { tag: 'creatures', cardviews: [{ name: 'Blood Artist', num_decks: 8, potential_decks: 10, synergy: 0.6 }] },
      { tag: 'newcards', cardviews: [{ name: 'Brand New', num_decks: 1, potential_decks: 10, synergy: 0.1 }] },
    ] } } };
    const parsed = parsePage(top);
    expect(parsed).toEqual({ kind: 'page', page: { numDecks: 10, cards: [
      { name: 'Blood Artist', category: 'Creatures', inclusion: 0.8, synergy: 0.6 },
      { name: 'Brand New', category: null, inclusion: 0.1, synergy: 0.1 },
    ], themes: [], typeCounts: {}, bracketCounts: {} } });
  });

  it('returns the redirect EDHREC sends for a partner pair named in the other order', () => {
    expect(parsePage(body('tymna-the-weaver-thrasios-triton-hero'))).toEqual({ kind: 'redirect', path: '/commanders/thrasios-triton-hero-tymna-the-weaver' });
  });

  it.each([
    ['an absolute URL', 'https://example.com/commanders/x'],
    ['a path outside /commanders', '/cards/sol-ring'],
    ['a path with dots', '/commanders/../admin'],
    ['a path with a query', '/commanders/x?y=1'],
  ])('refuses a redirect to %s', (_, redirect) => {
    expect(parsePage({ redirect })).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', '<html>'],
    ['an array', []],
    ['no container', { header: 'x' }],
    ['no cardlists', { container: { json_dict: {} } }],
    ['cardlists that is not a list', { container: { json_dict: { cardlists: {} } } }],
    ['only empty lists', { container: { json_dict: { cardlists: [{ tag: 'creatures', cardviews: [] }] } } }],
  ])('returns null for %s', (_, json) => {
    expect(parsePage(json)).toBeNull();
  });

  it('skips cards with a missing or odd field and keeps the rest', () => {
    const views = [
      { name: 'Good', num_decks: 5, potential_decks: 10, synergy: 0.2 },
      { name: 'No synergy', num_decks: 5, potential_decks: 10 },
      { name: 'Zero sample', num_decks: 0, potential_decks: 0, synergy: 0 },
      { name: '', num_decks: 5, potential_decks: 10, synergy: 0 },
      { name: 'Text count', num_decks: '5', potential_decks: 10, synergy: 0 },
      null,
    ];
    const parsed = parsePage({ container: { json_dict: { cardlists: [{ tag: 'creatures', cardviews: views }] } } });
    expect(parsed?.kind === 'page' && parsed.page.cards.map((c) => c.name)).toEqual(['Good']);
  });

  it('keeps inclusion and synergy in range when EDHREC sends odd numbers', () => {
    const parsed = parsePage({ container: { json_dict: { cardlists: [{ tag: 'lands', cardviews: [{ name: 'Odd', num_decks: 12, potential_decks: 10, synergy: 3 }] }] } } });
    expect(parsed?.kind === 'page' && parsed.page.cards[0]).toMatchObject({ inclusion: 1, synergy: 1 });
  });

  it('drops themes whose slug could change the page address', () => {
    const parsed = parsePage({
      container: { json_dict: { cardlists: [{ tag: 'lands', cardviews: [{ name: 'A', num_decks: 1, potential_decks: 2, synergy: 0 }] }] } },
      panels: { taglinks: [{ slug: 'tokens', value: 'Tokens', count: 9 }, { slug: '../x', value: 'Bad', count: 9 }, { slug: 'no-count', value: 'No count' }] },
    });
    expect(parsed?.kind === 'page' && parsed.page.themes).toEqual([{ slug: 'tokens', label: 'Tokens', count: 9 }]);
  });
});

describe('categoryFor', () => {
  it.each([
    ['Mana Artifacts', 'Artifact', 'Mana Artifacts'],
    [null, 'Artifact Creature — Golem', 'Creatures'],
    [null, 'Legendary Artifact', 'Utility Artifacts'],
    [null, 'Enchantment — Aura', 'Enchantments'],
    [null, 'Kindred Instant — Vampire', 'Instants'],
    [null, 'Sorcery', 'Sorceries'],
    [null, 'Legendary Planeswalker — Sorin', 'Planeswalkers'],
    [null, 'Battle — Siege', 'Battles'],
    [null, 'Land', 'Lands'],
    [null, 'Enchantment Creature — God', 'Creatures'],
    [null, 'Sorcery // Land', 'Sorceries'],
  ])('EDHREC %s, type %s → %s', (edh, typeLine, want) => {
    expect(categoryFor(edh, typeLine)).toBe(want);
  });
});

describe('pagePath', () => {
  // Each combination answered from json.edhrec.com on 2026-11-03 (core/vampires/budget: 8 decks).
  it.each([
    [{ bracket: null, theme: null, budget: false }, '/commanders/edgar-markov'],
    [{ bracket: 2, theme: null, budget: false }, '/commanders/edgar-markov/core'],
    [{ bracket: 5, theme: null, budget: false }, '/commanders/edgar-markov/cedh'],
    [{ bracket: null, theme: 'vampires', budget: false }, '/commanders/edgar-markov/vampires'],
    [{ bracket: null, theme: null, budget: true }, '/commanders/edgar-markov/budget'],
    [{ bracket: 2, theme: 'vampires', budget: true }, '/commanders/edgar-markov/core/vampires/budget'],
  ])('%j → %s', (filter, path) => {
    expect(pagePath('edgar-markov', filter)).toBe(path);
  });

  it('ignores a theme slug that could change the address', () => {
    expect(pagePath('edgar-markov', { bracket: null, theme: '../cards', budget: false })).toBe('/commanders/edgar-markov');
  });
});

describe('estimateBracket', () => {
  it.each([
    [0, 2],
    [1, 3],
    [3, 3],
    [4, 4],
    [12, 4],
  ])('%i Game Changers → bracket %i', (n, bracket) => {
    expect(estimateBracket(n)).toBe(bracket);
  });
});

describe('bracket counts', () => {
  it('reads decks per bracket from a real page', () => {
    expect(Object.keys(edgar.bracketCounts).sort()).toEqual(['1', '2', '3', '4', '5']);
    expect(edgar.bracketCounts[3]).toBeGreaterThan(1000);
  });

  it('keeps only brackets 1–5 with numeric counts', () => {
    const parsed = parsePage({ container: { json_dict: { cardlists: [{ tag: 'lands', cardviews: [{ name: 'A', num_decks: 1, potential_decks: 2, synergy: 0 }] }] } }, bracket_counts: { '2': 9, '7': 3, x: 1, '3': 'many' } });
    expect(parsed?.kind === 'page' && parsed.page.bracketCounts).toEqual({ 2: 9 });
  });

  it('names brackets as EDHREC does', () => {
    expect(BRACKETS.map((b) => `${b.n} ${b.label}`)).toEqual(['1 Exhibition', '2 Core', '3 Upgraded', '4 Optimized', '5 cEDH']);
  });
});
