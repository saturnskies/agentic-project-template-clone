import type { Deck } from './deck';
import { isBasicLand } from './format';

/**
 * The cards owned for one deck. Cards are matched by Oracle ID, so owning any printing counts. Basic
 * lands count as owned unless unticked. Ownership belongs to a deck, never to all decks: a physical card
 * is in one deck at a time (v1 spec, "Decisions after review"; plan 2026-11-05-owned-per-deck).
 */
export interface Collection {
  owned: string[];
  unownedBasics: string[];
}

/** The ticks stored on a deck; a deck with none owns only its basic lands. */
export function deckCollection(deck: Pick<Deck, 'owned' | 'unownedBasics'>): Collection {
  return { owned: deck.owned ?? [], unownedBasics: deck.unownedBasics ?? [] };
}

export function isOwned(c: Collection, oracleId: string, typeLine: string): boolean {
  return isBasicLand(typeLine) ? !c.unownedBasics.includes(oracleId) : c.owned.includes(oracleId);
}

/** Returns a new collection with the card ticked or unticked. */
export function setOwned(c: Collection, oracleId: string, typeLine: string, owned: boolean): Collection {
  const without = (xs: string[]) => xs.filter((x) => x !== oracleId);
  if (isBasicLand(typeLine)) {
    return { owned: [...c.owned], unownedBasics: owned ? without(c.unownedBasics) : [...without(c.unownedBasics), oracleId] };
  }
  return { owned: owned ? [...without(c.owned), oracleId] : without(c.owned), unownedBasics: [...c.unownedBasics] };
}

/** What the cards you don't own cost; unpriced cards are left out, as in the deck total. */
export function stillToBuy(lines: Array<{ qty: number; price: number | null; owned: boolean }>): number {
  const total = lines.reduce((sum, l) => (l.owned || l.price == null ? sum : sum + l.price * l.qty), 0);
  return Math.round(total * 100) / 100;
}
