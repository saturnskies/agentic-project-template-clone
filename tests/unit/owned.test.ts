import { describe, expect, it } from 'vitest';
import { isOwned, setOwned, stillToBuy } from '../../src/lib/owned';

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
