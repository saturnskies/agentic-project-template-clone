import type { ScryCard } from '../scryfall/types';
import { frontFace } from '../scryfall/cards';
import { mainType } from './gaps';
import { creatureTypes, type DeckProfile } from './profile';
import { isLand } from './swaps';
import type { Suggestion } from './suggest';

/**
 * Cards that do a similar job to one in the deck (swap-from-card spec, "Choosing options"). Pure
 * functions over cards already loaded, so no requests and fast enough to run on every dialog redraw.
 */

/** Below this similarity a card isn't shown. */
export const MIN_SIMILARITY = 0.35;
/** A card with no role, tribe or theme tie to the deck still fits when its text is this close. */
export const FIT_BAR = 0.6;
/** Added for a role (ramp, card draw, removal, board wipe) both cards fill. */
export const ROLE_BONUS = 0.15;
/** Added when both cards have the same main type. */
export const TYPE_BONUS = 0.1;
/** Options shown per page of the dialog. */
export const PAGE_SIZE = 10;

/** The card the owner tapped: its Scryfall card, its roles, and its commander score (0 when the page doesn't list it). */
export interface Tapped {
  card: ScryCard;
  oracleId: string;
  roles: string[];
  score: number;
}

export interface SwapOption {
  suggestion: Suggestion;
  similarity: number;
  /** More played than the tapped card for this commander. */
  betterFit: boolean;
  /** Short phrases for what differs from the tapped card; empty when none can be stated. */
  differences: string[];
}

const frontText = (c: ScryCard) => c.card_faces?.[0]?.oracle_text ?? c.oracle_text ?? '';
const frontType = (c: ScryCard) => c.type_line ?? c.card_faces?.[0]?.type_line ?? '';

/**
 * A card's front-face rules text with what differs between cards that do the same thing removed:
 * its own name becomes ~, reminder text goes, mana symbols become {m} (the tap symbol stays) and numbers #.
 */
export function normalizeText(card: ScryCard): string {
  const name = frontFace(card.name).trim();
  let text = frontText(card);
  if (name) text = text.split(name).join('~');
  return text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\{(?![TQE]\})[^}]+\}/g, '{m}')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The words and the word pairs of a text. Pairs say what is next to what; words keep a one-line ability comparable. */
function shingles(text: string): Set<string> {
  const words = text.split(/[^a-z0-9~#{}+/'-]+/).filter(Boolean);
  const out = new Set(words);
  for (let i = 0; i + 1 < words.length; i++) out.add(`${words[i]} ${words[i + 1]}`);
  return out;
}

/**
 * How alike two cards are, 0 to 1: the overlap (Jaccard) of the words and word pairs of their
 * normalised text, plus ROLE_BONUS for a role they share and TYPE_BONUS for the same main type.
 * Two cards with no text overlap score 0 from text (never NaN); the bonuses alone stay under MIN_SIMILARITY.
 */
export function similarity(tapped: ScryCard, other: ScryCard, sharedRole: boolean): number {
  const a = shingles(normalizeText(tapped));
  const b = shingles(normalizeText(other));
  let both = 0;
  for (const s of a) if (b.has(s)) both++;
  const union = a.size + b.size - both;
  const overlap = union ? both / union : 0;
  const type = mainType(frontType(tapped));
  const sameType = type != null && type === mainType(frontType(other));
  // Nothing in common at all, not even a type: 0, so empty text against empty text is never a match.
  return Math.min(1, overlap + (sharedRole ? ROLE_BONUS : 0) + (sameType ? TYPE_BONUS : 0));
}

/**
 * Pool cards that do a similar job to the tapped card and fit the deck, best first (similarity, then
 * commander score). A land matches only lands and a nonland never a land. A card fits when it is of the
 * deck's tribe, matches one of its themes, shares a role with the tapped card, or reads like it
 * (similarity of FIT_BAR or more): role tags cover four jobs only, so a dual land or an elf has no role.
 */
export function similarTo(tapped: Tapped, pool: Suggestion[], profile: DeckProfile): SwapOption[] {
  const tappedLand = isLand(frontType(tapped.card));
  const out: SwapOption[] = [];
  for (const s of pool) {
    if (s.oracleId === tapped.oracleId || isLand(frontType(s.card)) !== tappedLand) continue;
    const sharedRole = s.roles.some((r) => tapped.roles.includes(r));
    const sim = similarity(tapped.card, s.card, sharedRole);
    if (sim < MIN_SIMILARITY) continue;
    const text = frontText(s.card);
    const ofTribe = !!profile.tribe && creatureTypes(frontType(s.card)).includes(profile.tribe);
    const onTheme = profile.themes.some((t) => t.test.test(text));
    if (!(ofTribe || onTheme || sharedRole || sim >= FIT_BAR)) continue;
    out.push({ suggestion: s, similarity: sim, betterFit: false, differences: [] });
  }
  return out.sort((a, b) => b.similarity - a.similarity || b.suggestion.score - a.suggestion.score);
}
