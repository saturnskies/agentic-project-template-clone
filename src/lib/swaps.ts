import { frontFace, looseName } from '../scryfall/cards';
import type { EdhPage } from './edhrec';
import { isBasicLand } from './format';
import { mainType, typePlural } from './gaps';
import { creatureTypes, type DeckProfile } from './profile';
import { tierOf, type Suggestion, type Tier } from './suggest';

/**
 * Swap pairs and cheaper replacements (v1 spec, "Swap pairs", "Cheaper replacements"). Pure
 * functions over facts about the deck's cards and scored suggestions.
 */

export interface DeckCardFacts {
  oracleId: string;
  name: string;
  typeLine: string;
  oracleText: string;
  /** Cheapest (or chosen) printing's price; null when unpriced. */
  price: number | null;
  /** EDHREC rank; null when unranked. */
  rank: number | null;
  /** Generic roles from Scryfall tags (ramp, card draw, removal, board wipe). */
  roles: string[];
  isCommander: boolean;
  /** Pinned by the user: never offered as a cut or for replacement. */
  keep: boolean;
  owned: boolean;
}

const MATCH_WEIGHT = 0.5;
const ROLE_WEIGHT = 0.25;
const REPLACE_MIN_PRICE = 5;
const REPLACE_MAX_SHARE = 0.5;

const isLand = (typeLine: string) => /\bLand\b/.test(typeLine.split(' // ')[0]);

/** How much a deck card earns its place, on the same scale as suggestion scores (without the owned bonus). */
export function keepScore(card: DeckCardFacts, profile: DeckProfile, maxRank: number): number {
  const popularity = card.rank ? Math.max(0, 1 - card.rank / Math.max(1, maxRank)) : 0;
  const tribe = profile.tribe && creatureTypes(card.typeLine).includes(profile.tribe) ? 1 : 0;
  const themes = profile.themes.filter((t) => t.test.test(card.oracleText)).length;
  return popularity + MATCH_WEIGHT * (tribe + themes) + ROLE_WEIGHT * card.roles.length;
}

/**
 * Keep scores from EDHREC (recommendations spec, "Scoring"): each deck card's inclusion plus positive
 * synergy on the commander's page, on the same scale as EDHREC suggestion scores. A card the page
 * doesn't list (under about 4% of decks) scores 0, so it is the first cut offered.
 */
export function edhrecKeepScores(deck: DeckCardFacts[], page: EdhPage): Map<string, number> {
  const key = (n: string) => looseName(frontFace(n));
  const byName = new Map(page.cards.map((c) => [key(c.name), c.inclusion + Math.max(0, c.synergy)]));
  return new Map(deck.map((c) => [c.oracleId, byName.get(key(c.name)) ?? 0]));
}

export interface SwapPair {
  add: Suggestion;
  cut: DeckCardFacts;
  /** A role both cards fill, when the cut was matched that way. */
  sharedRole: string | null;
  /** The main type both cards share ("artifacts"), when the cut was matched by type instead of role. */
  sharedType: string | null;
}

/**
 * Pairs top suggestions with the weakest deck card to cut, preferring one that fills the same role,
 * so removal replaces removal. Never cuts the commander, basic lands or kept cards, cuts each card at
 * most once, swaps lands only for lands, and skips an add that scores no better than its cut.
 *
 * With EDHREC (`keepScores` from edhrecKeepScores, `matchType`), a card with no role in common is
 * matched by main type instead, so an artifact replaces an artifact; an add with neither is skipped.
 * Without, it falls back to the weakest card overall (v1).
 */
export function swapPairs(
  suggestions: Suggestion[],
  deck: DeckCardFacts[],
  profile: DeckProfile,
  opts: { tier?: Tier; limit?: number; keepScores?: Map<string, number>; matchType?: boolean } = {},
): SwapPair[] {
  const limit = opts.limit ?? 10;
  const maxRank = Math.max(1, ...deck.map((c) => c.rank ?? 0));
  const keep = new Map(deck.map((c) => [c.oracleId, opts.keepScores ? (opts.keepScores.get(c.oracleId) ?? 0) : keepScore(c, profile, maxRank)]));
  const used = new Set<string>();
  const pairs: SwapPair[] = [];

  for (const add of suggestions) {
    if (pairs.length >= limit) break;
    if (opts.tier && tierOf(add.price) !== opts.tier) continue;
    const addIsLand = isLand(add.card.type_line ?? '');
    const cuttable = deck.filter((c) => !c.isCommander && !c.keep && !isBasicLand(c.typeLine) && !used.has(c.oracleId) && isLand(c.typeLine) === addIsLand);
    if (!cuttable.length) continue;
    const sharing = cuttable.filter((c) => c.roles.some((r) => add.roles.includes(r)));
    let from = sharing.length ? sharing : cuttable;
    let sharedType: string | null = null;
    if (!sharing.length && opts.matchType) {
      const type = mainType(add.card.type_line ?? '');
      from = type ? cuttable.filter((c) => mainType(c.typeLine) === type) : [];
      if (!from.length) continue;
      sharedType = typePlural(type!).toLowerCase();
    }
    const cut = from.reduce((worst, c) => (keep.get(c.oracleId)! < keep.get(worst.oracleId)! ? c : worst));
    if (add.score <= keep.get(cut.oracleId)!) continue;
    used.add(cut.oracleId);
    pairs.push({ add, cut, sharedRole: sharing.length ? (cut.roles.find((r) => add.roles.includes(r)) ?? null) : null, sharedType });
  }
  return pairs;
}

export interface Replacement {
  card: DeckCardFacts;
  options: Array<{ add: Suggestion; saves: number }>;
}

/**
 * For each unowned, unkept card costing $5 or more (not the commander), up to 3 of the best-scoring
 * suggestions that share a role with it, cost under half as much, and match it as land or nonland.
 * When roles are unknown (a suggestion's, or the deck's while they load), a suggestion of the same
 * main type counts as doing the same job.
 */
export function cheaperReplacements(deck: DeckCardFacts[], suggestions: Suggestion[], perCard = 3, opts: { deckRolesKnown?: boolean } = {}): Replacement[] {
  const deckRolesKnown = opts.deckRolesKnown ?? true;
  const sameJob = (s: Suggestion, card: DeckCardFacts) =>
    s.roles.some((r) => card.roles.includes(r)) || ((s.rolesKnown === false || !deckRolesKnown) && mainType(s.card.type_line ?? '') === mainType(card.typeLine));
  return deck
    .filter((c) => !c.isCommander && !c.owned && !c.keep && c.price != null && c.price >= REPLACE_MIN_PRICE)
    .sort((a, b) => b.price! - a.price!)
    .map((card) => ({
      card,
      options: suggestions
        .filter((s) => s.price < card.price! * REPLACE_MAX_SHARE && isLand(s.card.type_line ?? '') === isLand(card.typeLine) && sameJob(s, card))
        .slice(0, perCard)
        .map((add) => ({ add, saves: Math.round((card.price! - add.price) * 100) / 100 })),
    }))
    .filter((r) => r.options.length);
}
