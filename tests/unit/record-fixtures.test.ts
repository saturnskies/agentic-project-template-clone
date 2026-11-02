import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDeckList } from '../../src/lib/parse';
import { createClient, memoryCache } from '../../src/scryfall/client';
import { autocompleteNames, cardByName, searchCommanders } from '../../src/scryfall/cards';
import { buildDeck, commanderCandidates, oracleIdOf, priceDeck, priceEntries, resolveList } from '../../src/scryfall/resolve';
import { requestKey, trim, type FixtureMap } from '../support/fixtures';

/**
 * Re-records tests/fixtures/scryfall-e2e.json from the real Scryfall API by running the same flow the
 * paste screen runs on tests/fixtures/e2e-list.txt. Run: RECORD=1 npx vitest run tests/unit/record-fixtures.test.ts
 */
describe.runIf(process.env.RECORD === '1')('record Scryfall fixtures', () => {
  it('records the paste-and-price flow', async () => {
    const map: FixtureMap = {};
    const recording: typeof fetch = async (input, init) => {
      const headers = { ...Object.fromEntries(new Headers(init?.headers)), 'User-Agent': 'Swapsmith-fixture-recorder/0.1' };
      const res = await fetch(input, { ...init, headers });
      const body = await res.clone().json();
      map[requestKey(init?.method ?? 'GET', String(input), init?.body as string | undefined)] = { status: res.status, body: trim(body) };
      return res;
    };
    const client = createClient({ fetch: recording, cache: memoryCache() });

    const { entries } = parseDeckList(readFileSync(new URL('../fixtures/e2e-list.txt', import.meta.url), 'utf8'));
    const resolved = await resolveList(client, entries);
    // As the user would: accept each suggestion, remove lines with none.
    const lines = resolved.flatMap((r) => (r.card ? [{ entry: r.entry, card: r.card }] : r.suggestion ? [{ entry: r.entry, card: r.suggestion }] : []));
    const [commander] = commanderCandidates(lines);
    await priceDeck(client, buildDeck('E2E', lines, commander));

    writeFileSync(new URL('../fixtures/scryfall-e2e.json', import.meta.url), JSON.stringify(map, null, 1) + '\n');
    expect(Object.keys(map).length).toBeGreaterThan(5);
  }, 120_000);

  it('records the new-deck flow: commander search, add by name, reload', async () => {
    const map: FixtureMap = {};
    const recording: typeof fetch = async (input, init) => {
      const headers = { ...Object.fromEntries(new Headers(init?.headers)), 'User-Agent': 'Swapsmith-fixture-recorder/0.1' };
      const res = await fetch(input, { ...init, headers });
      map[requestKey(init?.method ?? 'GET', String(input), init?.body as string | undefined)] = { status: res.status, body: trim(await res.clone().json()) };
      return res;
    };
    const client = createClient({ fetch: recording, cache: memoryCache() });

    // Same calls, in the same order, as tests/e2e/new-deck.spec.ts makes through the UI.
    const [edgar] = await searchCommanders(client, 'edgar');
    const deck = buildDeck('Fresh Edgar', [], edgar);
    await priceDeck(client, deck);
    for (const [typed, name] of [['sol r', 'Sol Ring'], ['llanowar', 'Llanowar Elves']]) {
      await autocompleteNames(client, typed);
      const card = (await cardByName(client, name))!;
      const id = oracleIdOf(card);
      await priceEntries(client, [{ entry: { card: { oracleId: id, name: card.name }, qty: 1 }, isCommander: false }], undefined, new Map([[id, card]]));
      if (name === 'Sol Ring') deck.cards.push({ card: { oracleId: id, name: card.name }, qty: 1 });
    }
    await priceDeck(client, deck); // the reload after Llanowar Elves is removed

    writeFileSync(new URL('../fixtures/scryfall-new-deck.json', import.meta.url), JSON.stringify(map, null, 1) + '\n');
    expect(Object.keys(map).length).toBeGreaterThan(5);
  }, 120_000);

  it('records lookups for the full Edgar Markov list', async () => {
    const map: FixtureMap = {};
    const recording: typeof fetch = async (input, init) => {
      const headers = { ...Object.fromEntries(new Headers(init?.headers)), 'User-Agent': 'Swapsmith-fixture-recorder/0.1' };
      const res = await fetch(input, { ...init, headers });
      map[requestKey(init?.method ?? 'GET', String(input), init?.body as string | undefined)] = { status: res.status, body: trim(await res.clone().json()) };
      return res;
    };
    const client = createClient({ fetch: recording, cache: memoryCache() });
    await resolveList(client, parseDeckList(readFileSync(new URL('../fixtures/edgar-list.txt', import.meta.url), 'utf8')).entries);
    writeFileSync(new URL('../fixtures/scryfall-edgar-resolve.json', import.meta.url), JSON.stringify(map, null, 1) + '\n');
    expect(Object.keys(map).length).toBeGreaterThan(2);
  }, 120_000);
});
