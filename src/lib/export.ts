import type { Deck } from './deck';

/** A deck as plain text the paste screen (and most deck sites) can read back: commander first, then "qty name" lines. */
export function deckToText(deck: Deck): string {
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
  return [
    'Commander',
    `1 ${oneLine(deck.commander.name)}`,
    '',
    'Deck',
    ...deck.cards.map((e) => `${e.qty} ${oneLine(e.card.name)}`),
    '',
  ].join('\n');
}

/** A safe .txt file name from a deck name. */
export function deckFileName(deck: Deck): string {
  const base = deck.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `${base || 'deck'}.txt`;
}
