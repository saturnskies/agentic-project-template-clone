import { describe, expect, it } from 'vitest';
import type { Deck } from '../../src/lib/deck';
import { decodeDeck, encodeDeck, ShareError, SHARE_PREFIX } from '../../src/lib/share';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const deck: Deck = {
  id: 'local-id',
  name: 'Edgar Vampires',
  format: 'commander',
  commander: { oracleId: id(1), name: 'Edgar Markov' },
  commanderPrintingId: id(900),
  cards: [
    { card: { oracleId: id(2), name: 'Bloodline Keeper // Lord of Lineage' }, qty: 1 },
    { card: { oracleId: id(3), name: 'Sol Ring' }, qty: 1, printingId: id(901) },
    { card: { oracleId: id(4), name: 'Swamp' }, qty: 8 },
  ],
  updatedAt: '2026-11-02T00:00:00.000Z',
  summary: { total: 36.35, unpriced: 0, count: 13, toBuy: 6.39 },
};

/** Packs raw text the way encodeDeck does, to build hostile links. */
async function pack(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('share links', () => {
  it('round-trips name, commander, printings, cards and quantities', async () => {
    const shared = await decodeDeck(await encodeDeck(deck));
    expect(shared).toEqual({
      name: 'Edgar Vampires',
      commander: { oracleId: id(1), name: 'Edgar Markov' },
      commanderPrintingId: id(900),
      cards: deck.cards,
    });
  });

  it('leaves out local details: the deck id, totals, the bracket pick and anything about owned cards', async () => {
    const code = await encodeDeck(deck);
    const shared = await decodeDeck(code);
    expect(shared).not.toHaveProperty('id');
    expect(shared).not.toHaveProperty('summary');
    expect(await decodeDeck(await encodeDeck({ ...deck, bracket: 4 }))).not.toHaveProperty('bracket');
    expect(JSON.stringify(shared)).not.toContain('6.39');
  });

  it('keeps a 100-card deck link short enough to paste anywhere', async () => {
    const big: Deck = { ...deck, cards: Array.from({ length: 77 }, (_, i) => ({ card: { oracleId: id(100 + i), name: `Card Number ${i} of the Long Name` }, qty: 1 })) };
    const code = await encodeDeck(big);
    expect(code.length).toBeLessThan(4000);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('turns line breaks in a deck name into spaces', async () => {
    const shared = await decodeDeck(await encodeDeck({ ...deck, name: 'Two\nlines' }));
    expect(shared.name).toBe('Two lines');
  });

  it('rejects text that is not a share code', async () => {
    await expect(decodeDeck('not*base64!')).rejects.toBeInstanceOf(ShareError);
    await expect(decodeDeck('')).rejects.toBeInstanceOf(ShareError);
    await expect(decodeDeck('AAAA')).rejects.toBeInstanceOf(ShareError); // valid base64, not deflate
  });

  it('rejects a link from an unknown version', async () => {
    await expect(decodeDeck(await pack(`swapsmith9\nX\n${id(1)}||Edgar Markov`))).rejects.toThrow('version');
  });

  it('rejects malformed lines: bad quantities, IDs, names or too many cards', async () => {
    const head = `${SHARE_PREFIX}\nDeck\n${id(1)}||Edgar Markov\n`;
    await expect(decodeDeck(await pack(`${head}0|${id(2)}||Sol Ring`))).rejects.toBeInstanceOf(ShareError);
    await expect(decodeDeck(await pack(`${head}1000|${id(2)}||Sol Ring`))).rejects.toBeInstanceOf(ShareError);
    await expect(decodeDeck(await pack(`${head}1|not-a-uuid||Sol Ring`))).rejects.toBeInstanceOf(ShareError);
    await expect(decodeDeck(await pack(`${head}1|${id(2)}|bad|Sol Ring`))).rejects.toBeInstanceOf(ShareError);
    await expect(decodeDeck(await pack(`${head}1|${id(2)}||`))).rejects.toBeInstanceOf(ShareError);
    await expect(decodeDeck(await pack(`${head}1|${id(2)}||Sol\u0007Ring`))).rejects.toBeInstanceOf(ShareError);
    await expect(decodeDeck(await pack(`${head}1|${id(2)}||${'x'.repeat(201)}`))).rejects.toBeInstanceOf(ShareError);
    const many = Array.from({ length: 251 }, (_, i) => `1|${id(10 + i)}||Card ${i}`).join('\n');
    await expect(decodeDeck(await pack(head + many))).rejects.toBeInstanceOf(ShareError);
    await expect(decodeDeck(await pack(`${SHARE_PREFIX}\nDeck\nnot-a-uuid||Edgar Markov`))).rejects.toBeInstanceOf(ShareError);
  });

  it('refuses a link that would expand into a huge amount of data', async () => {
    // Highly compressible: a few KB of link that inflates far past the 64 KB cap.
    const bomb = await pack(`${SHARE_PREFIX}\nDeck\n${id(1)}||Edgar\n${'a'.repeat(2_000_000)}`);
    expect(bomb.length).toBeLessThan(10_000);
    await expect(decodeDeck(bomb)).rejects.toThrow('too large');
  });
});
