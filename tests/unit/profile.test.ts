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
      // Real oracle text from Scryfall, 2026-11-04.
      artifacts: 'Whenever you cast an artifact spell, create a 1/1 colorless Thopter artifact creature token with flying.', // Sai, Master Thopterist
      enchantments: "Constellation — Whenever this creature or another enchantment you control enters, draw a card.", // Eidolon of Blossoms
      spells: 'Whenever you cast an instant or sorcery spell, create a 1/1 red Elemental creature token.', // Young Pyromancer
      blink: "Exile target creature you control, then return it to the battlefield under its owner's control.", // Ephemerate
      landfall: 'Landfall — Whenever a land you control enters, add one mana of any color.', // Lotus Cobra
      voltron: 'Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.', // Sram, Senior Edificer
    };
    for (const t of THEMES) {
      const deck = Array.from({ length: 5 }, (_, i) => card(`${t.id}${i}`, 'Creature', wording[t.id]));
      expect(deckProfile(deck, []).themes.map((x) => x.id)).toContain(t.id);
    }
  });

  it.each([
    ['artifacts', 'Tap an untapped artifact you control: Add {U}.'], // Urza, Lord High Artificer
    ['enchantments', 'Whenever you cast an enchantment spell, you gain 1 life and draw a card.'], // Sythis, Harvest's Hand
    ['spells', 'Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.'], // Talrand, Sky Summoner
    ['blink', 'Whenever Brago deals combat damage to a player, exile any number of target nonland permanents you control, then return those cards to the battlefield under their owner’s control.'], // Brago, King Eternal
    ['landfall', 'Landfall — Whenever a land you control enters, you gain 1 life and draw a card.'], // Tatyova, Benthic Druid
    ['voltron', 'Each creature you control gets +2/+0 for each Equipment attached to it.'], // Bruenor Battlehammer
  ])('matches %s on another real card', (id, text) => {
    expect(THEMES.find((t) => t.id === id)!.test.test(text)).toBe(true);
  });

  it('leaves plain cards out of every new theme', () => {
    for (const text of ['{T}: Add {G}.', 'Lightning Bolt deals 3 damage to any target.']) {
      expect(THEMES.filter((t) => t.test.test(text)).map((t) => t.id)).toEqual([]);
    }
  });

  it("counts a theme the commander's own text names, even with fewer than 5 matching cards", () => {
    const edgar = card('Edgar Markov', 'Legendary Creature — Vampire Knight', 'Eminence — Whenever you cast another Vampire spell, if Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.', true);
    expect(deckProfile([edgar, card('A', 'Creature')], ['B', 'R', 'W']).themes.map((t) => t.id)).toEqual(['tokens']);
    // Without the commander, one card is not a theme.
    expect(deckProfile([{ ...edgar, isCommander: false }, card('A', 'Creature')], []).themes).toEqual([]);
  });
});
