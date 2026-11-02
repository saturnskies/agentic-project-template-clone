import { describe, expect, it } from 'vitest';
import { creatureTypes, deckProfile, THEMES, type ProfileCard } from '../../src/lib/profile';

const card = (name: string, typeLine: string, oracleText = '', isCommander = false): ProfileCard => ({ name, typeLine, oracleText, isCommander });
const vampires = (n: number) => Array.from({ length: n }, (_, i) => card(`Vamp ${i}`, 'Creature — Vampire Rogue'));

describe('creatureTypes', () => {
  it('reads subtypes from creature type lines, front face only', () => {
    expect(creatureTypes('Legendary Creature — Vampire Knight')).toEqual(['Vampire', 'Knight']);
    expect(creatureTypes('Creature — Vampire // Creature — Vampire')).toEqual(['Vampire']);
    expect(creatureTypes('Artifact — Equipment')).toEqual([]);
    expect(creatureTypes('Kindred Instant — Vampire')).toEqual([]);
  });
});

describe('deckProfile', () => {
  it('takes the color identity from the commander', () => {
    expect(deckProfile([], ['B', 'R', 'W']).colorIdentity).toEqual(['B', 'R', 'W']);
  });

  it('finds the tribe when at least 8 non-commander creatures share a type', () => {
    expect(deckProfile([card('Edgar', 'Legendary Creature — Vampire Knight', '', true), ...vampires(8)], []).tribe).toBe('Vampire');
    expect(deckProfile(vampires(7), []).tribe).toBeNull();
  });

  it("does not count the commander toward the tribe, but uses its types to break a tie", () => {
    const deck = [
      card('Edgar', 'Legendary Creature — Vampire Knight', '', true),
      ...Array.from({ length: 8 }, (_, i) => card(`K${i}`, 'Creature — Human Knight')),
      ...Array.from({ length: 8 }, (_, i) => card(`V${i}`, 'Creature — Vampire Warrior')),
    ];
    // Human and Warrior have 8 too; Knight and Vampire tie at 8 and are both Edgar's, so alphabetical wins.
    expect(deckProfile(deck, []).tribe).toBe('Knight');
  });

  it('finds a theme when at least 5 cards match it', () => {
    const sac = Array.from({ length: 5 }, (_, i) => card(`S${i}`, 'Creature', 'Sacrifice another creature: Scry 1.'));
    const dies = Array.from({ length: 4 }, (_, i) => card(`D${i}`, 'Creature', 'Whenever a creature you control dies, each opponent loses 1 life.'));
    const profile = deckProfile([...sac, ...dies], []);
    expect(profile.themes.map((t) => t.id)).toEqual(['sacrifice']);
  });

  it('recognises every theme from real oracle wording', () => {
    const wording: Record<string, string> = {
      sacrifice: 'Sacrifice a creature: Add {C}.',
      'death-triggers': 'Whenever another creature you control dies, draw a card.',
      lifegain: 'Lifelink',
      tokens: 'Create a 1/1 black Vampire creature token with lifelink.',
      counters: 'Put a +1/+1 counter on target creature.',
      graveyard: 'Return target creature card from your graveyard to the battlefield.',
    };
    for (const t of THEMES) {
      const deck = Array.from({ length: 5 }, (_, i) => card(`${t.id}${i}`, 'Creature', wording[t.id]));
      expect(deckProfile(deck, []).themes.map((x) => x.id)).toContain(t.id);
    }
  });
});
