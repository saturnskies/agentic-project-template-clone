import { describe, expect, it } from 'vitest';
import { cardImage, groupByType, typeGroup, typeName } from '../../src/lib/groups';
import type { ScryCard } from '../../src/scryfall/types';

const line = (name: string, typeLine: string, qty = 1, price: number | null = 1, isCommander = false) => ({ name, typeLine, qty, price, isCommander });

describe('typeGroup', () => {
  it('files a card under the first matching type, front face only', () => {
    expect(typeGroup('Artifact Creature — Golem')).toBe('Creatures');
    expect(typeGroup('Legendary Planeswalker — Sorin')).toBe('Planeswalkers');
    expect(typeGroup('Instant // Sorcery')).toBe('Instants');
    expect(typeGroup('Enchantment Land — Urza’s Saga')).toBe('Enchantments');
    expect(typeGroup('Basic Land — Swamp')).toBe('Lands');
    expect(typeGroup('Kindred Instant — Vampire')).toBe('Instants');
    expect(typeGroup('')).toBe('Other');
    expect(typeName('Legendary Creature — Vampire Knight')).toBe('Creature');
    expect(typeName('Basic Land — Swamp')).toBe('Land');
  });
});

describe('groupByType', () => {
  const lines = [
    line('Swamp', 'Basic Land — Swamp', 8, 0.11),
    line('Sol Ring', 'Artifact', 1, 1.1),
    line('Vampire Nighthawk', 'Creature — Vampire Shaman', 1, 0.16),
    line('Edgar Markov', 'Legendary Creature — Vampire Knight', 1, 29.08, true),
    line('Bloodline Keeper', 'Creature — Vampire', 1, 4.88),
  ];

  it('puts the commander first, then types in deck order, with card counts', () => {
    const groups = groupByType(lines, 'name');
    expect(groups.map((g) => [g.group, g.count])).toEqual([
      ['Commander', 1],
      ['Creatures', 2],
      ['Artifacts', 1],
      ['Lands', 8],
    ]);
  });

  it('orders cards within a group by name, or by price when sorting by price', () => {
    expect(groupByType(lines, 'name')[1].cards.map((c) => c.name)).toEqual(['Bloodline Keeper', 'Vampire Nighthawk']);
    expect(groupByType([...lines, line('Cheap', 'Creature', 1, null)], 'price')[1].cards.map((c) => c.name)).toEqual(['Bloodline Keeper', 'Vampire Nighthawk', 'Cheap']);
  });

  it('leaves out empty groups', () => {
    expect(groupByType([line('Sol Ring', 'Artifact')], 'name').map((g) => g.group)).toEqual(['Artifacts']);
  });
});

describe('cardImage', () => {
  it('uses the card image, or the front face for double-faced cards', () => {
    expect(cardImage({ image_uris: { normal: 'n.jpg', small: 's.jpg' } } as ScryCard)).toBe('n.jpg');
    expect(cardImage({ card_faces: [{ name: 'A', image_uris: { normal: 'front.jpg' } }, { name: 'B', image_uris: { normal: 'back.jpg' } }] } as ScryCard)).toBe('front.jpg');
    expect(cardImage({ image_uris: { normal: 'n.jpg', small: 's.jpg' } } as ScryCard, 'small')).toBe('s.jpg');
  });

  it('returns null when there is no image', () => {
    expect(cardImage(null)).toBeNull();
    expect(cardImage({} as ScryCard)).toBeNull();
  });
});
