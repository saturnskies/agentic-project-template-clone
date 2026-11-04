import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import notFound from '../fixtures/scryfall-404-named.json';
import { createClient, idbCache, memoryCache, ScryfallError } from '../../src/scryfall/client';

type Call = { url: string; init?: RequestInit };

function fakeFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const make = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return make();
  };
  return { fn: fn as typeof fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** A fake clock: sleep advances time instantly and records each wait. */
function fakeClock(start = 1_000_000) {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
    advance: (ms: number) => { t += ms; },
    sleeps,
  };
}

describe('Scryfall client', () => {
  it('spaces requests at least spacingMs apart', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json({ object: 'card', name: 'A' })]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep, spacingMs: 100 });

    await Promise.all([client.get('/cards/a1'), client.get('/cards/b2')]);

    expect(f.calls).toHaveLength(2);
    expect(clock.sleeps).toEqual([100]);
  });

  it('spaces searches, name lookups and collection lookups at least 500 ms apart', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json({ object: 'list', data: [] })]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep, spacingMs: 100 });

    await Promise.all([client.get('/cards/search?q=a'), client.get('/cards/named?fuzzy=b'), client.post('/cards/collection', { identifiers: [] }), client.get('/cards/abc')]);

    // search → named waits 500; named → collection waits 500; collection → /cards/abc only 100.
    expect(clock.sleeps).toEqual([500, 500, 100]);
  });

  it('starts the next request without waiting for the previous reply', async () => {
    const clock = fakeClock();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const started: string[] = [];
    const slowFetch = (async (url: string | URL | Request) => {
      started.push(String(url));
      if (started.length === 1) await gate; // the first reply is slow
      return json({ ok: true })();
    }) as typeof fetch;
    const client = createClient({ fetch: slowFetch, cache: memoryCache(), now: clock.now, sleep: clock.sleep, spacingMs: 100 });

    const first = client.get('/slow');
    const second = client.get('/fast');
    await expect(second).resolves.toEqual({ ok: true });
    expect(started).toHaveLength(2);
    release();
    await first;
  });

  it('retries a request that fails at the network level, then succeeds', async () => {
    const clock = fakeClock();
    let calls = 0;
    const flaky = (async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return json({ ok: true })();
    }) as typeof fetch;
    const client = createClient({ fetch: flaky, cache: memoryCache(), now: clock.now, sleep: clock.sleep });

    await expect(client.get('/x')).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(clock.sleeps).toContain(1000);
  });

  it('gives up after maxRetries network failures with a ScryfallError of status 0', async () => {
    const clock = fakeClock();
    let calls = 0;
    const down = (async () => { calls += 1; throw new TypeError('Failed to fetch'); }) as typeof fetch;
    const client = createClient({ fetch: down, cache: memoryCache(), now: clock.now, sleep: clock.sleep, maxRetries: 2 });

    await expect(client.get('/x')).rejects.toMatchObject({ name: 'ScryfallError', status: 0 });
    expect(calls).toBe(3);
  });

  it('gives up on a request that never answers, and retries it', async () => {
    let calls = 0;
    const hanging = ((_url: string, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        // Never answers; only the client's timeout (an abort) ends it.
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      }
      return Promise.resolve(json({ ok: true })());
    }) as typeof fetch;
    const client = createClient({ fetch: hanging, cache: memoryCache(), sleep: async () => {}, spacingMs: 0, heavySpacingMs: 0, timeoutMs: 30 });

    await expect(client.get('/x')).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('keeps at most maxInFlight requests open at once', async () => {
    const clock = fakeClock();
    let open = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const slow = (async () => {
      open += 1;
      peak = Math.max(peak, open);
      await new Promise<void>((r) => releases.push(r));
      open -= 1;
      return json({ ok: true })();
    }) as typeof fetch;
    const client = createClient({ fetch: slow, cache: memoryCache(), now: clock.now, sleep: clock.sleep, maxInFlight: 2 });

    const all = Promise.all([1, 2, 3, 4, 5].map((i) => client.get(`/r${i}`)));
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
      releases.shift()?.();
    }
    await new Promise((r) => setTimeout(r, 0));
    while (releases.length) releases.shift()!();
    await all;
    expect(peak).toBe(2);
  });

  it('sends requests to api.scryfall.com with an Accept header', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json({ ok: true })]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep });

    await client.get('/cards/autocomplete?q=edgar');

    expect(f.calls[0].url).toBe('https://api.scryfall.com/cards/autocomplete?q=edgar');
    expect(new Headers(f.calls[0].init?.headers).get('accept')).toBe('application/json');
  });

  it('retries after a 429, honoring Retry-After', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json({ object: 'error' }, 429, { 'retry-after': '2' }), json({ name: 'Sol Ring' })]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep });

    const body = await client.get<{ name: string }>('/cards/named?exact=Sol+Ring');

    expect(body.name).toBe('Sol Ring');
    expect(f.calls).toHaveLength(2);
    expect(clock.sleeps).toContain(2000);
  });

  it('gives up after maxRetries 429s with a ScryfallError', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json({ object: 'error', details: 'slow down' }, 429)]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep, maxRetries: 2 });

    await expect(client.get('/cards/search?q=x')).rejects.toMatchObject({ status: 429 });
    expect(f.calls).toHaveLength(3);
  });

  it('throws a ScryfallError with Scryfall details on other errors, without retrying', async () => {
    const clock = fakeClock();
    // Real reply captured from api.scryfall.com on 2026-11-02 (tests/fixtures/scryfall-404-named.json).
    const f = fakeFetch([json(notFound, 404)]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep });

    const err = (await client.get('/cards/named?exact=Calastria+Highborn').catch((e: unknown) => e)) as ScryfallError;

    expect(err).toBeInstanceOf(ScryfallError);
    expect(err.status).toBe(404);
    expect(err.message).toContain(notFound.details);
    expect(f.calls).toHaveLength(1);
  });

  it('serves a repeat request from the cache within the TTL', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json({ name: 'Edgar Markov' })]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep, ttlMs: 1000 });

    await client.get('/cards/named?exact=Edgar+Markov');
    clock.advance(999);
    const again = await client.get<{ name: string }>('/cards/named?exact=Edgar+Markov');

    expect(again.name).toBe('Edgar Markov');
    expect(f.calls).toHaveLength(1);
  });

  it('fetches again once the cached entry is older than the TTL', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json({ v: 1 }), json({ v: 2 })]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep, ttlMs: 1000 });

    await client.get('/x');
    clock.advance(1001);
    const fresh = await client.get<{ v: number }>('/x');

    expect(fresh.v).toBe(2);
    expect(f.calls).toHaveLength(2);
  });

  it('caches POST requests by body, so different bodies are fetched separately', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json({ n: 1 }), json({ n: 2 })]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep });

    await client.post('/cards/collection', { identifiers: [{ name: 'A' }] });
    await client.post('/cards/collection', { identifiers: [{ name: 'A' }] });
    await client.post('/cards/collection', { identifiers: [{ name: 'B' }] });

    expect(f.calls).toHaveLength(2);
    expect(f.calls[0].init?.method).toBe('POST');
  });

  it('keeps working when the cache throws', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json({ ok: true })]);
    const broken = { get: async () => { throw new Error('blocked'); }, set: async () => { throw new Error('blocked'); } };
    const client = createClient({ fetch: f.fn, cache: broken, now: clock.now, sleep: clock.sleep });

    await expect(client.get('/x')).resolves.toEqual({ ok: true });
  });

  it('does not cache error replies', async () => {
    const clock = fakeClock();
    const f = fakeFetch([json(notFound, 404), json({ name: 'Kalastria Highborn' })]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep });

    await client.get('/x').catch(() => undefined);
    await expect(client.get('/x')).resolves.toEqual({ name: 'Kalastria Highborn' });
  });

  it('can talk to another host: its base URL, its name in errors, and cache keys that never collide with Scryfall', async () => {
    const clock = fakeClock();
    const cache = memoryCache();
    const f = fakeFetch([json({ from: 'scryfall' }), json({ from: 'edhrec' }), () => new Response('', { status: 403, statusText: 'Forbidden' })]);
    const scryfall = createClient({ fetch: f.fn, cache, now: clock.now, sleep: clock.sleep });
    const edhrec = createClient({ fetch: f.fn, cache, now: clock.now, sleep: clock.sleep, base: 'https://json.edhrec.com', service: 'EDHREC' });

    await scryfall.get('/x');
    await expect(edhrec.get('/x')).resolves.toEqual({ from: 'edhrec' });
    expect(f.calls[1].url).toBe('https://json.edhrec.com/x');
    await expect(edhrec.get('/missing')).rejects.toMatchObject({ status: 403, message: 'EDHREC 403: Forbidden' });
  });

  it('names the other host when it cannot be reached', async () => {
    const clock = fakeClock();
    const f = fakeFetch([() => { throw new TypeError('Failed to fetch'); }]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep, maxRetries: 0, base: 'https://json.edhrec.com', service: 'EDHREC' });

    await expect(client.get('/x')).rejects.toMatchObject({ status: 0, message: "Couldn't reach EDHREC: Failed to fetch" });
  });

  it('reports a non-JSON error body by HTTP status', async () => {
    const clock = fakeClock();
    const f = fakeFetch([() => new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' })]);
    const client = createClient({ fetch: f.fn, cache: memoryCache(), now: clock.now, sleep: clock.sleep });

    await expect(client.get('/x')).rejects.toMatchObject({ status: 502, message: 'Scryfall 502: Bad Gateway' });
  });
});

describe.runIf(process.env.SCRYFALL_LIVE === '1')('live Scryfall (SCRYFALL_LIVE=1)', () => {
  it('fetches a real card and a real 404', async () => {
    // Scryfall rejects Node's default User-Agent; browsers send their own, which it accepts.
    const withUa: typeof fetch = (input, init) =>
      fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), 'User-Agent': 'Swapsmith-tests/0.1' } });
    const client = createClient({ cache: memoryCache(), fetch: withUa });
    const card = await client.get<{ name: string; prices: Record<string, string | null> }>('/cards/named?exact=Sol+Ring');
    expect(card.name).toBe('Sol Ring');
    expect(card.prices).toHaveProperty('usd');
    await expect(client.get('/cards/named?exact=Calastria+Highborn')).rejects.toMatchObject({ status: 404 });
  });
});

describe('idbCache', () => {
  it('round-trips entries through IndexedDB', async () => {
    const cache = idbCache('swapsmith-test');
    await cache.set('k', { t: 5, body: { a: 1 } });

    expect(await cache.get('k')).toEqual({ t: 5, body: { a: 1 } });
    expect(await cache.get('missing')).toBeUndefined();
  });
});
