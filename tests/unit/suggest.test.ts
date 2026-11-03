import { describe, expect, it } from 'vitest';
import type { EdhCard } from '../../src/lib/edhrec';
import { byCategory, scoreEdhrec, scoreSuggestions, tierOf, upgradesByTier, type EdhCandidate, type PoolEntry } from '../../src/lib/suggest';
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

describe('scoreEdhrec', () => {
  const edh = (name: string, inclusion: number, synergy: number, category: string | null = 'Creatures'): EdhCard => ({ name, inclusion, synergy, category });
  const cand = (name: string, inclusion: number, synergy: number, over: Partial<ScryCard> = {}, category: string | null = 'Creatures'): EdhCandidate => ({ card: card(name, over), edh: edh(name, inclusion, synergy, category) });

  it('ranks by inclusion plus positive synergy, so cards special to the commander beat staples (Edgar Markov page, 2026-11-03)', () => {
    const scored = scoreEdhrec(
      [
        cand('Path to Exile', 0.49, 0.01, { type_line: 'Instant' }, 'Instants'),
        // Sol Ring's numbers (the test deck already runs Sol Ring itself).
        cand('Mana Rock', 0.92, 0.04, { type_line: 'Artifact', color_identity: [] }, 'Mana Artifacts'),
        cand('Exquisite Blood', 0.51, 0.43, { type_line: 'Enchantment' }, 'Enchantments'),
        cand('Captivating Vampire', 0.82, 0.72),
        cand('Arcane Signet', 0.8, -0.05, { type_line: 'Artifact', color_identity: [] }, 'Mana Artifacts'),
      ],
      deck,
      new Set(),
      'Edgar Markov',
    );
    expect(scored.map((s) => s.card.name)).toEqual(['Captivating Vampire', 'Mana Rock', 'Exquisite Blood', 'Arcane Signet', 'Path to Exile']);
    // Negative synergy doesn't push a card below its inclusion.
    expect(scored.find((s) => s.card.name === 'Arcane Signet')!.score).toBeCloseTo(0.8);
  });

  it('explains each card by how many of the commander’s decks run it and its synergy', () => {
    const [a, b, c] = scoreEdhrec([cand('A', 0.514, 0.426), cand('B', 0.3, -0.05), cand('C', 0.2, 0.002)], deck, new Set(['o-B']), 'Edgar Markov');
    expect(a.reason).toBe('In 51% of Edgar Markov decks · +43% synergy');
    expect(b.reason).toBe('In 30% of Edgar Markov decks · −5% synergy · owned');
    expect(c.reason).toBe('In 20% of Edgar Markov decks');
  });

  it('adds the owned bonus', () => {
    const [owned, other] = scoreEdhrec([cand('Other', 0.5, 0), cand('Owned', 0.3, 0)], deck, new Set(['o-Owned']), 'X');
    expect(owned.card.name).toBe('Owned');
    expect(owned.score).toBeCloseTo(0.6);
    expect(other.owned).toBe(false);
  });

  it('never suggests a card that is banned, off-color, already in the deck, unpriced or a basic land', () => {
    const scored = scoreEdhrec(
      [
        cand('Fine', 0.1, 0),
        cand('Banned', 0.9, 0.9, { legalities: { commander: 'banned' } }),
        cand('Blue', 0.9, 0.9, { color_identity: ['U'] }),
        cand('Sol Ring', 0.9, 0.9),
        cand('Unpriced', 0.9, 0.9, { prices: { usd: null, usd_foil: null, usd_etched: null } }),
        cand('Swamp', 0.98, 0.02, { type_line: 'Basic Land — Swamp', color_identity: [] }, 'Lands'),
        cand('Snow-Covered Swamp', 0.5, 0.02, { type_line: 'Basic Snow Land — Swamp', color_identity: [] }, 'Lands'),
      ],
      deck,
      new Set(),
      'X',
    );
    expect(scored.map((s) => s.card.name)).toEqual(['Fine']);
  });

  it('files a card from a mixed EDHREC list under its own type', () => {
    const [s] = scoreEdhrec([cand('Herald', 0.3, 0.2, { type_line: 'Artifact' }, null)], deck, new Set(), 'X');
    expect(s.category).toBe('Utility Artifacts');
  });
});

describe('byCategory', () => {
  const s = (name: string, score: number, category?: string) => ({ card: card(name), oracleId: name, price: 1, finish: 'nonfoil' as const, tags: [], roles: [], owned: false, score, reason: '', category });

  it("groups in EDHREC's order, best first, leaving out empty categories", () => {
    const groups = byCategory([s('Land A', 1, 'Lands'), s('Enchant', 2, 'Enchantments'), s('Creature B', 1, 'Creatures'), s('Creature A', 3, 'Creatures'), s('Odd', 5)]);
    expect(groups.map((g) => g.category)).toEqual(['Creatures', 'Enchantments', 'Lands', 'Other']);
    expect(groups[0].items.map((i) => i.card.name)).toEqual(['Creature A', 'Creature B']);
  });

  it('puts the categories the deck is short of first, in the order given, then the rest in order', () => {
    const groups = byCategory([s('Land', 1, 'Lands'), s('Rock', 1, 'Mana Artifacts'), s('Clamp', 1, 'Utility Artifacts'), s('Creature', 1, 'Creatures')], ['Utility Artifacts', 'Mana Artifacts', 'Enchantments']);
    expect(groups.map((g) => g.category)).toEqual(['Utility Artifacts', 'Mana Artifacts', 'Creatures', 'Lands']);
  });
});
