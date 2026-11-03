import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { edhrecCandidates } from '../../src/edhrec/candidates';
import { commanderPage, createEdhrecClient } from '../../src/edhrec/page';
import { createClient, memoryCache, ScryfallError, type ScryfallClient } from '../../src/scryfall/client';
import { fixtureFetch, type FixtureMap } from '../support/fixtures';

// Real EDHREC and Scryfall replies recorded 2026-11-03 (tests/unit/record-fixtures.test.ts, RECORD=1).
const recorded: FixtureMap = JSON.parse(readFileSync(new URL('../fixtures/edhrec-edgar.json', import.meta.url), 'utf8'));
const sleep = async () => {};
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
    const res = await edhrecCandidates(edhrec, scryfall, ['Edgar Markov'], ['B', 'R', 'W']);
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
    expect(await edhrecCandidates(edhrec, scryfall, ['Not a Real Commander Swapsmith'], ['W'])).toEqual({ status: 'missing' });
    expect(f.misses).toEqual([]);
  });

  const page = { container: { json_dict: { cardlists: [{ tag: 'creatures', cardviews: ['Blood Artist', 'Unknown Card', 'Cordial Vampire'].map((name) => ({ name, num_decks: 5, potential_decks: 10, synergy: 0.3 })) }] } } };
  const found = (names: string[]) => ({ object: 'list', data: names.map((name) => ({ name, oracle_id: `o-${name}` })) });

  it('leaves out a card Scryfall cannot find', async () => {
    const scryfall = fake(() => found(['Blood Artist', 'Cordial Vampire']));
    const res = await edhrecCandidates(fake(() => page), scryfall, ['X'], ['B']);
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
    const res = await edhrecCandidates(fake(() => big), scryfall, ['X'], ['B']);
    if (res.status !== 'ok') throw new Error(res.status);
    expect(call).toBeGreaterThan(1);
    expect(res.failedLookups).toBe(1);
    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.candidates.length).toBeLessThan(names.length);
  });

  it('throws when every Scryfall lookup fails', async () => {
    const scryfall = fake(() => { throw new ScryfallError(0, "Couldn't reach Scryfall"); });
    await expect(edhrecCandidates(fake(() => page), scryfall, ['X'], ['B'])).rejects.toBeInstanceOf(ScryfallError);
  });

  it('looks names up within the color identity, legal in Commander, cheapest printing', async () => {
    const queries: string[] = [];
    const scryfall = fake((path) => (queries.push(new URLSearchParams(path.split('?')[1]).get('q')!), found([])));
    await edhrecCandidates(fake(() => page), scryfall, ['X'], ['B', 'R']);
    expect(queries[0]).toMatch(/^f:commander id<=br game:paper prefer:usd-low \(!"Blood Artist" or /);
    expect(queries.every((q) => q.length <= 900)).toBe(true);
  });
});
