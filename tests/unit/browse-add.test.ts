import { describe, expect, it } from 'vitest';
import type { Deck } from '../../src/lib/deck';
import { addCardToDeck, canBeCommander, checkAdd } from '../../src/lib/browse';
import type { ScryCard } from '../../src/scryfall/types';

const card = (extra: Partial<ScryCard> & { oracle_id?: string | undefined } = {}): ScryCard => ({
  id: 'p1', oracle_id: 'o-card', name: 'Test Card', set: 's', set_name: 'S', collector_number: '1', type_line: 'Creature — Elf', color_identity: ['G'],
  legalities: { commander: 'legal' }, finishes: ['nonfoil'], prices: { usd: '1.00', usd_foil: null, usd_etched: null }, ...extra,
});
const deck = (extra: Partial<Deck> = {}): Deck => ({
  id: 'd1', name: 'Deck', format: 'commander', commander: { oracleId: 'o-cmdr', name: 'Cmdr' }, cards: [], updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
});
const ENTRY = (oracleId: string, qty = 1) => ({ card: { oracleId, name: oracleId }, qty });

describe('canBeCommander', () => {
  it('accepts legendary creatures and cards that say they can be the commander', () => {
    expect(canBeCommander(card({ type_line: 'Legendary Creature — Elf Druid' }))).toBe(true);
    expect(canBeCommander(card({ type_line: 'Legendary Planeswalker — Teferi', oracle_text: 'Teferi can be your commander.' }))).toBe(true);
    expect(canBeCommander(card({ type_line: undefined, card_faces: [{ name: 'A', type_line: 'Legendary Creature — Human' }, { name: 'B', type_line: 'Creature — Wolf' }] }))).toBe(true);
  });

  it('refuses everything else', () => {
    expect(canBeCommander(card({ type_line: 'Creature — Elf' }))).toBe(false);
    expect(canBeCommander(card({ type_line: 'Legendary Artifact' }))).toBe(false);
    expect(canBeCommander(card({ type_line: 'Legendary Planeswalker — Teferi', oracle_text: 'Draw a card.' }))).toBe(false);
    expect(canBeCommander(card({ type_line: undefined }))).toBe(false);
  });
});

describe('checkAdd', () => {
  const green = ['G'];

  it('lets a legal card in the commander colors through with nothing to say', () => {
    expect(checkAdd(deck(), card(), green)).toEqual({ blocked: null, notes: [] });
  });

  it('warns about a card outside the commander colors but does not block it', () => {
    const r = checkAdd(deck(), card({ name: 'Crypt Ghast', color_identity: ['B'] }), green);
    expect(r.blocked).toBeNull();
    expect(r.notes).toEqual(["Crypt Ghast is outside Cmdr's colors."]);
  });

  it('warns about banned and not-legal cards but does not block them', () => {
    expect(checkAdd(deck(), card({ legalities: { commander: 'banned' } }), green)).toEqual({ blocked: null, notes: ['Test Card is banned in Commander.'] });
    expect(checkAdd(deck(), card({ legalities: { commander: 'not_legal' } }), green).notes).toEqual(['Test Card is not legal in Commander.']);
    expect(checkAdd(deck(), card({ legalities: {} }), green).notes).toEqual(['Test Card is not legal in Commander.']);
  });

  it('blocks a second copy of a card, and the commander itself, with the reason', () => {
    const inDeck = deck({ cards: [ENTRY('o-card')] });
    expect(checkAdd(inDeck, card(), green).blocked).toMatch(/already in this deck/);
    expect(checkAdd(deck(), card({ oracle_id: 'o-cmdr' }), green).blocked).toMatch(/already in this deck/);
  });

  it('lets basic lands repeat', () => {
    const swamp = card({ oracle_id: 'o-swamp', name: 'Swamp', type_line: 'Basic Land — Swamp', color_identity: ['B'] });
    expect(checkAdd(deck({ cards: [ENTRY('o-swamp', 9)] }), swamp, ['B'])).toEqual({ blocked: null, notes: [] });
  });

  it('says the colors could not be checked when the commander\'s colors are unknown, and skips that warning', () => {
    const r = checkAdd(deck(), card({ color_identity: ['B'] }), null);
    expect(r.blocked).toBeNull();
    expect(r.notes).toEqual(["Couldn't check Cmdr's colors."]);
  });

  it('blocks a card with no Oracle ID instead of storing the printing id', () => {
    const r = checkAdd(deck(), card({ oracle_id: undefined }), green);
    expect(r.blocked).toMatch(/Oracle ID/);
  });
});

describe('addCardToDeck', () => {
  const now = new Date('2026-11-04T12:00:00Z');

  it('appends the card once and stamps the deck, without touching the one it was given', () => {
    const before = deck({ cards: [ENTRY('o-a')] });
    const after = addCardToDeck(before, card(), now);
    expect(after.cards).toEqual([ENTRY('o-a'), { card: { oracleId: 'o-card', name: 'Test Card' }, qty: 1 }]);
    expect(after.updatedAt).toBe(now.toISOString());
    expect(before.cards).toEqual([ENTRY('o-a')]);
    expect(before.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('raises the quantity when the card is already there (basic lands)', () => {
    const swamp = card({ oracle_id: 'o-swamp', name: 'Swamp', type_line: 'Basic Land — Swamp' });
    expect(addCardToDeck(deck({ cards: [{ card: { oracleId: 'o-swamp', name: 'Swamp' }, qty: 3 }] }), swamp, now).cards).toEqual([{ card: { oracleId: 'o-swamp', name: 'Swamp' }, qty: 4 }]);
  });

  it('drops the saved prices, which no longer match the cards, so the list says "Not priced yet" until the deck is opened', () => {
    const priced = deck({ summary: { total: 50, unpriced: 0, count: 40, toBuy: 30 }, bracket: 3 });
    const after = addCardToDeck(priced, card(), now);
    expect(after.summary).toBeUndefined();
    expect('summary' in after).toBe(false);
    expect(after.bracket).toBe(3);
  });

  it('uses the Oracle ID from the first face of a double-faced card', () => {
    const mdfc = card({ oracle_id: undefined, name: 'A // B', card_faces: [{ name: 'A', oracle_id: 'o-face' } as never, { name: 'B' }] });
    expect(addCardToDeck(deck(), mdfc, now).cards[0].card).toEqual({ oracleId: 'o-face', name: 'A // B' });
  });
});
