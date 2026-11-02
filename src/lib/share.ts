import type { CardRef, Deck, DeckEntry } from './deck';

/**
 * Share links carry a whole deck in the URL hash (`#d=<code>`), so no server is needed (v1 spec,
 * "Share links"). The code is compact text, deflated with the browser's CompressionStream and
 * base64url-encoded. Owned cards, totals and the local deck id are never included.
 *
 * Text format, one item per line:
 *   swapsmith1
 *   <deck name>
 *   <commander oracle id>|<commander printing id or empty>|<commander name>
 *   <qty>|<oracle id>|<printing id or empty>|<card name>     (one line per card)
 *
 * A link can come from anyone, so decoding treats it as untrusted: every field is checked and the
 * inflated size is capped before anything is parsed.
 */

export const SHARE_PREFIX = 'swapsmith1';

export interface SharedDeck {
  name: string;
  commander: CardRef;
  commanderPrintingId?: string;
  cards: DeckEntry[];
}

export class ShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareError';
  }
}

const MAX_INFLATED_BYTES = 64 * 1024;
const MAX_CARDS = 250;
const MAX_NAME = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

export async function encodeDeck(deck: Deck): Promise<string> {
  const lines = [
    SHARE_PREFIX,
    oneLine(deck.name),
    `${deck.commander.oracleId}|${deck.commanderPrintingId ?? ''}|${oneLine(deck.commander.name)}`,
    ...deck.cards.map((e) => `${e.qty}|${e.card.oracleId}|${e.printingId ?? ''}|${oneLine(e.card.name)}`),
  ];
  const stream = new Blob([lines.join('\n')]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function decodeDeck(code: string): Promise<SharedDeck> {
  const text = await inflate(fromBase64Url(code));
  const lines = text.split('\n');
  if (lines[0] !== SHARE_PREFIX) throw new ShareError('This link is from an unknown version of Swapsmith.');
  if (lines.length < 3) throw new ShareError('This share link is incomplete.');
  if (lines.length - 3 > MAX_CARDS) throw new ShareError('This share link has too many cards.');

  const name = checkName(lines[1], 'deck name', true);
  const [cid, cprint, cname, ...extra] = lines[2].split('|');
  if (extra.length) throw new ShareError('The commander line is malformed.');
  const shared: SharedDeck = { name, commander: { oracleId: checkId(cid), name: checkName(cname, 'commander name') }, cards: [] };
  if (cprint) shared.commanderPrintingId = checkId(cprint);

  for (const line of lines.slice(3)) {
    const [qty, oid, print, cardName, ...rest] = line.split('|');
    if (rest.length || cardName === undefined) throw new ShareError('A card line is malformed.');
    const n = Number(qty);
    if (!/^\d{1,3}$/.test(qty) || n < 1 || n > 999) throw new ShareError('A card has an impossible quantity.');
    const entry: DeckEntry = { card: { oracleId: checkId(oid), name: checkName(cardName, 'card name') }, qty: n };
    if (print) entry.printingId = checkId(print);
    shared.cards.push(entry);
  }
  return shared;
}

function checkId(s: string | undefined): string {
  if (!s || !UUID.test(s)) throw new ShareError('A card ID in this link is malformed.');
  return s;
}

function checkName(s: string | undefined, what: string, allowEmpty = false): string {
  if (s === undefined || (!allowEmpty && !s.trim())) throw new ShareError(`A ${what} is missing.`);
  if (s.length > MAX_NAME || CONTROL.test(s)) throw new ShareError(`A ${what} in this link is malformed.`);
  return s;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): Uint8Array {
  if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) throw new ShareError('This share link is damaged.');
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    throw new ShareError('This share link is damaged.');
  }
}

/** Inflates, stopping as soon as the output passes the cap, so a tiny link can't expand into megabytes. */
async function inflate(bytes: Uint8Array): Promise<string> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_INFLATED_BYTES) {
        await reader.cancel();
        throw new ShareError('This share link is too large.');
      }
      parts.push(value);
    }
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError('This share link is damaged.');
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(all);
  } catch {
    throw new ShareError('This share link is damaged.');
  }
}
