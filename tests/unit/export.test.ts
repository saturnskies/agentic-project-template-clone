import { describe, expect, it } from 'vitest';
import type { Deck } from '../../src/lib/deck';
import { deckFileName, deckToText } from '../../src/lib/export';
import { parseDeckList } from '../../src/lib/parse';

const deck: Deck = {
  id: 'x',
  name: 'Vampire Castle / v2',
  format: 'commander',
  commander: { oracleId: 'a', name: 'Edgar Markov' },
  cards: [
    { card: { oracleId: 'b', name: 'Sol Ring' }, qty: 1 },
    { card: { oracleId: 'c', name: 'Swamp' }, qty: 8 },
  ],
  updatedAt: '2026-11-02T00:00:00.000Z',
};

describe('deckToText', () => {
  it('lists the commander then each card with its quantity', () => {
    expect(deckToText(deck)).toBe('Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n8 Swamp\n');
  });

  it('round-trips through the paste parser', () => {
    const { entries, errors } = parseDeckList(deckToText(deck));
    expect(errors).toEqual([]);
    expect(entries.map((e) => [e.qty, e.name, e.isCommander])).toEqual([
      [1, 'Edgar Markov', true],
      [1, 'Sol Ring', false],
      [8, 'Swamp', false],
    ]);
  });
});

describe('deckFileName', () => {
  it('makes a safe .txt name', () => {
    expect(deckFileName(deck)).toBe('Vampire-Castle-v2.txt');
    expect(deckFileName({ ...deck, name: '///' })).toBe('deck.txt');
  });
});
