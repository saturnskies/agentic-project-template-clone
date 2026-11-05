import { describe, expect, it } from 'vitest';
import { deckCollection, isOwned, setOwned, stillToBuy } from '../../src/lib/owned';
import type { Deck } from '../../src/lib/deck';

const empty = () => ({ owned: [] as string[], unownedBasics: [] as string[] });

describe('owned cards', () => {
  it('counts basic lands as owned by default, other cards as not owned', () => {
    const c = empty();
    expect(isOwned(c, 'o-swamp', 'Basic Land — Swamp')).toBe(true);
    expect(isOwned(c, 'o-snow', 'Basic Snow Land — Plains')).toBe(true);
    expect(isOwned(c, 'o-sol', 'Artifact')).toBe(false);
  });

  it('ticks and unticks non-basic cards in the shared collection', () => {
    let c = setOwned(empty(), 'o-sol', 'Artifact', true);
    expect(c.owned).toEqual(['o-sol']);
    expect(isOwned(c, 'o-sol', 'Artifact')).toBe(true);
    c = setOwned(c, 'o-sol', 'Artifact', true);
    expect(c.owned).toEqual(['o-sol']); // no duplicates
    c = setOwned(c, 'o-sol', 'Artifact', false);
    expect(c.owned).toEqual([]);
  });

  it('records an unticked basic land as not owned, and ticking it again clears that', () => {
    let c = setOwned(empty(), 'o-swamp', 'Basic Land — Swamp', false);
    expect(c.unownedBasics).toEqual(['o-swamp']);
    expect(isOwned(c, 'o-swamp', 'Basic Land — Swamp')).toBe(false);
    c = setOwned(c, 'o-swamp', 'Basic Land — Swamp', true);
    expect(c.unownedBasics).toEqual([]);
    expect(c.owned).toEqual([]);
  });

  it('does not change the collection it was given', () => {
    const c = empty();
    setOwned(c, 'o-sol', 'Artifact', true);
    expect(c.owned).toEqual([]);
  });
});

describe('stillToBuy', () => {
  it('adds up priced cards you do not own, times quantity', () => {
    expect(
      stillToBuy([
        { qty: 1, price: 29.08, owned: false },
        { qty: 8, price: 0.11, owned: true },
        { qty: 2, price: 1.1, owned: false },
        { qty: 1, price: null, owned: false },
      ]),
    ).toBe(31.28);
  });

  it('is zero when you own everything', () => {
    expect(stillToBuy([{ qty: 1, price: 5, owned: true }])).toBe(0);
  });
});

describe('ownership belongs to a deck', () => {
  const deck = (over: Partial<Deck> = {}): Deck => ({
    id: 'd1',
    name: 'Edgar',
    format: 'commander',
    commander: { oracleId: 'o-edgar', name: 'Edgar Markov' },
    cards: [],
    updatedAt: '2026-11-02T00:00:00.000Z',
    ...over,
  });

  it('reads a deck that has no ticks yet as owning only its basic lands', () => {
    const c = deckCollection(deck());
    expect(c).toEqual({ owned: [], unownedBasics: [] });
    expect(isOwned(c, 'o-swamp', 'Basic Land — Swamp')).toBe(true);
    expect(isOwned(c, 'o-sol', 'Artifact')).toBe(false);
  });

  it('reads the ticks stored on the deck, and none from any other deck', () => {
    const a = deckCollection(deck({ owned: ['o-sol'], unownedBasics: ['o-swamp'] }));
    const b = deckCollection(deck({ id: 'd2' }));
    expect(isOwned(a, 'o-sol', 'Artifact')).toBe(true);
    expect(isOwned(a, 'o-swamp', 'Basic Land — Swamp')).toBe(false);
    expect(isOwned(b, 'o-sol', 'Artifact')).toBe(false);
  });

  it('does not change the deck when a tick is recorded elsewhere', () => {
    const d = deck({ owned: ['o-sol'] });
    const next = setOwned(deckCollection(d), 'o-ring', 'Artifact', true);
    expect(next.owned).toEqual(['o-sol', 'o-ring']);
    expect(d.owned).toEqual(['o-sol']);
  });
});
