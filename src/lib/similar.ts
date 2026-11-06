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

/*
 * The four numbers below were tuned on 2026-11-06 against real cards (tests/unit/similar-fixtures.test.ts: Edgar Markov's and
 * Breya's EDHREC pages) from the starting guesses MIN_SIMILARITY 0.35, FIT_BAR 0.6, ROLE_BONUS 0.15, TYPE_BONUS 0.1, which gave
 * Skullclamp no options at all (draw artifacts read nothing alike, so only role and type tie them together), left Mana Vault and
 * Liquimetal Torque without one, and offered Dark Ritual for Thran Dynamo (text 0.60, over the old fit bar). Plan: "Tuning results".
 */
/** Below this similarity a card isn't shown. */
export const MIN_SIMILARITY = 0.4;
/** A card with no role, tribe or theme tie to the deck still fits when its text is this close. */
export const FIT_BAR = 0.7;
/** Added for a role (ramp, card draw, removal, board wipe) both cards fill. Alone it is under MIN_SIMILARITY. */
export const ROLE_BONUS = 0.25;
/** Added when both cards have the same main type; smaller than ROLE_BONUS, and alone under MIN_SIMILARITY. A shared role and type together reach it. */
export const TYPE_BONUS = 0.2;
/** An option is a better fit when its commander score beats the tapped card's by at least this much. */
export const BETTER_MARGIN = 0.1;
/** Floating-point slack for the margin: 0.6 - 0.5 is 0.09999999999999998, which still is a gap of 0.1. */
const MARGIN_SLACK = 1e-9;
/** Phrases shown at most per option. */
const MAX_DIFFERENCES = 3;
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
 * Two cards with no text overlap score 0 from text (never NaN). A role or a type alone stays under MIN_SIMILARITY; both together reach it, because
 * cards that do one job can read nothing alike (two draw artifacts).
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

const multiFace = (c: ScryCard) => (c.card_faces?.length ?? 0) > 1;
const frontStat = (c: ScryCard, k: 'power' | 'toughness') => c.card_faces?.[0]?.[k] ?? c[k];
const symbols = (colors: string[]) => colors.map((x) => `{${x}}`).join('');

/**
 * Whether the front face always enters tapped, never does, or sometimes does ("enters tapped unless…", "if you
 * don't, it enters tapped"). Only the first two are stated as a difference.
 */
function tappedState(card: ScryCard): 'always' | 'sometimes' | 'never' {
  const text = normalizeText(card);
  if (/(^|\. )~ enters (the battlefield )?tapped(\.|$)/.test(text)) return 'always';
  return /\benters? (the battlefield )?tapped\b/.test(text) ? 'sometimes' : 'never';
}

/**
 * How `option` differs from `tapped`, as at most MAX_DIFFERENCES short phrases about the option: mana value,
 * enters tapped or untapped, mana colors made, power and toughness (creatures), keywords, in that order. Only
 * what the card data states outright is claimed, so a missing field says nothing, and an empty list means no
 * difference can be stated. A card with more than one face is compared by its front face's text and stats only:
 * its mana value, produced mana and keywords cover every face. Given the deck's `colorIdentity`, only colors
 * inside it count as made or not made (Arcane Signet lists all five, but a W/B deck never makes {U}); colorless always does.
 */
export function compare(tapped: ScryCard, option: ScryCard, colorIdentity?: string[]): string[] {
  const out: string[] = [];
  const faces = !multiFace(tapped) && !multiFace(option);

  if (faces && tapped.cmc != null && option.cmc != null && tapped.cmc !== option.cmc) {
    const gap = Math.abs(option.cmc - tapped.cmc);
    out.push(`Costs ${gap} ${option.cmc < tapped.cmc ? 'less' : 'more'}`);
  }

  const was = tappedState(tapped);
  const is = tappedState(option);
  if (was === 'always' && is === 'never') out.push('Enters untapped instead of tapped');
  if (was === 'never' && is === 'always') out.push('Enters tapped instead of untapped');

  if (faces && tapped.produced_mana && option.produced_mana) {
    const usable = (colors: string[]) => (colorIdentity ? colors.filter((c) => c === 'C' || colorIdentity.includes(c)) : colors);
    const before = usable(tapped.produced_mana);
    const after = usable(option.produced_mana);
    const gained = after.filter((c) => !before.includes(c));
    const lost = before.filter((c) => !after.includes(c));
    if (gained.length) out.push(`Also makes ${symbols(gained)}`);
    if (lost.length) out.push(`No longer makes ${symbols(lost)}`);
  }

  if (/\bCreature\b/.test(frontType(tapped)) && /\bCreature\b/.test(frontType(option))) {
    const [p0, t0, p1, t1] = [frontStat(tapped, 'power'), frontStat(tapped, 'toughness'), frontStat(option, 'power'), frontStat(option, 'toughness')];
    // Only plain numbers: "*" and "1+*" have no value to compare.
    if ([p0, t0, p1, t1].every((v) => v != null && /^\d+$/.test(v)) && (p0 !== p1 || t0 !== t1)) out.push(`${p1}/${t1} instead of ${p0}/${t0}`);
  }

  if (faces && tapped.keywords && option.keywords) {
    for (const k of option.keywords) if (!tapped.keywords.includes(k)) out.push(`Gains ${k.toLowerCase()}`);
    for (const k of tapped.keywords) if (!option.keywords.includes(k)) out.push(`Loses ${k.toLowerCase()}`);
  }

  return out.slice(0, MAX_DIFFERENCES);
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
    out.push({
      suggestion: s,
      similarity: sim,
      betterFit: s.score - tapped.score >= BETTER_MARGIN - MARGIN_SLACK,
      differences: compare(tapped.card, s.card, profile.colorIdentity),
    });
  }
  return out.sort((a, b) => b.similarity - a.similarity || b.suggestion.score - a.suggestion.score);
}
