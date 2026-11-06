import { edhrecCandidates, type EdhrecResult } from '../../src/edhrec/candidates';
import type { PageFilter } from '../../src/lib/edhrec';
import { roleLookupNames, scoreEdhrec, type Suggestion } from '../../src/lib/suggest';
import type { ScryfallClient } from '../../src/scryfall/client';
import { oracleIdOf } from '../../src/scryfall/resolve';
import { deckRoles } from '../../src/scryfall/roles';

/**
 * The scored pool the card dialog works from, built the way the suggestions panel builds it: the commander's EDHREC page,
 * each card looked up on Scryfall, then the roles of the 60 best looked up. Shared by the recorder and the fixture tests,
 * so the tests ask for exactly the requests that were recorded. `deckIds` are the deck's Oracle IDs (empty: every page card is a candidate).
 */
export async function scoredPage(
  edhrec: ScryfallClient,
  scryfall: ScryfallClient,
  o: { slug: string; commander: string; filter: PageFilter; colorIdentity: string[]; deckIds?: Set<string> },
): Promise<{ page: Extract<EdhrecResult, { status: 'ok' }>; scored: Suggestion[]; poolRoles: Map<string, string[]> }> {
  const page = await edhrecCandidates(edhrec, scryfall, { slug: o.slug, filter: o.filter, colorIdentity: o.colorIdentity });
  if (page.status !== 'ok') throw new Error(`EDHREC page: ${page.status}`);
  const facts = { colorIdentity: o.colorIdentity, oracleIds: o.deckIds ?? new Set<string>() };
  const unchecked = scoreEdhrec(page.candidates, facts, new Set(), o.commander);
  const { roles: poolRoles, complete } = await deckRoles(scryfall, roleLookupNames(unchecked));
  if (!complete) throw new Error('role lookup incomplete');
  return { page, scored: scoreEdhrec(page.candidates, facts, new Set(), o.commander, poolRoles), poolRoles };
}

/** The roles of every card on a page: what the dialog knows about a tapped deck card, which the deck's own role lookup supplies. */
export const pageRoles = async (scryfall: ScryfallClient, page: Extract<EdhrecResult, { status: 'ok' }>) =>
  (await deckRoles(scryfall, page.candidates.map((c) => ({ oracleId: oracleIdOf(c.card), name: c.card.name })))).roles;
