import { MIN_BRACKET_DECKS, pagePath, type EdhPage, type PageFilter } from '../lib/edhrec';
import type { EdhCandidate } from '../lib/suggest';
import { frontFace, looseName } from '../scryfall/cards';
import type { ScryfallClient } from '../scryfall/client';
import { cardsByNames } from '../scryfall/names';
import type { ScryCard } from '../scryfall/types';
import { commanderPage } from './page';

export type EdhrecResult =
  | {
      status: 'ok';
      page: EdhPage;
      /** The page actually shown, after any redirect. */
      path: string;
      /** The filter actually shown: the bracket is dropped when it had too few decks. */
      filter: PageFilter;
      candidates: EdhCandidate[];
      failedLookups: number;
      /** Set when the asked-for bracket had fewer than MIN_BRACKET_DECKS decks. */
      thinBracket?: { bracket: number; decks: number };
    }
  | { status: 'missing' }
  | { status: 'failed' };

/** Cards looked up so far, by loose front-face name; null when Scryfall had no card for the name. */
export type KnownCards = Map<string, ScryCard | null>;

/** The Scryfall filters for looking up EDHREC's names: Commander-legal paper cards in the colors, cheapest printing. */
export const lookupFilters = (colorIdentity: string[]) => `f:commander id<=${colorIdentity.join('').toLowerCase() || 'c'} game:paper prefer:usd-low`;

const keyOf = (name: string) => looseName(frontFace(name));

/**
 * What decks with this commander play: the EDHREC page for `filter`, then each listed card looked
 * up on Scryfall for its price (and to re-check legality and colors). Cards Scryfall can't find are
 * left out. `known` carries lookups across filter changes, so only new names are searched. A bracket
 * with fewer than 50 decks is dropped in favor of all brackets. Throws only when every Scryfall
 * lookup fails.
 */
export async function edhrecCandidates(
  edhrec: ScryfallClient,
  scryfall: ScryfallClient,
  opts: { slug: string; filter: PageFilter; colorIdentity: string[]; known?: KnownCards },
): Promise<EdhrecResult> {
  const known = opts.known ?? new Map();
  let filter = opts.filter;
  let res = await commanderPage(edhrec, pagePath(opts.slug, filter));
  let thinBracket: { bracket: number; decks: number } | undefined;
  if (res.status === 'ok' && filter.bracket != null && res.page.numDecks < MIN_BRACKET_DECKS) {
    thinBracket = { bracket: filter.bracket, decks: res.page.numDecks };
    filter = { ...filter, bracket: null };
    res = await commanderPage(edhrec, pagePath(opts.slug, filter));
  }
  if (res.status !== 'ok') return res;

  const wanted = [...new Set(res.page.cards.map((c) => frontFace(c.name)))].filter((n) => !known.has(keyOf(n)));
  let failedLookups = 0;
  if (wanted.length) {
    const { cards, failed, unanswered } = await cardsByNames(scryfall, wanted, lookupFilters(opts.colorIdentity));
    const retry = new Set(unanswered.map(keyOf));
    for (const n of wanted) if (!retry.has(keyOf(n))) known.set(keyOf(n), cards.get(keyOf(n)) ?? null);
    failedLookups = failed;
  }
  const candidates = res.page.cards.flatMap((edh) => {
    const card = known.get(keyOf(edh.name));
    return card ? [{ card, edh }] : [];
  });
  return { ...res, filter, candidates, failedLookups, ...(thinBracket ? { thinBracket } : {}) };
}
