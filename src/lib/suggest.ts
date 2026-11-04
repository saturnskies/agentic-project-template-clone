import type { ScryCard } from '../scryfall/types';
import { categoryFor, CATEGORIES, type EdhCard } from './edhrec';
import { isBasicLand } from './format';
import { mainType } from './gaps';
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
  /** Tribe and theme matches. */
  tags: string[];
  /** Generic role matches (ramp, removal…). */
  roles: string[];
  owned: boolean;
  score: number;
  reason: string;
  /** Where Upgrades shows it, from EDHREC's type lists (EDHREC suggestions only). */
  category?: string;
  /** False for an EDHREC suggestion whose roles haven't been looked up yet; unset means known. */
  rolesKnown?: boolean;
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

type DeckFacts = { colorIdentity: string[]; oracleIds: Set<string> };

/** Legal in Commander, inside the colors, and not already in the deck. */
const fitsDeck = (card: ScryCard, deck: DeckFacts) =>
  card.legalities?.commander === 'legal' && (card.color_identity ?? []).every((c) => deck.colorIdentity.includes(c)) && !deck.oracleIds.has(oracleIdOf(card));

/**
 * Scores the pool: popularity (1 − EDHREC rank ÷ worst rank in the pool) + 0.5 per tribe or theme
 * match + 0.25 per role + 0.3 if owned. Cards that are banned, outside the colors, already in the deck or unpriced are dropped.
 */
export function scoreSuggestions(
  pool: PoolEntry[],
  deck: DeckFacts,
  ownedIds: Set<string>,
): Suggestion[] {
  const eligible = pool.filter(({ card }) => fitsDeck(card, deck));
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
    const typeLine = card.type_line ?? '';
    const category = categoryFor(mainType(typeLine) === 'Artifact' && roles.includes('mana rock') ? 'Mana Artifacts' : null, typeLine);
    out.push({ card, oracleId, price: p.price, finish: p.finish, tags, roles, owned, score, reason, category });
  }
  return out.sort(byScore);
}

const byScore = (a: Suggestion, b: Suggestion) => b.score - a.score || a.card.name.localeCompare(b.card.name);

/** A card EDHREC lists for the commander, with its Scryfall data (cheapest printing). */
export interface EdhCandidate {
  card: ScryCard;
  edh: EdhCard;
}

const pct = (n: number) => Math.round(n * 100);

/**
 * Scores EDHREC's cards for the commander (recommendations spec, "Scoring"): inclusion + positive
 * synergy + 0.3 if owned, so cards special to this commander rank above staples every deck runs.
 * The v1 guarantees hold: nothing banned, off-color, already in the deck, unpriced, or a basic land.
 */
export function scoreEdhrec(candidates: EdhCandidate[], deck: DeckFacts, ownedIds: Set<string>, commander: string, roles: Map<string, string[]> = new Map()): Suggestion[] {
  const out: Suggestion[] = [];
  for (const { card, edh } of candidates) {
    if (!fitsDeck(card, deck) || isBasicLand(card.type_line ?? '')) continue;
    const p = bestPrice(card);
    if (!p) continue;
    const oracleId = oracleIdOf(card);
    const owned = ownedIds.has(oracleId);
    const synergy = pct(edh.synergy);
    const cardRoles = roles.get(oracleId) ?? [];
    const reason = [`In ${pct(edh.inclusion)}% of ${commander} decks`, synergy ? `${synergy > 0 ? '+' : '−'}${Math.abs(synergy)}% synergy` : null, ...cardRoles, owned ? 'owned' : null].filter(Boolean).join(' · ');
    const score = edh.inclusion + Math.max(0, edh.synergy) + (owned ? OWNED_BONUS : 0);
    out.push({ card, oracleId, price: p.price, finish: p.finish, tags: [], roles: cardRoles, rolesKnown: roles.has(oracleId), owned, score, reason, category: categoryFor(edh.category, card.type_line ?? '') });
  }
  return out.sort(byScore);
}

/** The best-scoring suggestions whose roles aren't known yet, for one background role lookup. */
export const roleLookupNames = (scored: Suggestion[], n = 60): Array<{ oracleId: string; name: string }> =>
  scored.filter((s) => s.rolesKnown === false).slice(0, n).map((s) => ({ oracleId: s.oracleId, name: s.card.name }));

/**
 * Suggestions grouped by category, best first in each; empty categories left out. `first` (the
 * categories the deck is short of) leads, in its order; the rest follow in EDHREC's order.
 */
export function byCategory(scored: Suggestion[], first: string[] = []): Array<{ category: string; items: Suggestion[] }> {
  const order = [...first, ...[...CATEGORIES, 'Other'].filter((c) => !first.includes(c))];
  const groups = new Map<string, Suggestion[]>();
  for (const s of [...scored].sort(byScore)) {
    const c = s.category ?? 'Other';
    groups.set(c, [...(groups.get(c) ?? []), s]);
  }
  return [...groups].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([category, items]) => ({ category, items }));
}
