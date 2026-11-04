import { parsePage, type EdhPage } from '../lib/edhrec';
import { createClient, ScryfallError, type CacheStore, type ScryfallClient } from '../scryfall/client';

/** The only code that calls EDHREC (ADR-005). */
export const EDHREC_BASE = 'https://json.edhrec.com';

/** Same queue, retry and 24 h cache as Scryfall, but one request at a time about a second apart. */
export function createEdhrecClient(opts: { fetch?: typeof fetch; cache?: CacheStore; sleep?: (ms: number) => Promise<void> } = {}): ScryfallClient {
  return createClient({ ...opts, base: EDHREC_BASE, service: 'EDHREC', spacingMs: 1000, maxInFlight: 1 });
}

export type PageResult =
  | { status: 'ok'; page: EdhPage; path: string }
  /** EDHREC has no page for this commander (it answers 403). */
  | { status: 'missing' }
  /** EDHREC didn't answer, or answered with something that isn't a commander page. */
  | { status: 'failed' };

/** The page's address on edhrec.com, for the source link. */
export const pageUrl = (path: string) => `https://edhrec.com${path}`;

/**
 * Whether a redirect stays on the asked-for page: the same slug words (a partner pair named in the
 * other order) and the same bracket, theme and budget. Anything else would show another commander's
 * cards under this one's name.
 */
const samePage = (from: string, to: string) => {
  const [, , slugA = '', ...restA] = from.split('/');
  const [, , slugB = '', ...restB] = to.split('/');
  const words = (slug: string) => slug.split('-').sort().join('-');
  return words(slugA) === words(slugB) && restA.join('/') === restB.join('/');
};

/**
 * Fetches a commander page such as `/commanders/edgar-markov`. Follows one redirect to the same page
 * (a partner pair named in the other order); a second redirect, or one elsewhere, counts as a failure.
 */
export async function commanderPage(client: ScryfallClient, path: string): Promise<PageResult> {
  for (let hop = 0; hop < 2; hop++) {
    let body: unknown;
    try {
      body = await client.get(`/pages${path}.json`);
    } catch (e) {
      return e instanceof ScryfallError && e.status === 403 ? { status: 'missing' } : { status: 'failed' };
    }
    const parsed = parsePage(body);
    if (!parsed) return { status: 'failed' };
    if (parsed.kind === 'page') return { status: 'ok', page: parsed.page, path };
    if (!samePage(path, parsed.path)) return { status: 'failed' };
    path = parsed.path;
  }
  return { status: 'failed' };
}
