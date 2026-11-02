import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDeckList } from '../../src/lib/parse';
import { createClient, memoryCache } from '../../src/scryfall/client';
import { buildDeck, commanderCandidates, priceDeck, resolveList } from '../../src/scryfall/resolve';
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
