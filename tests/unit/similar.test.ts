import { describe, expect, it } from 'vitest';
import { THEMES, type DeckProfile } from '../../src/lib/profile';
import { BETTER_MARGIN, compare, FIT_BAR, MIN_SIMILARITY, normalizeText, similarity, similarTo, type Tapped } from '../../src/lib/similar';
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
    // Same main type and a little text in common, but no shared role.
    const sim = similarity(arcaneSignet, greaves, false);
    expect(sim).toBeLessThan(MIN_SIMILARITY);
    expect(similarTo(tapped(arcaneSignet, { roles: ['ramp'] }), [sugg(greaves)], noProfile)).toEqual([]);
  });

  it('lists a card that shares a role and the main type even when the texts read nothing alike', () => {
    // Skullclamp and Vanquisher's Banner both draw cards, in different words: the role and the type carry the match.
    expect(similarity(arcaneSignet, greaves, true)).toBeGreaterThanOrEqual(MIN_SIMILARITY);
    expect(similarTo(tapped(arcaneSignet, { roles: ['ramp'] }), [sugg(greaves, { roles: ['ramp'] })], noProfile)).toHaveLength(1);
  });

  it('does not list a card on a shared role alone or on the main type alone', () => {
    const rampSpell = card({ name: 'Rampant Growth', type_line: 'Sorcery', oracle_text: 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.' });
    expect(similarity(arcaneSignet, rampSpell, true)).toBeLessThan(MIN_SIMILARITY);
    expect(similarity(arcaneSignet, greaves, false)).toBeLessThan(MIN_SIMILARITY);
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

  it('flags an option with a higher page score than the tapped card by BETTER_MARGIN, at the margin and not below it', () => {
    // 0.6 - 0.5 is 0.09999999999999998 in floating point, so the margin is compared with a tolerance of 1e-9.
    expect(BETTER_MARGIN).toBe(0.1);
    const at = similarTo(tapped(tappedPlainDual, { score: 0.5 }), [sugg(untappedPlainDual, { score: 0.6 })], noProfile);
    expect(at[0].betterFit).toBe(true);
    const under = similarTo(tapped(tappedPlainDual, { score: 0.5 }), [sugg(untappedPlainDual, { score: 0.59 })], noProfile);
    expect(under[0].betterFit).toBe(false);
  });

  it('keeps an option with a lower page score in the list, unflagged', () => {
    const out = similarTo(tapped(tappedPlainDual, { score: 0.9 }), [sugg(untappedPlainDual, { score: 0.2 })], noProfile);
    expect(out.map((o) => [o.suggestion.card.name, o.betterFit])).toEqual([['Temple Garden', false]]);
  });

  it('flags every option with a positive score when the tapped card scores 0 (not on the page)', () => {
    const second = card({ name: 'Second Land', type_line: 'Land', oracle_text: '{T}: Add {G} or {W}.' });
    const none = card({ name: 'Zero Land', type_line: 'Land', oracle_text: '{T}: Add {G} or {W}.' });
    const pool = [sugg(untappedPlainDual, { score: 0.1 }), sugg(second, { score: 0.8 }), sugg(none, { score: 0.05 })];
    const out = similarTo(tapped(tappedPlainDual, { score: 0 }), pool, noProfile);
    const flags = Object.fromEntries(out.map((o) => [o.suggestion.card.name, o.betterFit]));
    expect(flags).toEqual({ 'Temple Garden': true, 'Second Land': true, 'Zero Land': false });
  });

  it('fills differences with the phrases compare gives for the tapped card and the option', () => {
    const [option] = similarTo(tapped(tappedPlainDual), [sugg(untappedPlainDual)], noProfile);
    expect(option.differences).toEqual(compare(tappedPlainDual, untappedPlainDual));
    expect(option.differences).toEqual(['Enters untapped instead of tapped']);
  });
});

// compare(tapped, option) says how the option differs from the card the owner tapped. Costs are Scryfall's.
describe('compare', () => {
  const sphere = card({ name: "Commander's Sphere", type_line: 'Artifact', cmc: 3, oracle_text: "{T}, Sacrifice Commander's Sphere: Draw a card.\n{T}: Add one mana of any color in your commander's color identity.", produced_mana: ['W', 'U', 'B', 'R', 'G'] });
  const signet = card({ name: 'Arcane Signet', type_line: 'Artifact', cmc: 2, oracle_text: "{T}: Add one mana of any color in your commander's color identity.", produced_mana: ['W', 'U', 'B', 'R', 'G'] });

  it('says an option costs less or more, from the mana value', () => {
    expect(compare(sphere, signet)).toEqual(['Costs 1 less']);
    expect(compare(signet, sphere)).toEqual(['Costs 1 more']);
    expect(compare(card({ name: 'A', cmc: 1 }), card({ name: 'B', cmc: 3 }))).toEqual(['Costs 2 more']);
  });

  it('says an untapped land enters untapped instead of tapped', () => {
    expect(compare(tappedDual, untappedDual)).toEqual(['Enters untapped instead of tapped']);
    expect(compare(tappedPlainDual, untappedPlainDual)).toEqual(['Enters untapped instead of tapped']);
  });

  it('says an option enters tapped when only it does', () => {
    expect(compare(untappedPlainDual, tappedPlainDual)).toEqual(['Enters tapped instead of untapped']);
  });

  it('does not claim a conditional "enters tapped unless"', () => {
    const checkLand = card({ name: 'Clifftop Retreat', type_line: 'Land', oracle_text: 'Clifftop Retreat enters tapped unless you control a Mountain or a Plains.\n{T}: Add {R} or {W}.' });
    expect(compare(tappedPlainDual, checkLand)).toEqual([]);
    expect(compare(checkLand, untappedPlainDual)).toEqual([]);
    const fast = card({ name: 'Inspiring Vantage', type_line: 'Land', oracle_text: 'Inspiring Vantage enters tapped unless you control two or fewer other lands.\n{T}: Add {R} or {W}.' });
    expect(compare(tappedPlainDual, fast)).toEqual([]);
  });

  it('says which colors an option makes that the tapped card does not, and which it no longer makes', () => {
    const rg = card({ name: 'RG', type_line: 'Land', produced_mana: ['R', 'G'] });
    const gu = card({ name: 'GU', type_line: 'Land', produced_mana: ['G', 'U'] });
    expect(compare(rg, gu)).toEqual(['Also makes {U}', 'No longer makes {R}']);
    const rock = card({ name: 'Rock', type_line: 'Artifact', produced_mana: ['C'] });
    expect(compare(rock, card({ name: 'Rock2', type_line: 'Artifact', produced_mana: ['C', 'U', 'B'] }))).toEqual(['Also makes {U}{B}']);
  });

  it('says changed power and toughness for creatures only', () => {
    const bears = card({ name: 'Grizzly Bears', type_line: 'Creature — Bear', power: '2', toughness: '2' });
    const bigger = card({ name: 'Runeclaw Bear', type_line: 'Creature — Bear', power: '3', toughness: '3' });
    expect(compare(bears, bigger)).toEqual(['3/3 instead of 2/2']);
    expect(compare(bears, bears)).toEqual([]);
    const odd = card({ name: 'Tarmogoyf', type_line: 'Creature — Lhurgoyf', power: '*', toughness: '1+*' });
    expect(compare(bears, odd)).toEqual([]);
    const vehicle = card({ name: 'Smuggler', type_line: 'Artifact — Vehicle', power: '4', toughness: '4' });
    expect(compare(card({ name: 'Other', type_line: 'Artifact — Vehicle', power: '2', toughness: '2' }), vehicle)).toEqual([]);
  });

  it('says gained and lost keywords', () => {
    const plain = card({ name: 'P', keywords: ['Lifelink', 'Vigilance'] });
    const other = card({ name: 'O', keywords: ['Flying', 'Vigilance'] });
    expect(compare(plain, other)).toEqual(['Gains flying', 'Loses lifelink']);
  });

  it('gives at most 3 phrases, in the order cost, tapped, colors, stats, keywords', () => {
    const a = card({ name: 'A', type_line: 'Creature — Elf', cmc: 4, oracle_text: 'A enters tapped.', produced_mana: ['G'], power: '2', toughness: '2', keywords: ['Lifelink'] });
    const b = card({ name: 'B', type_line: 'Creature — Elf', cmc: 3, oracle_text: 'Flying', produced_mana: ['G', 'U'], power: '3', toughness: '3', keywords: ['Flying'] });
    expect(compare(a, b)).toEqual(['Costs 1 less', 'Enters untapped instead of tapped', 'Also makes {U}']);
  });

  it('is empty when nothing on the list differs', () => {
    expect(compare(signet, signet)).toEqual([]);
    expect(compare(solRing, fellwarStone)).toEqual([]);
  });

  it('makes no claim from data a card does not have: vanilla, no cmc, no produced_mana, no keywords', () => {
    const vanilla = card({ name: 'Vanilla' });
    expect(compare(vanilla, card({ name: 'Other Vanilla' }))).toEqual([]);
    expect(compare(vanilla, signet)).toEqual([]);
    expect(compare(signet, vanilla)).toEqual([]);
    expect(compare(card({ name: 'X', cmc: 2 }), card({ name: 'Y' }))).toEqual([]);
    for (const phrase of compare(sphere, signet)) expect(phrase).not.toMatch(/NaN|undefined/);
  });

  // Real Scryfall produced_mana: Arcane Signet, Command Tower, Commander's Sphere and Fellwar Stone list all five colors,
  // though in a given deck only the commander's colors are ever made.
  describe('colors, within the deck colour identity', () => {
    const realSignet = card({ name: 'Arcane Signet', type_line: 'Artifact', produced_mana: ['W', 'U', 'B', 'R', 'G'] });
    const orzhovSignet = card({ name: 'Orzhov Signet', type_line: 'Artifact', produced_mana: ['W', 'B'] });
    const wbr = ['W', 'B', 'R'];

    it("ignores colors the deck's identity can't make", () => {
      expect(compare(realSignet, orzhovSignet, wbr)).toEqual(['No longer makes {R}']);
      expect(compare(realSignet, orzhovSignet, ['W', 'B'])).toEqual([]);
      expect(compare(orzhovSignet, realSignet, wbr)).toEqual(['Also makes {R}']);
      expect(compare(orzhovSignet, realSignet, ['W', 'B'])).toEqual([]);
    });

    it('still says a color inside the identity that is gained or lost', () => {
      const bg = card({ name: 'Golgari Signet', type_line: 'Artifact', produced_mana: ['B', 'G'] });
      expect(compare(orzhovSignet, bg, ['W', 'B', 'G'])).toEqual(['Also makes {G}', 'No longer makes {W}']);
    });

    it('keeps colorless in any identity, and says nothing for a colorless commander beyond it', () => {
      const rock = card({ name: 'Rock', type_line: 'Artifact', produced_mana: ['C'] });
      expect(compare(realSignet, rock, wbr)).toEqual(['Also makes {C}', 'No longer makes {W}{B}{R}']);
      expect(compare(realSignet, rock, [])).toEqual(['Also makes {C}']);
    });

    it('does not let out-of-identity colors use up the 3 phrases that stats and keywords need', () => {
      const a = card({ name: 'A', type_line: 'Creature — Elf', cmc: 4, produced_mana: ['W', 'U', 'B', 'R', 'G'], power: '2', toughness: '2', keywords: ['Lifelink'] });
      const b = card({ name: 'B', type_line: 'Creature — Elf', cmc: 4, produced_mana: ['W', 'B'], power: '3', toughness: '3', keywords: ['Flying'] });
      expect(compare(a, b, ['W', 'B'])).toEqual(['3/3 instead of 2/2', 'Gains flying', 'Loses lifelink']);
      expect(compare(a, b)).toEqual(['No longer makes {U}{R}{G}', '3/3 instead of 2/2', 'Gains flying']);
    });

    it('is passed by similarTo from the deck profile', () => {
      const profile: DeckProfile = { colorIdentity: ['W', 'B'], tribe: null, themes: [] };
      const rock1 = card({ name: 'Rock One', type_line: 'Artifact', oracle_text: '{T}: Add one mana of any color.', produced_mana: ['W', 'U', 'B', 'R', 'G'] });
      const rock2 = card({ name: 'Rock Two', type_line: 'Artifact', oracle_text: '{T}: Add one mana of any color.', produced_mana: ['W', 'B'] });
      const [option] = similarTo(tapped(rock1, { roles: ['ramp'] }), [sugg(rock2, { roles: ['ramp'] })], profile);
      expect(option.differences).toEqual([]);
    });
  });

  it('compares the front face of a double-faced card and claims no cost, colors or keywords from the whole card', () => {
    const pathway = card({ name: 'Blightstep Pathway // Searstep Pathway', type_line: 'Land // Land', cmc: 0, produced_mana: ['B', 'R'], keywords: [], card_faces: [{ name: 'Blightstep Pathway', type_line: 'Land', oracle_text: '{T}: Add {B}.' }, { name: 'Searstep Pathway', type_line: 'Land', oracle_text: '{T}: Add {R}.' }] });
    expect(compare(untappedPlainDual, pathway)).toEqual([]);
    const tappedFront = card({ name: 'Front // Back', type_line: 'Land // Land', card_faces: [{ name: 'Front', type_line: 'Land', oracle_text: 'Front enters tapped.\n{T}: Add {G}.' }, { name: 'Back', type_line: 'Land', oracle_text: '{T}: Add {W}.' }] });
    expect(compare(tappedFront, untappedPlainDual)).toEqual(['Enters untapped instead of tapped']);
  });
});
