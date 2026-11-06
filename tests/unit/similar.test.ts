import { describe, expect, it } from 'vitest';
import { THEMES, type DeckProfile } from '../../src/lib/profile';
import { FIT_BAR, MIN_SIMILARITY, normalizeText, similarity, similarTo, type Tapped } from '../../src/lib/similar';
import type { Suggestion } from '../../src/lib/suggest';
import type { ScryCard } from '../../src/scryfall/types';

const card = (over: Partial<ScryCard> & { name: string }): ScryCard =>
  ({ id: `id-${over.name}`, oracle_id: `o-${over.name}`, set: 'tst', set_name: 'Test', collector_number: '1', color_identity: [], legalities: { commander: 'legal' }, finishes: ['nonfoil'], prices: { usd: '1.00', usd_foil: null, usd_etched: null }, ...over }) as ScryCard;

// Real Oracle texts.
const arcaneSignet = card({ name: 'Arcane Signet', type_line: 'Artifact', oracle_text: "{T}: Add one mana of any color in your commander's color identity." });
const fellwarStone = card({ name: 'Fellwar Stone', type_line: 'Artifact', oracle_text: '{T}: Add one mana of any color that a land an opponent controls could produce.' });
const solRing = card({ name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' });
const greaves = card({ name: 'Lightning Greaves', type_line: 'Artifact — Equipment', oracle_text: 'Equipped creature has haste and shroud. (It can’t be the target of spells or abilities your opponents control.)\nEquip {0}' });
const tappedDual = card({ name: 'Scoured Barrens', type_line: 'Land', oracle_text: 'Scoured Barrens enters tapped.\nWhen Scoured Barrens enters, you gain 1 life.\n{T}: Add {W} or {B}.' });
const untappedDual = card({ name: 'Scrubland', type_line: 'Land — Plains Swamp', oracle_text: '({T}: Add {W} or {B}.)' });
const tappedPlainDual = card({ name: 'Blossoming Sands', type_line: 'Land', oracle_text: 'Blossoming Sands enters tapped.\n{T}: Add {G} or {W}.' });
const untappedPlainDual = card({ name: 'Temple Garden', type_line: 'Land', oracle_text: '{T}: Add {G} or {W}.' });

const sugg = (c: ScryCard, over: Partial<Suggestion> = {}): Suggestion => ({ card: c, oracleId: c.oracle_id!, price: 1, finish: 'nonfoil', tags: [], roles: [], owned: false, score: 1, reason: '', ...over });
const noProfile: DeckProfile = { colorIdentity: [], tribe: null, themes: [] };
const tapped = (c: ScryCard, over: Partial<Tapped> = {}): Tapped => ({ card: c, oracleId: c.oracle_id!, roles: [], score: 0.5, ...over });

describe('normalizeText', () => {
  it("replaces the card's own name with ~, so the same ability on two cards reads the same", () => {
    expect(normalizeText(card({ name: 'Edgar Markov', oracle_text: 'Whenever Edgar Markov attacks, draw a card.' }))).toBe('whenever ~ attacks, draw a card.');
  });

  it('drops parenthesised reminder text', () => {
    expect(normalizeText(greaves)).toBe('equipped creature has haste and shroud. equip {m}');
  });

  it('turns digits into # and mana symbols like {G} into {m}, but keeps the tap symbol', () => {
    const c = card({ name: 'X', oracle_text: '{2}{G}, {T}: Put 3 +1/+1 counters on target creature.' });
    expect(normalizeText(c)).toBe('{m}{m}, {t}: put # +#/+# counters on target creature.');
  });

  it('uses the front face only', () => {
    const dfc = card({ name: 'Delver of Secrets // Insectile Aberration', card_faces: [{ name: 'Delver of Secrets', oracle_text: 'At the beginning of your upkeep, look at the top card of your library.' }, { name: 'Insectile Aberration', oracle_text: 'Flying' }] });
    expect(normalizeText(dfc)).toBe('at the beginning of your upkeep, look at the top card of your library.');
  });

  it('is empty for a card with no text', () => {
    expect(normalizeText(card({ name: 'Grizzly Bears' }))).toBe('');
  });
});

describe('similarity', () => {
  it('rates two mana rocks as similar when they share the ramp role', () => {
    expect(similarity(arcaneSignet, solRing, true)).toBeGreaterThanOrEqual(MIN_SIMILARITY);
  });

  it('rates a mana rock and an equipment as not similar', () => {
    expect(similarity(arcaneSignet, greaves, false)).toBeLessThan(MIN_SIMILARITY);
  });

  it('rates a tapped dual land and an untapped dual land as a close match', () => {
    expect(similarity(tappedPlainDual, untappedPlainDual, false)).toBeGreaterThanOrEqual(FIT_BAR);
  });

  it('is 0 for two cards without text or type, not NaN', () => {
    const a = card({ name: 'A' });
    const b = card({ name: 'B' });
    expect(similarity(a, b, false)).toBe(0);
  });

  it('never goes above 1', () => {
    expect(similarity(solRing, solRing, true)).toBe(1);
  });

  it('is symmetric in the text', () => {
    expect(similarity(tappedDual, untappedDual, false)).toBeCloseTo(similarity(untappedDual, tappedDual, false));
  });
});

describe('similarTo', () => {
  const tribal: DeckProfile = { colorIdentity: ['W', 'B'], tribe: 'Vampire', themes: THEMES.filter((t) => t.id === 'sacrifice') };

  it('offers only lands for a land and never a land for a nonland', () => {
    const pool = [sugg(untappedPlainDual), sugg(solRing, { roles: ['ramp'] })];
    expect(similarTo(tapped(tappedPlainDual), pool, noProfile).map((o) => o.suggestion.card.name)).toEqual(['Temple Garden']);
    expect(similarTo(tapped(arcaneSignet, { roles: ['ramp'] }), pool, noProfile).map((o) => o.suggestion.card.name)).toEqual(['Sol Ring']);
  });

  it("never offers the tapped card itself, even when the pool holds it", () => {
    const pool = [sugg(arcaneSignet, { roles: ['ramp'] }), sugg(fellwarStone, { roles: ['ramp'] })];
    const out = similarTo(tapped(arcaneSignet, { roles: ['ramp'] }), pool, noProfile);
    expect(out.map((o) => o.suggestion.card.name)).toEqual(['Fellwar Stone']);
  });

  it('treats a double-faced card as a land only when its front face is a land', () => {
    const spellLand = card({ name: 'Bala Ged Recovery // Bala Ged Sanctuary', type_line: 'Sorcery // Land', oracle_text: 'Return target card from your graveyard to your hand.' });
    const out = similarTo(tapped(untappedPlainDual), [sugg(spellLand)], noProfile);
    expect(out).toEqual([]);
  });

  it('drops a candidate that matches no theme or tribe, shares no role and is under the fit bar', () => {
    // Similar enough to list (a mana rock like the tapped one) but nothing ties it to this deck.
    const sim = similarity(arcaneSignet, fellwarStone, false);
    expect(sim).toBeGreaterThanOrEqual(MIN_SIMILARITY);
    expect(sim).toBeLessThan(FIT_BAR);
    expect(similarTo(tapped(arcaneSignet), [sugg(fellwarStone)], noProfile)).toEqual([]);
  });

  it('keeps a candidate that shares a role', () => {
    expect(similarTo(tapped(arcaneSignet, { roles: ['ramp'] }), [sugg(fellwarStone, { roles: ['ramp'] })], noProfile)).toHaveLength(1);
  });

  it('keeps a candidate that shares the deck tribe', () => {
    // Reads somewhat like the tapped card (between MIN_SIMILARITY and FIT_BAR), so only the tribe can keep it.
    const reaper = card({ name: 'Midnight Reaper', type_line: 'Creature — Zombie Knight', oracle_text: 'Whenever a nontoken creature you control dies, Midnight Reaper deals 1 damage to you and you draw a card.' });
    const vampire = card({ name: 'Vampire Scribe', type_line: 'Creature — Vampire', oracle_text: 'Whenever another nontoken creature you control dies, draw a card.' });
    const sim = similarity(reaper, vampire, false);
    expect(sim).toBeGreaterThanOrEqual(MIN_SIMILARITY);
    expect(sim).toBeLessThan(FIT_BAR);
    expect(similarTo(tapped(reaper), [sugg(vampire)], tribal).map((o) => o.suggestion.card.name)).toEqual(['Vampire Scribe']);
    expect(similarTo(tapped(reaper), [sugg(vampire)], { ...noProfile, tribe: 'Elf' })).toEqual([]);
    expect(similarTo(tapped(reaper), [sugg(vampire)], noProfile)).toEqual([]);
  });

  it('keeps a candidate that matches a deck theme', () => {
    const reaper = card({ name: 'Midnight Reaper', type_line: 'Creature — Zombie Knight', oracle_text: 'Whenever a nontoken creature you control dies, Midnight Reaper deals 1 damage to you and you draw a card.' });
    const haruspex = card({ name: 'Grim Haruspex', type_line: 'Creature — Human Wizard', oracle_text: 'Morph {B}\nWhenever another nontoken creature you control dies, draw a card.' });
    const sim = similarity(reaper, haruspex, false);
    expect(sim).toBeGreaterThanOrEqual(MIN_SIMILARITY);
    expect(sim).toBeLessThan(FIT_BAR);
    const withTheme: DeckProfile = { ...noProfile, themes: THEMES.filter((t) => t.id === 'death-triggers') };
    expect(similarTo(tapped(reaper), [sugg(haruspex)], withTheme)).toHaveLength(1);
    expect(similarTo(tapped(reaper), [sugg(haruspex)], noProfile)).toEqual([]);
  });

  it('keeps a candidate whose text is above the fit bar even with no role, tribe or theme', () => {
    expect(similarTo(tapped(tappedPlainDual), [sugg(untappedPlainDual)], noProfile)).toHaveLength(1);
  });

  it('leaves out a candidate below the minimum similarity', () => {
    expect(similarTo(tapped(arcaneSignet, { roles: ['ramp'] }), [sugg(greaves, { roles: ['ramp'] })], noProfile)).toEqual([]);
  });

  it('copes with cards that have no text', () => {
    const vanillaA = card({ name: 'Vanilla A', type_line: 'Creature — Vampire' });
    const vanillaB = card({ name: 'Vanilla B', type_line: 'Creature — Vampire' });
    expect(similarTo(tapped(vanillaA), [sugg(vanillaB)], tribal)).toEqual([]);
  });

  it('orders by similarity, then by the commander score', () => {
    const near = card({ name: 'Near Land', type_line: 'Land', oracle_text: '{T}: Add {G} or {W}.' });
    const far = card({ name: 'Far Land', type_line: 'Land', oracle_text: 'Far Land enters tapped.\n{T}: Add {G} or {W}.\nWhen Far Land enters, gain 1 life.' });
    const tiedLow = card({ name: 'Tied Low', type_line: 'Land', oracle_text: '{T}: Add {G} or {W}.' });
    const pool = [sugg(far, { score: 9 }), sugg(tiedLow, { score: 0.2 }), sugg(near, { score: 0.8 })];
    const out = similarTo(tapped(untappedPlainDual, { roles: ['ramp'] }), pool.map((p) => ({ ...p, roles: ['ramp'] })), noProfile);
    expect(out.map((o) => o.suggestion.card.name)).toEqual(['Near Land', 'Tied Low', 'Far Land']);
    expect(out[0].similarity).toBeGreaterThan(out[2].similarity);
  });

  it('leaves betterFit and differences for later: false and empty', () => {
    const [option] = similarTo(tapped(tappedPlainDual), [sugg(untappedPlainDual)], noProfile);
    expect(option.betterFit).toBe(false);
    expect(option.differences).toEqual([]);
  });
});
