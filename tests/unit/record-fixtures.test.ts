import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDeckList } from '../../src/lib/parse';
import { createClient, memoryCache } from '../../src/scryfall/client';
import { autocompleteNames, cardByName, searchCommanders } from '../../src/scryfall/cards';
import { buildDeck, commanderCandidates, oracleIdOf, priceDeck, priceEntries, resolveList } from '../../src/scryfall/resolve';
import { fuzzyCard } from '../../src/scryfall/cards';
import { deckProfile } from '../../src/lib/profile';
import { scoreSuggestions, upgradesByTier } from '../../src/lib/suggest';
import { candidatePool, deckCardFacts, rulesText } from '../../src/scryfall/suggest';
import { deckRoles } from '../../src/scryfall/roles';
import { cheaperReplacements, swapPairs } from '../../src/lib/swaps';
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

  it('records the full Edgar deck, priced, with its upgrade searches', async () => {
    const map: FixtureMap = {};
    const recording: typeof fetch = async (input, init) => {
      const headers = { ...Object.fromEntries(new Headers(init?.headers)), 'User-Agent': 'Swapsmith-fixture-recorder/0.1' };
      const res = await fetch(input, { ...init, headers });
      map[requestKey(init?.method ?? 'GET', String(input), init?.body as string | undefined)] = { status: res.status, body: trim(await res.clone().json()) };
      return res;
    };
    const resolver = createClient({ cache: memoryCache(), fetch: (i, init) => fetch(i, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), 'User-Agent': 'Swapsmith-fixture-recorder/0.1' } }) });
    const client = createClient({ fetch: recording, cache: memoryCache() });

    // Build the deck as a user would (accept every suggestion, look up Immersturm Predator) without recording it:
    // e2e tests start from this saved deck.
    const resolved = await resolveList(resolver, parseDeckList(readFileSync(new URL('../fixtures/edgar-list.txt', import.meta.url), 'utf8')).entries);
    const immersturm = (await fuzzyCard(resolver, 'Immersturm Predator'))!;
    const lines = resolved.map((r) => ({ entry: r.entry, card: r.card ?? r.suggestion ?? immersturm }));
    const deck = { ...buildDeck('Edgar Vampires', lines, commanderCandidates(lines)[0], new Date('2026-11-02T00:00:00Z')), id: 'edgarfull' };
    writeFileSync(new URL('../fixtures/edgar-deck.json', import.meta.url), JSON.stringify(deck, null, 1) + '\n');

    // What the deck page does: price it, then Find suggestions, then
    // add the top Budget pick, apply the first swap, and take the first cheaper replacement. (Same
    // requests as the panel: the pool, then the deck's roles.)
    const priced = await priceDeck(client, deck);
    const commander = priced.find((p) => p.isCommander)!.card!;
    const profile = deckProfile(priced.map((p) => ({ name: p.entry.card.name, typeLine: p.typeLine, oracleText: rulesText(p.card), isCommander: p.isCommander })), commander.color_identity);
    const { pool } = await candidatePool(client, profile);
    const { roles } = await deckRoles(client, priced.filter((c) => !c.isCommander).map((c) => ({ oracleId: c.entry.card.oracleId, name: c.entry.card.name })));
    const scored = scoreSuggestions(pool, { colorIdentity: profile.colorIdentity, oracleIds: new Set(priced.map((p) => p.entry.card.oracleId)) }, new Set());
    const tiers = upgradesByTier(scored, 10);
    const facts = deckCardFacts(priced, roles, pool, { owned: [], unownedBasics: [] });
    const firstSwap = swapPairs(scored, facts, profile)[0].add.card;
    const firstCheaper = cheaperReplacements(facts, scored)[0].options[0].add.card;
    for (const card of [tiers.budget[0].card, firstSwap, firstCheaper]) {
      await priceEntries(client, [{ entry: { card: { oracleId: oracleIdOf(card), name: card.name }, qty: 1 }, isCommander: false }], undefined, new Map([[oracleIdOf(card), card]]));
    }

    // Suggestion results are only scored and shown, never read for rules text: drop it to keep the fixture small.
    for (const [key, rec] of Object.entries(map)) {
      if (!key.includes('prefer%3Ausd-low')) continue;
      for (const c of (rec.body as { data?: Array<Record<string, unknown>> }).data ?? []) {
        delete c.oracle_text;
        for (const f of (c.card_faces as Array<Record<string, unknown>> | undefined) ?? []) delete f.oracle_text;
      }
    }
    writeFileSync(new URL('../fixtures/scryfall-edgar-full.json', import.meta.url), JSON.stringify(map) + '\n');
    expect(tiers.budget.length).toBeGreaterThan(0);
  }, 300_000);

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
