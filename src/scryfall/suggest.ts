import type { DeckProfile } from '../lib/profile';
import type { PoolEntry } from '../lib/suggest';
import { ScryfallError, type ScryfallClient } from './client';
import type { ScryCard, ScryList } from './types';

/**
 * Roles every Commander deck wants, searched through Scryfall Tagger's functional tags. Themes such
 * as sacrifice or lifegain are searched through the deck's own detected themes instead.
 */
const CORE_ROLES: Array<{ label: string; query: string }> = [
  { label: 'ramp', query: 'otag:ramp' },
  { label: 'card draw', query: 'otag:card-advantage' },
  { label: 'removal', query: 'otag:removal' },
  { label: 'board wipe', query: 'otag:board-wipe' },
];

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
 * suggestions can be priced and tiered without a lookup per card.
 */
export async function candidatePool(client: ScryfallClient, profile: DeckProfile, onProgress: (done: number, total: number) => void = () => {}): Promise<PoolEntry[]> {
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
        throw e;
      } finally {
        onProgress(++done, searches.length);
      }
    }),
  );
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
  return [...byId.values()];
}
