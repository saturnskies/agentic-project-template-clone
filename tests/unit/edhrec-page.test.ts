import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { edhrecCandidates } from '../../src/edhrec/candidates';
import { commanderPage, createEdhrecClient } from '../../src/edhrec/page';
import { createClient, memoryCache, ScryfallError, type ScryfallClient } from '../../src/scryfall/client';
import { fixtureFetch, type FixtureMap } from '../support/fixtures';

// Real EDHREC and Scryfall replies recorded 2026-11-03 (tests/unit/record-fixtures.test.ts, RECORD=1).
const recorded: FixtureMap = JSON.parse(readFileSync(new URL('../fixtures/edhrec-edgar.json', import.meta.url), 'utf8'));
const sleep = async () => {};
const ALL = { bracket: null, theme: null, budget: false };
const clients = (map: FixtureMap = recorded) => {
  const f = fixtureFetch(map);
  return { f, edhrec: createEdhrecClient({ fetch: f, cache: memoryCache(), sleep }), scryfall: createClient({ fetch: f, cache: memoryCache(), sleep }) };
};
/** A client that answers each path from `answer`, for replies EDHREC hasn't been seen to send. */
const fake = (answer: (path: string) => unknown): ScryfallClient => ({
  get: async <T,>(path: string) => answer(path) as T,
  post: async () => { throw new Error('unused'); },
});

describe('commanderPage', () => {
  it('fetches and parses a commander page', async () => {
    const { edhrec, f } = clients();
    const res = await commanderPage(edhrec, '/commanders/edgar-markov');
    expect(res.status).toBe('ok');
    expect(res.status === 'ok' && res.page.cards.length).toBeGreaterThan(200);
    expect(f.misses).toEqual([]);
  });

  it('follows the redirect for a partner pair named in the other order, and reports the page it landed on', async () => {
    const { edhrec, f } = clients();
    const res = await commanderPage(edhrec, '/commanders/tymna-the-weaver-thrasios-triton-hero');
    expect(res).toMatchObject({ status: 'ok', path: '/commanders/thrasios-triton-hero-tymna-the-weaver' });
    expect(f.misses).toEqual([]);
  });

  it('says the commander is missing when EDHREC answers 403', async () => {
    const { edhrec } = clients();
    expect(await commanderPage(edhrec, '/commanders/not-a-real-commander-swapsmith')).toEqual({ status: 'missing' });
  });

  it('fails when EDHREC cannot be reached', async () => {
    const down = createEdhrecClient({ fetch: async () => { throw new TypeError('Failed to fetch'); }, cache: memoryCache(), sleep });
    expect(await commanderPage(down, '/commanders/edgar-markov')).toEqual({ status: 'failed' });
  });

  it('fails on a reply that is not a commander page', async () => {
    expect(await commanderPage(fake(() => ({ container: { json_dict: {} } })), '/commanders/x')).toEqual({ status: 'failed' });
  });

  it('follows only one redirect, so a loop fails instead of hanging', async () => {
    const paths: string[] = [];
    const loop = fake((p) => (paths.push(p), { redirect: p.includes('/a.') ? '/commanders/b' : '/commanders/a' }));
    expect(await commanderPage(loop, '/commanders/a')).toEqual({ status: 'failed' });
    expect(paths).toEqual(['/pages/commanders/a.json', '/pages/commanders/b.json']);
  });
});

describe('edhrecCandidates', () => {
  it('pairs every card on the Edgar page with its cheapest Scryfall printing', async () => {
    const { edhrec, scryfall, f } = clients();
    const res = await edhrecCandidates(edhrec, scryfall, { slug: 'edgar-markov', filter: ALL, colorIdentity: ['B', 'R', 'W'] });
    if (res.status !== 'ok') throw new Error(res.status);
    expect(res.candidates).toHaveLength(res.page.cards.length);
    expect(res.failedLookups).toBe(0);
    const clamp = res.candidates.find((c) => c.edh.name === 'Skullclamp');
    expect(clamp?.card.name).toBe('Skullclamp');
    expect(clamp?.card.prices.usd).toBeTruthy();
    expect(f.misses).toEqual([]);
  });

  it('passes on missing and failed pages without looking anything up', async () => {
    const { edhrec, scryfall, f } = clients();
    expect(await edhrecCandidates(edhrec, scryfall, { slug: 'not-a-real-commander-swapsmith', filter: ALL, colorIdentity: ['W'] })).toEqual({ status: 'missing' });
    expect(f.misses).toEqual([]);
  });

  const page = { container: { json_dict: { cardlists: [{ tag: 'creatures', cardviews: ['Blood Artist', 'Unknown Card', 'Cordial Vampire'].map((name) => ({ name, num_decks: 5, potential_decks: 10, synergy: 0.3 })) }] } } };
  const found = (names: string[]) => ({ object: 'list', data: names.map((name) => ({ name, oracle_id: `o-${name}` })) });

  it('leaves out a card Scryfall cannot find', async () => {
    const scryfall = fake(() => found(['Blood Artist', 'Cordial Vampire']));
    const res = await edhrecCandidates(fake(() => page), scryfall, { slug: 'x', filter: ALL, colorIdentity: ['B'] });
    expect(res.status === 'ok' && res.candidates.map((c) => c.card.name)).toEqual(['Blood Artist', 'Cordial Vampire']);
  });

  it('keeps the batches that answered when one fails, and counts the failure', async () => {
    const names = Array.from({ length: 80 }, (_, i) => `Card Number ${i}`);
    const big = { container: { json_dict: { cardlists: [{ tag: 'creatures', cardviews: names.map((name) => ({ name, num_decks: 1, potential_decks: 2, synergy: 0 })) }] } } };
    let call = 0;
    const scryfall = fake((path) => {
      if (call++ === 0) throw new ScryfallError(0, "Couldn't reach Scryfall");
      const q = new URLSearchParams(path.split('?')[1]).get('q')!;
      return found(names.filter((n) => q.includes(`!"${n}"`)));
    });
    const res = await edhrecCandidates(fake(() => big), scryfall, { slug: 'x', filter: ALL, colorIdentity: ['B'] });
    if (res.status !== 'ok') throw new Error(res.status);
    expect(call).toBeGreaterThan(1);
    expect(res.failedLookups).toBe(1);
    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.candidates.length).toBeLessThan(names.length);
  });

  it('throws when every Scryfall lookup fails', async () => {
    const scryfall = fake(() => { throw new ScryfallError(0, "Couldn't reach Scryfall"); });
    await expect(edhrecCandidates(fake(() => page), scryfall, { slug: 'x', filter: ALL, colorIdentity: ['B'] })).rejects.toBeInstanceOf(ScryfallError);
  });

  it('looks names up within the color identity, legal in Commander, cheapest printing', async () => {
    const queries: string[] = [];
    const scryfall = fake((path) => (queries.push(new URLSearchParams(path.split('?')[1]).get('q')!), found([])));
    await edhrecCandidates(fake(() => page), scryfall, { slug: 'x', filter: ALL, colorIdentity: ['B', 'R'] });
    expect(queries[0]).toMatch(/^f:commander id<=br game:paper prefer:usd-low \(!"Blood Artist" or /);
    expect(queries.every((q) => q.length <= 900)).toBe(true);
  });

  it('reuses cards already looked up, so a filter change only looks up new names', async () => {
    const queries: string[] = [];
    const scryfall = fake((path) => {
      const q = new URLSearchParams(path.split('?')[1]).get('q')!;
      queries.push(q);
      return found(['Blood Artist', 'Unknown Card', 'Cordial Vampire'].filter((n) => q.includes(`!"${n}"`)));
    });
    const known = new Map();
    await edhrecCandidates(fake(() => page), scryfall, { slug: 'x', filter: ALL, colorIdentity: ['B'], known });
    expect(known.size).toBe(3);
    const again = await edhrecCandidates(fake(() => page), scryfall, { slug: 'x', filter: { ...ALL, theme: 'tokens' }, colorIdentity: ['B'], known });
    expect(queries).toHaveLength(1);
    expect(again.status === 'ok' && again.candidates).toHaveLength(3);
  });

  it('remembers names Scryfall had no card for, so they are not searched again', async () => {
    const queries: string[] = [];
    const scryfall = fake((path) => (queries.push(path), found(['Blood Artist'])));
    const known = new Map();
    await edhrecCandidates(fake(() => page), scryfall, { slug: 'x', filter: ALL, colorIdentity: ['B'], known });
    await edhrecCandidates(fake(() => page), scryfall, { slug: 'x', filter: ALL, colorIdentity: ['B'], known });
    expect(queries).toHaveLength(1);
  });

  it('shows all brackets when the chosen bracket has fewer than 50 decks, and says how many it had', async () => {
    const sized = (n: number) => ({ container: { json_dict: { card: { num_decks: n }, cardlists: page.container.json_dict.cardlists } } });
    const paths: string[] = [];
    const edhrec = fake((p) => (paths.push(p), sized(p.includes('/core') ? 8 : 500)));
    const res = await edhrecCandidates(edhrec, fake(() => found([])), { slug: 'x', filter: { bracket: 2, theme: 'vampires', budget: false }, colorIdentity: ['B'] });
    expect(paths).toEqual(['/pages/commanders/x/core/vampires.json', '/pages/commanders/x/vampires.json']);
    expect(res).toMatchObject({ status: 'ok', filter: { bracket: null, theme: 'vampires' }, thinBracket: { bracket: 2, decks: 8 } });
  });

  it('keeps a bracket page with 50 decks or more', async () => {
    const edhrec = fake(() => ({ container: { json_dict: { card: { num_decks: 50 }, cardlists: page.container.json_dict.cardlists } } }));
    const res = await edhrecCandidates(edhrec, fake(() => found([])), { slug: 'x', filter: { bracket: 2, theme: null, budget: false }, colorIdentity: ['B'] });
    expect(res).toMatchObject({ status: 'ok', filter: { bracket: 2 }, path: '/commanders/x/core' });
    expect(res.status === 'ok' && res.thinBracket).toBeUndefined();
  });
});


describe.runIf(process.env.EDHREC_LIVE === '1')('live EDHREC (EDHREC_LIVE=1)', () => {
  // EDHREC's JSON is unofficial (ADR-005): this catches a change in its shape before review.
  const withUa: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), 'User-Agent': 'Swapsmith-tests/0.1' } });
  const edhrec = createEdhrecClient({ fetch: withUa, cache: memoryCache() });

  it('reads the real Edgar Markov page, a bracket and theme page, a partner redirect and a missing commander', async () => {
    const main = await commanderPage(edhrec, '/commanders/edgar-markov');
    if (main.status !== 'ok') throw new Error(`Edgar page: ${main.status}`);
    expect(main.page.numDecks).toBeGreaterThan(10_000);
    expect(main.page.cards.length).toBeGreaterThan(200);
    expect(main.page.cards.filter((c) => c.category === 'Utility Artifacts').length).toBeGreaterThan(5);
    expect(main.page.themes.length).toBeGreaterThan(5);
    expect(main.page.typeCounts.Land).toBeGreaterThan(25);
    expect(Object.keys(main.page.bracketCounts)).toContain('3');

    expect(await commanderPage(edhrec, '/commanders/edgar-markov/core/vampires')).toMatchObject({ status: 'ok' });
    expect(await commanderPage(edhrec, '/commanders/tymna-the-weaver-thrasios-triton-hero')).toMatchObject({ status: 'ok', path: '/commanders/thrasios-triton-hero-tymna-the-weaver' });
    expect(await commanderPage(edhrec, '/commanders/not-a-real-commander-swapsmith')).toEqual({ status: 'missing' });
  }, 60_000);
});
