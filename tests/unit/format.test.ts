import { describe, expect, it } from 'vitest';
import { cardWarnings, isBasicLand, warningText } from '../../src/lib/format';

const card = (over: Partial<Parameters<typeof cardWarnings>[0]> = {}) => ({
  oracleId: 'o-card',
  name: 'Test Card',
  typeLine: 'Artifact',
  colorIdentity: [] as string[],
  commanderLegality: 'legal',
  ...over,
});
const deck = { colorIdentity: ['W', 'B', 'R'], oracleIds: new Set(['o-edgar', 'o-sol']) };

describe('cardWarnings (Commander)', () => {
  it('has no warnings for a legal, on-color card not already in the deck', () => {
    expect(cardWarnings(card({ colorIdentity: ['B', 'R'] }), deck)).toEqual([]);
    expect(cardWarnings(card(), deck)).toEqual([]);
  });

  it('warns when a card is outside the commander\'s colors', () => {
    expect(cardWarnings(card({ colorIdentity: ['G'] }), deck)).toEqual(['off-color']);
    expect(cardWarnings(card({ colorIdentity: ['W', 'U'] }), deck)).toEqual(['off-color']);
  });

  it('tells banned apart from not legal', () => {
    expect(cardWarnings(card({ commanderLegality: 'banned' }), deck)).toEqual(['banned']);
    expect(cardWarnings(card({ commanderLegality: 'not_legal' }), deck)).toEqual(['not-legal']);
  });

  it('warns about a second copy of a non-basic card, including the commander', () => {
    expect(cardWarnings(card({ oracleId: 'o-sol', name: 'Sol Ring' }), deck)).toEqual(['duplicate']);
    expect(cardWarnings(card({ oracleId: 'o-edgar' }), deck)).toEqual(['duplicate']);
  });

  it('allows any number of basic lands, snow basics and Wastes', () => {
    const swamp = card({ oracleId: 'o-sol', typeLine: 'Basic Land — Swamp' });
    expect(cardWarnings(swamp, deck)).toEqual([]);
    expect(isBasicLand('Basic Snow Land — Plains')).toBe(true);
    expect(isBasicLand('Basic Land')).toBe(true);
    expect(isBasicLand('Land — Swamp Mountain')).toBe(false);
  });

  it('lists every warning that applies', () => {
    expect(cardWarnings(card({ oracleId: 'o-sol', colorIdentity: ['G'], commanderLegality: 'banned' }), deck)).toEqual(['off-color', 'banned', 'duplicate']);
  });

  it('describes each warning in plain words', () => {
    expect(warningText('off-color', 'Llanowar Elves', 'Edgar Markov')).toBe("Llanowar Elves is outside Edgar Markov's colors.");
    expect(warningText('banned', 'Mana Crypt', 'Edgar Markov')).toBe('Mana Crypt is banned in Commander.');
    expect(warningText('not-legal', 'Shahrazad', 'Edgar Markov')).toBe('Shahrazad is not legal in Commander.');
    expect(warningText('duplicate', 'Sol Ring', 'Edgar Markov')).toBe('Sol Ring is already in this deck. Commander decks allow one copy of each card except basic lands.');
  });
});
