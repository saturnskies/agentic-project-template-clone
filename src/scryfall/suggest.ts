import { isOwned, type Collection } from '../lib/owned';
import type { DeckProfile } from '../lib/profile';
import type { DeckCardFacts } from '../lib/swaps';
import type { PricedCard } from './resolve';
import type { PoolEntry } from '../lib/suggest';
import { ScryfallError, type ScryfallClient } from './client';
import { CORE_ROLES } from './roles';
import type { ScryCard, ScryList } from './types';

export interface PoolSearch {
  label: string;
  query: string;
  /** Tribe and theme searches weigh more than generic roles when scoring. */
  kind: 'theme' | 'role';
}

/** The searches that build a deck's candidate pool: its tribe, its themes and the core roles. */
export function profileSearches(profile: DeckProfile): PoolSearch[] {
  return [
    ...(profile.tribe ? [{ label: profile.tribe, query: `t:${profile.tribe.toLowerCase()}`, kind: 'theme' as const }] : []),
    ...profile.themes.map((t) => ({ label: t.label, query: t.query, kind: 'theme' as const })),
    ...CORE_ROLES.map((r) => ({ ...r, kind: 'role' as const })),
  ];
}

/**
 * Runs each search (most-played first, one page of up to 175 cards) within the commander's colors
 * and legal in Commander. `prefer:usd-low` makes Scryfall return each card's cheapest printing, so
 * suggestions can be priced and tiered without a lookup per card. A search that fails is left out
 * and named in `failed`; only when every search fails does this throw.
 */
export async function candidatePool(
  client: ScryfallClient,
  profile: DeckProfile,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<{ pool: PoolEntry[]; failed: string[] }> {
  const identity = profile.colorIdentity.join('').toLowerCase() || 'c';
  const searches = profileSearches(profile);
  const byId = new Map<string, PoolEntry>();
  let done = 0;
  onProgress(0, searches.length);

  const results = await Promise.all(
    searches.map(async (s) => {
      const q = `f:commander id<=${identity} game:paper prefer:usd-low ${s.query}`;
      try {
        const res = await client.get<ScryList<ScryCard>>(`/cards/search?${new URLSearchParams({ q, order: 'edhrec' })}`);
        return { s, cards: res.data };
      } catch (e) {
        if (e instanceof ScryfallError && e.status === 404) return { s, cards: [] as ScryCard[] };
        return { s, cards: [] as ScryCard[], error: e };
      } finally {
        onProgress(++done, searches.length);
      }
    }),
  );
  const failures = results.filter((r) => 'error' in r);
  if (failures.length === results.length) throw failures[0].error;

  // Merge in search order so tags read tribe → themes → roles.
  for (const { s, cards } of results) {
    for (const card of cards) {
      const id = card.oracle_id ?? card.card_faces?.[0]?.oracle_id ?? card.id;
      const entry = byId.get(id) ?? { card, tags: [], roles: [] };
      const list = s.kind === 'role' ? entry.roles : entry.tags;
      if (!list.includes(s.label)) list.push(s.label);
      byId.set(id, entry);
    }
  }
  return { pool: [...byId.values()], failed: failures.map((f) => f.s.label) };
}

/** A card's rules text, both faces for double-faced cards. */
export const rulesText = (c: ScryCard | null) => (c ? (c.oracle_text ?? c.card_faces?.map((f) => f.oracle_text ?? '').join('\n') ?? '') : '');

/**
 * Facts about each priced deck card for swap rules. A card added from suggestions after the role
 * lookup takes its roles from its pool entry, or from `moreRoles` (EDHREC cards' looked-up roles).
 */
export function deckCardFacts(priced: PricedCard[], roles: Map<string, string[]>, pool: PoolEntry[], collection: Collection, moreRoles: Map<string, string[]> = new Map()): DeckCardFacts[] {
  const poolRoles = new Map(pool.map((e) => [e.card.oracle_id ?? e.card.card_faces?.[0]?.oracle_id ?? e.card.id, e.roles]));
  return priced.map((p) => {
    const id = p.entry.card.oracleId;
    return {
      oracleId: id,
      name: p.entry.card.name,
      typeLine: p.typeLine,
      oracleText: rulesText(p.card),
      price: p.price,
      rank: p.card?.edhrec_rank ?? null,
      roles: roles.get(id) ?? poolRoles.get(id) ?? moreRoles.get(id) ?? [],
      isCommander: p.isCommander,
      // A card whose Scryfall data didn't load can't be judged, so it is never offered as a cut.
      keep: !!p.entry.keep || !p.card || !!p.failed,
      owned: isOwned(collection, id, p.typeLine),
    };
  });
}
