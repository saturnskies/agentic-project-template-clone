/**
 * Recorded Scryfall replies, keyed by request, shared by unit tests (fixtureFetch) and e2e tests
 * (page.route). Recorded from the real API by tests/unit/record-fixtures.test.ts (RECORD=1).
 */
export type Recorded = { status: number; body: unknown };
export type FixtureMap = Record<string, Recorded>;

export const SCRYFALL = 'https://api.scryfall.com';

export function requestKey(method: string, url: string, body?: string | null): string {
  const path = url.startsWith(SCRYFALL) ? url.slice(SCRYFALL.length) : url;
  return method.toUpperCase() === 'POST' ? `POST ${path} ${body ?? ''}` : `GET ${path}`;
}

/** A fetch that answers from recorded replies and fails loudly on anything unrecorded. */
export function fixtureFetch(map: FixtureMap): typeof fetch & { misses: string[] } {
  const misses: string[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const key = requestKey(init?.method ?? 'GET', String(input), init?.body as string | undefined);
    const hit = map[key];
    if (!hit) {
      misses.push(key);
      return new Response(JSON.stringify({ object: 'error', details: `unrecorded request: ${key}` }), { status: 599 });
    }
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { 'content-type': 'application/json' } });
  };
  return Object.assign(fn as typeof fetch, { misses });
}

const CARD_KEYS = [
  'id', 'oracle_id', 'name', 'flavor_name', 'set', 'set_name', 'collector_number', 'type_line', 'color_identity', 'legalities',
  'finishes', 'prices', 'tcgplayer_id', 'tcgplayer_etched_id', 'image_uris', 'card_faces', 'object',
];

/** Keeps only the card fields Swapsmith reads, so fixtures stay small. */
export function trim(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const b = body as Record<string, unknown>;
  if (b.object === 'list') return { ...b, data: (b.data as unknown[]).map(trim) };
  if (b.object !== 'card') return b;
  const out: Record<string, unknown> = {};
  for (const k of CARD_KEYS) if (k in b) out[k] = b[k];
  const img = (u: unknown) => (u && typeof u === 'object' ? { small: (u as Record<string, string>).small, normal: (u as Record<string, string>).normal } : undefined);
  if (out.image_uris) out.image_uris = img(out.image_uris);
  if (Array.isArray(out.card_faces)) {
    out.card_faces = (out.card_faces as Array<Record<string, unknown>>).map((f) => ({ name: f.name, oracle_id: f.oracle_id, type_line: f.type_line, ...(f.image_uris ? { image_uris: img(f.image_uris) } : {}) }));
  }
  const legal = out.legalities as Record<string, string> | undefined;
  if (legal) out.legalities = { commander: legal.commander };
  const prices = out.prices as Record<string, string | null> | undefined;
  if (prices) out.prices = { usd: prices.usd, usd_foil: prices.usd_foil, usd_etched: prices.usd_etched };
  return out;
}
