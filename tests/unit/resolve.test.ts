import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deckTotals } from '../../src/lib/deck';
import { parseDeckList } from '../../src/lib/parse';
import { createClient, memoryCache } from '../../src/scryfall/client';
import { buildDeck, commanderCandidates, priceDeck, resolveList } from '../../src/scryfall/resolve';
import type { ScryCard } from '../../src/scryfall/types';
import { fixtureFetch, type FixtureMap } from '../support/fixtures';

// Real Scryfall replies recorded 2026-11-02 for tests/fixtures/e2e-list.txt (see record-fixtures.test.ts).
const map: FixtureMap = JSON.parse(readFileSync(new URL('../fixtures/scryfall-e2e.json', import.meta.url), 'utf8'));
const list = readFileSync(new URL('../fixtures/e2e-list.txt', import.meta.url), 'utf8');

function setup() {
  const fetch = fixtureFetch(map);
  return { fetch, client: createClient({ fetch, cache: memoryCache(), spacingMs: 0 }) };
}

async function resolvedLines() {
  const { client, fetch } = setup();
  const resolved = await resolveList(client, parseDeckList(list).entries);
  const lines = resolved.flatMap((r) => (r.card ? [{ entry: r.entry, card: r.card }] : r.suggestion ? [{ entry: r.entry, card: r.suggestion }] : []));
  return { client, fetch, resolved, lines };
}

describe('resolveList', () => {
  it('matches a double-faced card by its full "A // B" name', async () => {
    const { resolved } = await resolvedLines();
    expect(resolved[1].card?.name).toBe('Bloodline Keeper // Lord of Lineage');
  });

  it('offers Scryfall\'s "did you mean" for a typo, and nothing when no card is close', async () => {
    const { resolved, fetch } = await resolvedLines();
    expect(resolved[2]).toMatchObject({ card: null, suggestion: { name: 'Kalastria Highborn' } });
    expect(resolved[3]).toMatchObject({ card: null, suggestion: null });
    expect(fetch.misses).toEqual([]);
  });
});

describe('resolveList on the full Edgar Markov list (real replies)', () => {
  const edgarMap: FixtureMap = JSON.parse(readFileSync(new URL('../fixtures/scryfall-edgar-resolve.json', import.meta.url), 'utf8'));
  const edgarList = readFileSync(new URL('../fixtures/edgar-list.txt', import.meta.url), 'utf8');

  async function resolveEdgar() {
    const fetch = fixtureFetch(edgarMap);
    const resolved = await resolveList(createClient({ fetch, cache: memoryCache(), spacingMs: 0 }), parseDeckList(edgarList).entries);
    return { fetch, resolved, byName: (n: string) => resolved.find((r) => r.entry.name === n)! };
  }

  it('asks only about the real typos, each with the right suggestion', async () => {
    const { resolved, fetch } = await resolveEdgar();
    const open = resolved.filter((r) => !r.card).map((r) => [r.entry.name, r.suggestion?.name ?? null]);
    expect(open).toEqual([
      ['Calastria Highborn', 'Kalastria Highborn'],
      ['Chiral Attentive First Year', 'Kirol, Attentive First-Year'],
      ['Emmerstorm Predator', null],
      ['Sanguine Siphoner', 'Sanguine Syphoner'],
    ]);
    expect(fetch.misses).toEqual([]);
  });

  it('accepts spellings that differ only in spaces or punctuation', async () => {
    const { byName } = await resolveEdgar();
    expect(byName('Stromkirk Blood-Thief').card?.name).toBe('Stromkirk Bloodthief');
    expect(byName('Null Priest of Oblivion').card?.name).toBe('Nullpriest of Oblivion');
    expect(byName("Moogle's Valor").card?.name).toBe("Moogles' Valor");
  });

  it('gets the real Sign in Blood, not Scheming Silvertongue // Sign in Blood', async () => {
    const { byName } = await resolveEdgar();
    expect(byName('Sign in Blood').card?.name).toBe('Sign in Blood');
    expect(byName('Scheming Silvertongue').card?.name).toBe('Scheming Silvertongue // Sign in Blood');
  });

  it('matches alternate printed names and says which card they are', async () => {
    const { byName } = await resolveEdgar();
    expect(byName('Panther Idol')).toMatchObject({ card: { name: "Mind's Eye" }, aliasOf: "Mind's Eye" });
    expect(byName('Dracula, Blood Immortal')).toMatchObject({ card: { name: 'Falkenrath Forebear' }, aliasOf: 'Falkenrath Forebear' });
    expect(byName('Edgar Markov').aliasOf).toBeUndefined();
  });
});

describe('commanderCandidates and buildDeck', () => {
  it('finds Edgar Markov as the only legendary creature, and keeps him out of the 99', async () => {
    const { lines } = await resolvedLines();
    const candidates = commanderCandidates(lines);
    expect(candidates.map((c) => c.name)).toEqual(['Edgar Markov']);

    const deck = buildDeck('', lines, candidates[0]);
    expect(deck.name).toBe('Edgar Markov deck');
    expect(deck.commander.name).toBe('Edgar Markov');
    expect(deck.cards.map((e) => [e.card.name, e.qty])).toEqual([
      ['Bloodline Keeper // Lord of Lineage', 1], ['Kalastria Highborn', 1], ['Sol Ring', 1], ['Vampire Nighthawk', 1], ['Swamp', 8],
    ]);
  });

  it('prefers lines marked as commander over other legends', () => {
    const legend = (name: string) => ({ id: name, oracle_id: name, name, type_line: 'Legendary Creature — Vampire' }) as ScryCard;
    const lines = [
      { entry: { qty: 1, name: 'A', isCommander: false, line: 1 }, card: legend('A') },
      { entry: { qty: 1, name: 'B', isCommander: true, line: 2 }, card: legend('B') },
    ];
    expect(commanderCandidates(lines).map((c) => c.name)).toEqual(['B']);
  });
});

describe('priceDeck', () => {
  it('prices each card at its cheapest printing, foil included, with direct TCGplayer links', async () => {
    const { client, lines, fetch } = await resolvedLines();
    const progress: Array<[number, number]> = [];
    const priced = await priceDeck(client, buildDeck('E2E', lines, commanderCandidates(lines)[0]), (d, t) => progress.push([d, t]));

    expect(priced.map((p) => [p.entry.card.name, p.card?.set, p.card?.collector_number, p.price, p.finish])).toEqual([
      ['Edgar Markov', 'inr', '428', 29.08, 'nonfoil'],
      ['Bloodline Keeper // Lord of Lineage', 'inr', '327', 4.88, 'foil'],
      ['Kalastria Highborn', 'fdn', '607', 0.25, 'nonfoil'],
      ['Sol Ring', 'fic', '357', 1.1, 'nonfoil'],
      ['Vampire Nighthawk', 'c13', '97', 0.16, 'nonfoil'],
      ['Swamp', 'ddq', '74', 0.11, 'nonfoil'],
    ]);
    expect(priced[0]).toMatchObject({ isCommander: true, url: 'https://www.tcgplayer.com/product/596294' });
    expect(deckTotals(priced.map((p) => ({ qty: p.entry.qty, price: p.price })))).toEqual({ total: 36.35, unpriced: 0, count: 13 });
    expect(progress[0]).toEqual([0, 6]);
    expect(progress.at(-1)).toEqual([6, 6]);
    expect(fetch.misses).toEqual([]);
  });

  it('still prices the rest of the deck when a batch of printings fails to load', async () => {
    const { lines } = await resolvedLines();
    const deck = buildDeck('E2E', lines, commanderCandidates(lines)[0]);
    const recorded = fixtureFetch(map);
    // The shared search for the non-basic cards (an OR query) fails; the Swamp's own search still works.
    const broken: typeof fetch = async (input, init) => {
      if (String(input).includes('+or+')) throw new TypeError('Failed to fetch');
      return recorded(input, init);
    };
    const priced = await priceDeck(createClient({ fetch: broken, cache: memoryCache(), spacingMs: 0, sleep: async () => {} }), deck);

    const sol = priced.find((p) => p.entry.card.name === 'Sol Ring')!;
    expect(sol).toMatchObject({ failed: true, price: null, card: { name: 'Sol Ring' } });
    expect(priced.find((p) => p.entry.card.name === 'Swamp')).toMatchObject({ price: 0.11 });
    expect(priced.filter((p) => p.failed)).toHaveLength(5);
  });

  it('needs only a handful of requests for a deck', async () => {
    const { lines } = await resolvedLines();
    const recorded = fixtureFetch(map);
    const calls: string[] = [];
    const counting: typeof fetch = async (input, init) => {
      calls.push(String(input));
      return recorded(input, init);
    };
    await priceDeck(createClient({ fetch: counting, cache: memoryCache(), spacingMs: 0 }), buildDeck('E2E', lines, commanderCandidates(lines)[0]));
    // 1 collection + 1 shared search for the 5 non-basic cards + 2 for the Swamp (more than a page of printings).
    expect(calls).toHaveLength(4);
    expect(recorded.misses).toEqual([]);
  });

  it('keeps a card with no Scryfall match in the list, unpriced', async () => {
    const edgarId = '41e2790d-49f5-4e98-b8d9-04179f47f13a';
    const deck = buildDeck('X', [], { id: 'e', oracle_id: edgarId, name: 'Edgar Markov' } as ScryCard);
    deck.cards = [{ card: { oracleId: 'gone', name: 'Vanished Card' }, qty: 1 }];

    // This deck makes requests the fixture lacks, so build their replies from recorded data.
    const recordedCards = Object.values(map).flatMap((r) => (r.body as { data?: ScryCard[] }).data ?? []);
    const edgarPrints = recordedCards.filter((c) => c.oracle_id === edgarId);
    const extra: FixtureMap = {
      [`POST /cards/collection ${JSON.stringify({ identifiers: [{ oracle_id: edgarId }, { oracle_id: 'gone' }] })}`]: {
        status: 200,
        body: { object: 'list', not_found: [{ oracle_id: 'gone' }], data: edgarPrints.slice(0, 1) },
      },
      [`GET /cards/search?${new URLSearchParams({ q: `(oracleid:${edgarId}) game:paper -st:memorabilia -is:oversized -border:gold`, unique: 'prints', order: 'usd', dir: 'asc' })}`]: {
        status: 200,
        body: { object: 'list', has_more: false, data: edgarPrints },
      },
    };
    const fetch = fixtureFetch({ ...map, ...extra });

    const priced = await priceDeck(createClient({ fetch, cache: memoryCache(), spacingMs: 0 }), deck);
    expect(fetch.misses).toEqual([]);
    expect(priced[0]).toMatchObject({ price: 29.08 });
    expect(priced[1]).toMatchObject({ card: null, price: null, url: null });
    expect(deckTotals(priced.map((p) => ({ qty: p.entry.qty, price: p.price })))).toMatchObject({ unpriced: 1 });
  });
});
