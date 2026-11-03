import { commanderSlug, type EdhPage } from '../lib/edhrec';
import type { EdhCandidate } from '../lib/suggest';
import { frontFace, looseName } from '../scryfall/cards';
import type { ScryfallClient } from '../scryfall/client';
import { cardsByNames } from '../scryfall/names';
import { commanderPage } from './page';

export type EdhrecResult =
  | { status: 'ok'; page: EdhPage; path: string; candidates: EdhCandidate[]; failedLookups: number }
  | { status: 'missing' }
  | { status: 'failed' };

/** The Scryfall filters for looking up EDHREC's names: Commander-legal paper cards in the colors, cheapest printing. */
export const lookupFilters = (colorIdentity: string[]) => `f:commander id<=${colorIdentity.join('').toLowerCase() || 'c'} game:paper prefer:usd-low`;

/**
 * What decks with this commander play: the EDHREC page, then each listed card looked up on Scryfall
 * for its price (and to re-check legality and colors). Cards Scryfall can't find are left out.
 * Throws only when every Scryfall lookup fails.
 */
export async function edhrecCandidates(edhrec: ScryfallClient, scryfall: ScryfallClient, commanders: string[], colorIdentity: string[]): Promise<EdhrecResult> {
  const res = await commanderPage(edhrec, `/commanders/${commanderSlug(commanders)}`);
  if (res.status !== 'ok') return res;
  const { cards, failed } = await cardsByNames(scryfall, res.page.cards.map((c) => c.name), lookupFilters(colorIdentity));
  const candidates = res.page.cards.flatMap((edh) => {
    const card = cards.get(looseName(frontFace(edh.name)));
    return card ? [{ card, edh }] : [];
  });
  return { ...res, candidates, failedLookups: failed };
}
