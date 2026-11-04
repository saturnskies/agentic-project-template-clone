import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ScryfallError, createClient, memoryCache } from '../../src/scryfall/client';
import { searchCards } from '../../src/scryfall/browse';
import { SAMPLES } from '../support/browse-samples';
import { fixtureFetch, type FixtureMap } from '../support/fixtures';

// Real Scryfall replies for the Browse searches, recorded 2026-11-04 (RECORD=1 ... -t Browse).
const map: FixtureMap = JSON.parse(readFileSync(new URL('../fixtures/scryfall-browse.json', import.meta.url), 'utf8'));
const clientOn = (m: FixtureMap) => {
  const fetch = fixtureFetch(m);
  return { fetch, client: createClient({ fetch, cache: memoryCache(), spacingMs: 0, heavySpacingMs: 0, sleep: async () => {} }) };
};
const CRYPT = 'legal:commander name:"crypt"';

describe('searchCards', () => {
  it('returns the cards, the total and whether more pages follow', async () => {
    const { client, fetch } = clientOn(map);
    const r = await searchCards(client, CRYPT, 'popularity', false, 1);
    expect(r.total).toBe(r.cards.length);
    expect(r.cards.length).toBeGreaterThan(40);
    expect(r.cards[0].name).toBe('Blood Crypt');
    expect(r.hasMore).toBe(false);
    expect(r.warnings).toEqual([]);
    expect(fetch.misses).toEqual([]);
  });

  it('sends the sort as Scryfall order and dir, one printing per card', async () => {
    const urls: string[] = [];
    const spy: typeof fetch = async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ object: 'list', data: [], total_cards: 0, has_more: false }), { status: 200 });
    };
    const client = createClient({ fetch: spy, cache: memoryCache(), spacingMs: 0, heavySpacingMs: 0, sleep: async () => {} });
    await searchCards(client, CRYPT, 'price', true, 3);
    const sent = new URL(urls[0]);
    expect(sent.pathname).toBe('/cards/search');
    expect(Object.fromEntries(sent.searchParams)).toEqual({ q: CRYPT, order: 'usd', dir: 'desc', unique: 'cards', page: '3' });
  });

  it('puts the most expensive card first when sorted by price, highest first', async () => {
    const { client } = clientOn(map);
    const r = await searchCards(client, CRYPT, 'price', true, 1);
    // Cards with no USD price (foil-only) sit wherever Scryfall puts them, so judge the priced ones.
    const usd = r.cards.flatMap((c) => (c.prices.usd ? [Number(c.prices.usd)] : []));
    expect(usd.length).toBeGreaterThan(30);
    expect(usd).toEqual([...usd].sort((a, b) => b - a));
  });

  it('reads no matches (404) as an empty result, not an error', async () => {
    const { client } = clientOn(map);
    const r = await searchCards(client, 'legal:commander name:"zzzzqq"', 'popularity', false, 1);
    expect(r).toEqual({ cards: [], total: 0, hasMore: false, warnings: [] });
  });

  it('hands back the terms Scryfall ignored, since the cards then do not match what was typed', async () => {
    const { client } = clientOn(map);
    const r = await searchCards(client, `${CRYPT} (bogus:thing)`, 'popularity', false, 1);
    expect(r.cards.length).toBeGreaterThan(40);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/bogus/);
  });

  it('throws a 400 with Scryfall\'s own message (the advanced box shows it)', async () => {
    const { client } = clientOn(map);
    const e = await searchCards(client, 'legal:commander (t:elf', 'popularity', false, 1).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ScryfallError);
    expect((e as ScryfallError).status).toBe(400);
    expect((e as ScryfallError).message).toMatch(/unclosed parentheses/i);
  });

  it('rethrows other failures so the screen can offer a retry', async () => {
    const { client } = clientOn({});
    const e = await searchCards(client, CRYPT, 'popularity', false, 1).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ScryfallError);
    expect((e as ScryfallError).status).not.toBe(404);
  });
});

describe.runIf(process.env.SCRYFALL_LIVE === '1')('live Browse searches (SCRYFALL_LIVE=1)', () => {
  // Scryfall rejects Node's default User-Agent; browsers send their own, which it accepts.
  const withUa: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), 'User-Agent': 'Swapsmith-tests/0.1' } });
  const live = () => createClient({ cache: memoryCache(), fetch: withUa });

  it('finds cards, reads a 404 as empty, reports an ignored term, and raises a real 400', async () => {
    const client = live();
    const found = await searchCards(client, CRYPT, 'popularity', false, 1);
    expect(found.cards.length).toBeGreaterThan(0);
    expect(found.cards[0]).toHaveProperty('rarity');
    expect(found.cards[0].legalities).toHaveProperty('commander');
    expect((await searchCards(client, 'legal:commander name:"zzzzqq"', 'popularity', false, 1)).cards).toEqual([]);
    expect((await searchCards(client, `${CRYPT} (bogus:thing)`, 'popularity', false, 1)).warnings.length).toBeGreaterThan(0);
    await expect(searchCards(client, 'legal:commander (t:elf', 'popularity', false, 1)).rejects.toMatchObject({ status: 400 });
  }, 60_000);

  it('is accepted by Scryfall for every filter, with no ignored-term warning', async () => {
    const client = live();
    for (const sample of SAMPLES) {
      const r = await searchCards(client, sample.q, 'popularity', false, 1);
      expect(r.warnings, sample.id).toEqual([]);
      expect(r.cards.length, sample.id).toBeGreaterThan(0);
    }
  }, 120_000);

  it('answers page 2 of a big search and refuses a page past the end', async () => {
    const client = live();
    const first = await searchCards(client, 'legal:commander', 'popularity', false, 1);
    expect(first.hasMore).toBe(true);
    expect(first.cards).toHaveLength(175);
    const second = await searchCards(client, 'legal:commander', 'popularity', false, 2);
    expect(second.cards[0].id).not.toBe(first.cards[0].id);
    await expect(searchCards(client, CRYPT, 'popularity', false, 99)).rejects.toMatchObject({ status: 422 });
  }, 60_000);
});
