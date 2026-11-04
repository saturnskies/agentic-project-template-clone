import { describe, expect, it } from 'vitest';
import { deckTypeCounts, gapCategories, typeGaps } from '../../src/lib/gaps';

// EDHREC's average Edgar Markov deck at bracket 2 (Core), recorded 2026-11-03.
const CORE_AVERAGE = { Land: 36, Planeswalker: 1, Enchantment: 6, Artifact: 8, Sorcery: 6, Instant: 7, Creature: 35 };
const line = (typeLine: string, qty = 1, isCommander = false) => ({ typeLine, qty, isCommander });

describe('deckTypeCounts', () => {
  it('counts each card once by its main type, with copies, leaving out the commander', () => {
    const counts = deckTypeCounts([
      line('Legendary Creature — Vampire Knight', 1, true),
      line('Creature — Vampire'),
      line('Artifact Creature — Golem'),
      line('Artifact Land'),
      line('Basic Land — Swamp', 8),
      line('Kindred Instant — Vampire'),
      line('Sorcery // Land'),
      line('Enchantment — Aura'),
      line('Artifact'),
      line('Legendary Planeswalker — Sorin'),
    ]);
    expect(counts).toEqual({ Creature: 2, Land: 9, Instant: 1, Sorcery: 1, Enchantment: 1, Artifact: 1, Planeswalker: 1 });
  });
});

describe('typeGaps', () => {
  it('lists types the deck runs at least 3 fewer of than the average deck, biggest gap first', () => {
    const gaps = typeGaps({ Creature: 30, Artifact: 5, Instant: 11, Land: 36, Enchantment: 4, Sorcery: 8, Planeswalker: 1 }, CORE_AVERAGE);
    expect(gaps).toEqual([
      { type: 'Creature', label: 'Creatures', have: 30, typical: 35 },
      { type: 'Artifact', label: 'Artifacts', have: 5, typical: 8 },
    ]);
  });

  it('leaves out types equal to, above, or only 2 below typical', () => {
    expect(typeGaps({ Creature: 35, Artifact: 6, Instant: 20 }, { Creature: 35, Artifact: 8, Instant: 7 })).toEqual([]);
  });

  it('counts a type the deck has none of', () => {
    expect(typeGaps({}, { Enchantment: 6 })).toEqual([{ type: 'Enchantment', label: 'Enchantments', have: 0, typical: 6 }]);
  });

  it('rounds the average and ignores labels it does not know or odd values', () => {
    expect(typeGaps({ Artifact: 2 }, { Artifact: 4.6, Conspiracy: 9, Creature: Number.NaN, Land: -3 })).toEqual([{ type: 'Artifact', label: 'Artifacts', have: 2, typical: 5 }]);
  });

  it('gives no gaps when the page has no average deck', () => {
    expect(typeGaps({ Creature: 1 }, {})).toEqual([]);
  });
});

describe('gapCategories', () => {
  it("maps each gap to the Upgrades categories that hold that type, in the gaps' order", () => {
    expect(gapCategories([{ type: 'Artifact' }, { type: 'Land' }, { type: 'Creature' }])).toEqual(['Utility Artifacts', 'Mana Artifacts', 'Utility Lands', 'Lands', 'Creatures']);
  });
});
