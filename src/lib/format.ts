/**
 * Commander format rules in one place, so another format can be added beside it later (v1 spec,
 * "Out of scope"). Warnings never block an action; the user can add the card anyway.
 */

export type Warning = 'off-color' | 'banned' | 'not-legal' | 'duplicate';

export interface CardFacts {
  oracleId: string;
  name: string;
  typeLine: string;
  colorIdentity: string[];
  /** Scryfall's `legalities.commander`: "legal", "banned", "not_legal" or "restricted". */
  commanderLegality: string | undefined;
}

export interface DeckFacts {
  /** The commander's color identity. */
  colorIdentity: string[];
  /** Oracle IDs already in the deck, the commander included. */
  oracleIds: Set<string>;
}

export const DECK_SIZE = 100;

export const isBasicLand = (typeLine: string) => /^Basic\b.*\bLand\b/.test(typeLine.split(' // ')[0]);

export function cardWarnings(card: CardFacts, deck: DeckFacts): Warning[] {
  const out: Warning[] = [];
  if (!card.colorIdentity.every((c) => deck.colorIdentity.includes(c))) out.push('off-color');
  if (card.commanderLegality === 'banned') out.push('banned');
  else if (card.commanderLegality !== 'legal') out.push('not-legal');
  if (deck.oracleIds.has(card.oracleId) && !isBasicLand(card.typeLine)) out.push('duplicate');
  return out;
}

export function warningText(w: Warning, cardName: string, commanderName: string): string {
  switch (w) {
    case 'off-color':
      return `${cardName} is outside ${commanderName}'s colors.`;
    case 'banned':
      return `${cardName} is banned in Commander.`;
    case 'not-legal':
      return `${cardName} is not legal in Commander.`;
    case 'duplicate':
      return `${cardName} is already in this deck. Commander decks allow one copy of each card except basic lands.`;
  }
}
