import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { autocompleteNames, cardByName, printingsForMany, searchCommanders } from '../../src/scryfall/cards';
import { createClient, memoryCache } from '../../src/scryfall/client';
import { priceEntries } from '../../src/scryfall/resolve';
import { fixtureFetch, type FixtureMap } from '../support/fixtures';
import type { ScryfallClient } from '../../src/scryfall/client';

describe('printingsForMany', () => {
  it('keeps every search under Scryfall\'s query limit and asks for each card exactly once', async () => {
    // Scryfall silently drops the end of a query longer than ~1,000 characters (checked 2026-11-02).
    const ids = Array.from({ length: 47 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const asked: string[] = [];
    const client: ScryfallClient = {
      get: async <T,>(path: string) => {
        const q = new URLSearchParams(path.split('?')[1]).get('q')!;
        expect(q.length).toBeLessThanOrEqual(900);
        asked.push(...[...q.matchAll(/oracleid:([\w-]+)/g)].map((m) => m[1]));
        return { object: 'list', has_more: false, data: [] } as T;
      },
      post: async () => { throw new Error('unused'); },
    };

    await printingsForMany(client, ids);
    expect([...asked].sort()).toEqual([...ids].sort());
  });

  it('groups returned printings by Oracle ID and follows next pages', async () => {
    const pages: Record<string, unknown> = {
      first: { object: 'list', has_more: true, next_page: 'https://api.scryfall.com/cards/search?page=2', data: [{ oracle_id: 'a', name: 'A1' }] },
      '/cards/search?page=2': { object: 'list', has_more: false, data: [{ oracle_id: 'b', name: 'B1' }, { oracle_id: 'a', name: 'A2' }] },
    };
    const client: ScryfallClient = {
      get: async <T,>(path: string) => (pages[path] ?? pages.first) as T,
      post: async () => { throw new Error('unused'); },
    };
    const out = await printingsForMany(client, ['a', 'b']);
    expect(out.get('a')!.map((c) => c.name)).toEqual(['A1', 'A2']);
    expect(out.get('b')!.map((c) => c.name)).toEqual(['B1']);
  });
});

// Real replies recorded 2026-11-02 for the new-deck flow (see record-fixtures.test.ts).
const newDeckMap: FixtureMap = JSON.parse(readFileSync(new URL('../fixtures/scryfall-new-deck.json', import.meta.url), 'utf8'));
const recorded = () => {
  const fetch = fixtureFetch(newDeckMap);
  return { fetch, client: createClient({ fetch, cache: memoryCache(), spacingMs: 0, heavySpacingMs: 0 }) };
};

describe('searchCommanders', () => {
  it('finds commanders by name, most-played first', async () => {
    const { client, fetch } = recorded();
    const found = await searchCommanders(client, 'edgar');
    expect(found[0].name).toBe('Edgar Markov');
    expect(found.length).toBeGreaterThan(1);
    expect(fetch.misses).toEqual([]);
  });

  it('asks nothing for fewer than 2 characters, and strips quotes from the typed text', async () => {
    const paths: string[] = [];
    const client = { get: async <T,>(p: string) => { paths.push(p); return { object: 'list', data: [] } as T; }, post: async () => { throw new Error('unused'); } };
    expect(await searchCommanders(client, ' e ')).toEqual([]);
    await searchCommanders(client, 'ed"gar');
    expect(paths).toHaveLength(1);
    expect(new URLSearchParams(paths[0].split('?')[1]).get('q')).toBe('is:commander game:paper "ed gar"');
  });
});

describe('autocompleteNames and cardByName', () => {
  it('drops art-series names like "Sol Ring // Sol Ring"', async () => {
    const { client } = recorded();
    expect(await autocompleteNames(client, 'sol r')).toEqual(['Sol Ring']);
  });

  it('looks up a card by exact name, and returns null when Scryfall has none', async () => {
    const { client } = recorded();
    expect((await cardByName(client, 'Llanowar Elves'))?.color_identity).toEqual(['G']);
    const notFound = JSON.parse(readFileSync(new URL('../fixtures/scryfall-404-named.json', import.meta.url), 'utf8'));
    const none = createClient({ fetch: async () => new Response(JSON.stringify(notFound), { status: 404 }), cache: memoryCache(), spacingMs: 0, heavySpacingMs: 0 });
    expect(await cardByName(none, 'Calastria Highborn')).toBeNull();
  });
});

describe('priceEntries with a known card', () => {
  it('prices a just-added card without looking it up again', async () => {
    const { client, fetch } = recorded();
    const sol = (await cardByName(client, 'Sol Ring'))!;
    const calls: string[] = [];
    const counting = createClient({ fetch: async (i, init) => { calls.push(String(i)); return fetch(i, init); }, cache: memoryCache(), spacingMs: 0, heavySpacingMs: 0 });
    const [p] = await priceEntries(counting, [{ entry: { card: { oracleId: sol.oracle_id!, name: 'Sol Ring' }, qty: 1 }, isCommander: false }], undefined, new Map([[sol.oracle_id!, sol]]));
    expect(p.price).toBe(1.1);
    expect(calls).toHaveLength(1); // just the printings search; no collection lookup
    expect(calls[0]).toContain('/cards/search');
    expect(fetch.misses).toEqual([]);
  });
});
