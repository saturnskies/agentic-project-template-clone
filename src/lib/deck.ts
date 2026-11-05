/** The deck model from the v1 spec ("Data model"). */

export interface CardRef {
  oracleId: string;
  name: string;
}

export interface DeckEntry {
  card: CardRef;
  qty: number;
  /** A printing the user picked; absent means "cheapest". */
  printingId?: string;
  /** Pinned by the user: never suggested as a cut or for replacement. */
  keep?: boolean;
}

export interface Deck {
  id: string;
  name: string;
  format: 'commander';
  commander: CardRef;
  /** A commander printing the user picked; absent means "cheapest". */
  commanderPrintingId?: string;
  cards: DeckEntry[];
  updatedAt: string;
  /** Last computed totals, shown on the home screen without re-pricing. */
  summary?: { total: number; unpriced: number; count: number; toBuy?: number };
  /**
   * Oracle IDs of the cards you own for this deck. A physical card is in one deck at a time, so this
   * belongs to the deck: ticking a card here never marks it owned in another deck. Owning any printing counts.
   */
  owned?: string[];
  /** Basic lands count as owned unless unticked; the ones unticked in this deck. */
  unownedBasics?: string[];
}

export interface PricedLine {
  qty: number;
  price: number | null;
}

/** Total cost, how many lines have no price, and the card count including the commander line. */
export function deckTotals(lines: PricedLine[]): { total: number; unpriced: number; count: number } {
  let total = 0;
  let unpriced = 0;
  let count = 0;
  for (const l of lines) {
    count += l.qty;
    if (l.price == null) unpriced += 1;
    else total += l.price * l.qty;
  }
  return { total: Math.round(total * 100) / 100, unpriced, count };
}

/** Merges repeated cards (same Oracle ID) into one entry, keeping the first pinned printing. */
export function mergeEntries(entries: DeckEntry[]): DeckEntry[] {
  const byId = new Map<string, DeckEntry>();
  for (const e of entries) {
    const prev = byId.get(e.card.oracleId);
    if (prev) {
      prev.qty += e.qty;
      if (!prev.printingId && e.printingId) prev.printingId = e.printingId;
    } else {
      byId.set(e.card.oracleId, { ...e, card: { ...e.card } });
    }
  }
  return [...byId.values()];
}

export function newDeckId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function isDeck(x: unknown): x is Deck {
  if (!x || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  const ref = (r: unknown) => !!r && typeof r === 'object' && typeof (r as CardRef).oracleId === 'string' && typeof (r as CardRef).name === 'string';
  return (
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    d.format === 'commander' &&
    ref(d.commander) &&
    Array.isArray(d.cards) &&
    d.cards.every((e) => !!e && typeof e === 'object' && ref((e as DeckEntry).card) && Number.isInteger((e as DeckEntry).qty) && (e as DeckEntry).qty > 0) &&
    typeof d.updatedAt === 'string'
  );
}

export const MAX_DECK_NAME = 80;

/** Trims a typed deck name; null when it is empty, so a rename never leaves a deck nameless. */
export function cleanDeckName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_DECK_NAME).trim();
  return name || null;
}
