import type { ScryCard } from '../scryfall/types';
import { bestPrice, type Finish } from './price';

/**
 * Rules-based suggestions (v1 spec, "Suggestion rules"). Pure functions, so tests need no network.
 * A pool entry is a card that turned up in one or more searches: `tags` names the tribe and theme
 * searches it matched, `roles` the generic role searches (ramp, removal…).
 */

export interface PoolEntry {
  card: ScryCard;
  tags: string[];
  roles: string[];
}

export interface Suggestion {
  card: ScryCard;
  oracleId: string;
  price: number;
  finish: Finish;
  tags: string[];
  owned: boolean;
  score: number;
  reason: string;
}

export type Tier = 'budget' | 'mid' | 'premium';
export const TIERS: Array<{ id: Tier; label: string; range: string }> = [
  { id: 'budget', label: 'Budget', range: 'under $3' },
  { id: 'mid', label: 'Mid', range: '$3 to $15' },
  { id: 'premium', label: 'Premium', range: 'over $15' },
];
const BUDGET_MAX = 3;
const MID_MAX = 15;
const MATCH_WEIGHT = 0.5;
// Roles count for less than the deck's own tribe and themes: on 2026-11-02, Dusk // Dawn (one theme,
// three roles) outranked Indulgent Aristocrat (tribe plus three themes) for a Vampire deck.
const ROLE_WEIGHT = 0.25;
const OWNED_BONUS = 0.3;

export function tierOf(price: number): Tier {
  return price < BUDGET_MAX ? 'budget' : price <= MID_MAX ? 'mid' : 'premium';
}

const oracleIdOf = (c: ScryCard) => c.oracle_id ?? c.card_faces?.[0]?.oracle_id ?? c.id;

/**
 * Scores the pool: popularity (1 − EDHREC rank ÷ worst rank in the pool) + 0.5 per tribe or theme
 * match + 0.25 per role + 0.3 if owned. Cards that are banned, outside the colors, already in the deck or unpriced are dropped.
 */
export function scoreSuggestions(
  pool: PoolEntry[],
  deck: { colorIdentity: string[]; oracleIds: Set<string> },
  ownedIds: Set<string>,
): Suggestion[] {
  const eligible = pool.filter(
    ({ card }) =>
      card.legalities?.commander === 'legal' &&
      (card.color_identity ?? []).every((c) => deck.colorIdentity.includes(c)) &&
      !deck.oracleIds.has(oracleIdOf(card)),
  );
  const maxRank = Math.max(1, ...eligible.map(({ card }) => card.edhrec_rank ?? 0));
  const out: Suggestion[] = [];
  for (const { card, tags, roles } of eligible) {
    const p = bestPrice(card);
    if (!p) continue;
    const oracleId = oracleIdOf(card);
    const owned = ownedIds.has(oracleId);
    const popularity = card.edhrec_rank ? 1 - card.edhrec_rank / maxRank : 0;
    const reason = [...tags, ...roles, card.edhrec_rank ? `EDHREC #${card.edhrec_rank}` : null, owned ? 'owned' : null].filter(Boolean).join(' · ');
    const score = popularity + MATCH_WEIGHT * tags.length + ROLE_WEIGHT * roles.length + (owned ? OWNED_BONUS : 0);
    out.push({ card, oracleId, price: p.price, finish: p.finish, tags: [...tags, ...roles], owned, score, reason });
  }
  return out.sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
}

/** The best suggestions in each price tier. */
export function upgradesByTier(scored: Suggestion[], perTier = 10): Record<Tier, Suggestion[]> {
  const out: Record<Tier, Suggestion[]> = { budget: [], mid: [], premium: [] };
  for (const s of scored) {
    const t = tierOf(s.price);
    if (out[t].length < perTier) out[t].push(s);
  }
  return out;
}
