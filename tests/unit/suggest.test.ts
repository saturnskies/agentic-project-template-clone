import { describe, expect, it } from 'vitest';
import { scoreSuggestions, tierOf, upgradesByTier, type PoolEntry } from '../../src/lib/suggest';
import type { ScryCard } from '../../src/scryfall/types';

const card = (name: string, over: Partial<ScryCard> = {}): ScryCard =>
  ({
    id: `p-${name}`,
    oracle_id: `o-${name}`,
    name,
    set: 'tst',
    set_name: 'Test',
    collector_number: '1',
    type_line: 'Creature — Vampire',
    color_identity: ['B'],
    legalities: { commander: 'legal' },
    finishes: ['nonfoil'],
    prices: { usd: '1.00', usd_foil: null, usd_etched: null },
    edhrec_rank: 100,
    ...over,
  }) as ScryCard;

const deck = { colorIdentity: ['W', 'B', 'R'], oracleIds: new Set(['o-Sol Ring']) };

describe('tierOf', () => {
  it('splits prices into Budget (under $3), Mid ($3–$15) and Premium (over $15)', () => {
    expect(tierOf(0.1)).toBe('budget');
    expect(tierOf(2.99)).toBe('budget');
    expect(tierOf(3)).toBe('mid');
    expect(tierOf(15)).toBe('mid');
    expect(tierOf(15.01)).toBe('premium');
  });
});

describe('scoreSuggestions', () => {
  it('ranks by popularity, plus 0.5 per tribe or theme match, 0.25 per role, and a bonus for owned cards', () => {
    const pool: PoolEntry[] = [
      { card: card('Popular', { edhrec_rank: 10 }), tags: [], roles: ['ramp'] },
      { card: card('On theme', { edhrec_rank: 500 }), tags: ['Vampire', 'sacrifice', 'death triggers'], roles: [] },
      { card: card('Owned', { edhrec_rank: 900 }), tags: [], roles: ['removal'] },
      { card: card('Unranked', { edhrec_rank: undefined }), tags: [], roles: ['ramp'] },
    ];
    const out = scoreSuggestions(pool, deck, new Set(['o-Owned']));
    expect(out.map((s) => s.card.name)).toEqual(['On theme', 'Popular', 'Owned', 'Unranked']);
    expect(out[0].score).toBeCloseTo(1 - 500 / 900 + 1.5);
    expect(out[1].score).toBeCloseTo(1 - 10 / 900 + 0.25);
    expect(out[2]).toMatchObject({ owned: true });
    expect(out[3].score).toBeCloseTo(0.25);
  });

  it('prefers a card that fits the deck\'s themes over one that only fills generic roles', () => {
    // Real case from the Edgar deck (2026-11-02): Dusk // Dawn matched graveyard plus three roles.
    const pool: PoolEntry[] = [
      { card: card('Dusk // Dawn', { edhrec_rank: 979 }), tags: ['graveyard'], roles: ['card draw', 'removal', 'board wipe'] },
      { card: card('Indulgent Aristocrat', { edhrec_rank: 2588 }), tags: ['Vampire', 'sacrifice', 'lifegain', '+1/+1 counters'], roles: [] },
    ];
    expect(scoreSuggestions(pool, deck, new Set())[0].card.name).toBe('Indulgent Aristocrat');
  });

  it('never suggests a card that is banned, outside the colors or already in the deck', () => {
    const pool: PoolEntry[] = [
      { card: card('Sol Ring'), tags: [], roles: ['ramp'] },
      { card: card('Banned', { legalities: { commander: 'banned' } }), tags: [], roles: ['ramp'] },
      { card: card('Green', { color_identity: ['G'] }), tags: [], roles: ['ramp'] },
      { card: card('Fine'), tags: [], roles: ['ramp'] },
    ];
    expect(scoreSuggestions(pool, deck, new Set()).map((s) => s.card.name)).toEqual(['Fine']);
  });

  it('prices each suggestion at its cheapest finish and leaves out unpriced cards', () => {
    const pool: PoolEntry[] = [
      { card: card('Foil cheaper', { prices: { usd: '5.00', usd_foil: '2.00', usd_etched: null } }), tags: [], roles: [] },
      { card: card('No price', { prices: { usd: null, usd_foil: null, usd_etched: null } }), tags: [], roles: [] },
    ];
    const out = scoreSuggestions(pool, deck, new Set());
    expect(out.map((s) => [s.card.name, s.price, s.finish])).toEqual([['Foil cheaper', 2, 'foil']]);
  });

  it('explains each suggestion in a short reason', () => {
    const out = scoreSuggestions([{ card: card('Blood Artist', { edhrec_rank: 144 }), tags: ['Vampire', 'death triggers'], roles: ['card draw'] }], deck, new Set(['o-Blood Artist']));
    expect(out[0].reason).toBe('Vampire · death triggers · card draw · EDHREC #144 · owned');
  });
});

describe('upgradesByTier', () => {
  it('keeps the top suggestions of each tier, in score order', () => {
    const pool: PoolEntry[] = [
      ...Array.from({ length: 12 }, (_, i) => ({ card: card(`Cheap ${i}`, { edhrec_rank: 10 + i, prices: { usd: '1.00', usd_foil: null, usd_etched: null } }), tags: [], roles: [] })),
      { card: card('Mid one', { prices: { usd: '7.50', usd_foil: null, usd_etched: null } }), tags: [], roles: [] },
      { card: card('Pricey', { prices: { usd: '40.00', usd_foil: null, usd_etched: null } }), tags: [], roles: [] },
    ];
    const tiers = upgradesByTier(scoreSuggestions(pool, deck, new Set()), 10);
    expect(tiers.budget).toHaveLength(10);
    expect(tiers.budget[0].card.name).toBe('Cheap 0');
    expect(tiers.mid.map((s) => s.card.name)).toEqual(['Mid one']);
    expect(tiers.premium.map((s) => s.card.name)).toEqual(['Pricey']);
  });
});
