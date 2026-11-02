import { describe, expect, it } from 'vitest';
import type { DeckProfile } from '../../src/lib/profile';
import { THEMES } from '../../src/lib/profile';
import type { Suggestion } from '../../src/lib/suggest';
import { cheaperReplacements, keepScore, swapPairs, type DeckCardFacts } from '../../src/lib/swaps';
import type { ScryCard } from '../../src/scryfall/types';

const profile: DeckProfile = { colorIdentity: ['W', 'B', 'R'], tribe: 'Vampire', themes: THEMES.filter((t) => t.id === 'sacrifice') };

const deckCard = (name: string, over: Partial<DeckCardFacts> = {}): DeckCardFacts => ({
  oracleId: `o-${name}`,
  name,
  typeLine: 'Creature — Human',
  oracleText: '',
  price: 1,
  rank: 5000,
  roles: [],
  isCommander: false,
  keep: false,
  owned: false,
  ...over,
});

const sugg = (name: string, over: Partial<Suggestion> = {}): Suggestion => ({
  card: { name, type_line: over.card?.type_line ?? 'Creature — Vampire' } as ScryCard,
  oracleId: `o-${name}`,
  price: 0.5,
  finish: 'nonfoil',
  tags: ['Vampire'],
  roles: [],
  owned: false,
  score: 2,
  reason: 'Vampire',
  ...over,
});

describe('keepScore', () => {
  it('rewards popularity, the tribe, themes and roles, like suggestion scores', () => {
    const plain = deckCard('Plain', { rank: 9000 });
    const onTheme = deckCard('On theme', { rank: 9000, typeLine: 'Creature — Vampire', oracleText: 'Sacrifice another creature: draw a card.', roles: ['card draw'] });
    expect(keepScore(plain, profile, 9000)).toBeCloseTo(0);
    expect(keepScore(onTheme, profile, 9000)).toBeCloseTo(0.5 + 0.5 + 0.25);
    expect(keepScore(deckCard('Unranked', { rank: null }), profile, 9000)).toBe(0);
  });
});

describe('swapPairs', () => {
  const deck = [
    deckCard('Edgar Markov', { isCommander: true, rank: null }),
    deckCard('Swamp', { typeLine: 'Basic Land — Swamp', rank: null }),
    deckCard('Weak removal', { rank: 9000, roles: ['removal'] }),
    deckCard('Weakest', { rank: null }),
    deckCard('Pinned', { rank: null, keep: true }),
    deckCard('Good card', { rank: 50, typeLine: 'Creature — Vampire' }),
    deckCard('Utility land', { typeLine: 'Land', rank: 8000 }),
  ];

  it('pairs each add with the weakest card that does the same job', () => {
    const pairs = swapPairs([sugg('Strong removal', { roles: ['removal'], tags: [] })], deck, profile);
    expect(pairs.map((p) => [p.add.card.name, p.cut.name, p.sharedRole])).toEqual([['Strong removal', 'Weak removal', 'removal']]);
  });

  it('falls back to the weakest card overall when none shares a role', () => {
    const pairs = swapPairs([sugg('Vampire lord')], deck, profile);
    expect(pairs[0].cut.name).toBe('Weakest');
    expect(pairs[0].sharedRole).toBeNull();
  });

  it('never cuts the commander, basic lands, kept cards, or the same card twice', () => {
    const pairs = swapPairs([sugg('A', { score: 3 }), sugg('B', { score: 3 }), sugg('C', { score: 3 }), sugg('D', { score: 3 })], deck, profile);
    const cuts = pairs.map((p) => p.cut.name);
    expect(cuts).not.toContain('Edgar Markov');
    expect(cuts).not.toContain('Swamp');
    expect(cuts).not.toContain('Pinned');
    expect(new Set(cuts).size).toBe(cuts.length);
  });

  it('only swaps a land for a land', () => {
    const land = sugg('Better land', { card: { name: 'Better land', type_line: 'Land' } as ScryCard, tags: [], roles: ['ramp'] });
    expect(swapPairs([land], deck, profile)[0].cut.name).toBe('Utility land');
  });

  it('skips an add that scores no better than the card it would replace', () => {
    const weak = sugg('Meh', { score: 0.1, tags: [] });
    const strongDeck = [deckCard('Staple', { rank: 1, typeLine: 'Creature — Vampire', oracleText: 'Sacrifice a creature: add {B}.' })];
    expect(swapPairs([weak], strongDeck, profile)).toEqual([]);
  });

  it('keeps to a price tier when one is chosen, and to the limit', () => {
    const adds = [sugg('Cheap', { price: 1 }), sugg('Mid', { price: 8 }), sugg('Pricey', { price: 30 })];
    expect(swapPairs(adds, deck, profile, { tier: 'mid' }).map((p) => p.add.card.name)).toEqual(['Mid']);
    expect(swapPairs(adds, deck, profile, { limit: 2 })).toHaveLength(2);
  });
});

describe('cheaperReplacements', () => {
  const deck = [
    deckCard('Edgar Markov', { isCommander: true, price: 29 }),
    deckCard('Pricey ramp', { price: 6.18, roles: ['ramp'], typeLine: 'Legendary Land' }),
    deckCard('Pricey draw', { price: 12, roles: ['card draw'] }),
    deckCard('Owned pricey', { price: 20, roles: ['card draw'], owned: true }),
    deckCard('Kept pricey', { price: 20, roles: ['card draw'], keep: true }),
    deckCard('Cheap', { price: 4.99, roles: ['card draw'] }),
  ];
  const pool = [
    sugg('Draw A', { roles: ['card draw'], price: 0.5, score: 3 }),
    sugg('Draw B', { roles: ['card draw'], price: 5.99, score: 2.5 }),
    sugg('Draw C', { roles: ['card draw'], price: 6.5, score: 2 }),
    sugg('Draw D', { roles: ['card draw'], price: 1, score: 1 }),
    sugg('Draw E', { roles: ['card draw'], price: 2, score: 0.5 }),
    sugg('Ramp rock', { roles: ['ramp'], price: 0.3, score: 2 }),
    sugg('Ramp land', { roles: ['ramp'], price: 0.4, score: 1, card: { name: 'Ramp land', type_line: 'Land' } as ScryCard }),
  ];

  it('offers up to 3 cheaper cards that do the same job, for unowned cards of $5 or more, priciest first', () => {
    const out = cheaperReplacements(deck, pool);
    expect(out.map((r) => r.card.name)).toEqual(['Pricey draw', 'Pricey ramp']);
    expect(out[0].options.map((o) => [o.add.card.name, o.saves])).toEqual([
      ['Draw A', 11.5],
      ['Draw B', 6.01],
      ['Draw D', 11],
    ]);
  });

  it('only offers options under half the price, and lands for lands', () => {
    const out = cheaperReplacements(deck, pool);
    expect(out[0].options.map((o) => o.add.card.name)).not.toContain('Draw C');
    expect(out[1].options.map((o) => o.add.card.name)).toEqual(['Ramp land']);
  });
});
