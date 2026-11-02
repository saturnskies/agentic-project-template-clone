import { mergeEntries, newDeckId, type Deck, type DeckEntry } from '../lib/deck';
import type { ParsedLine } from '../lib/parse';
import { bestPrice, cheapestPrinting, tcgplayerUrl, type Finish } from '../lib/price';
import { cardById, cardsByOracleId, fuzzyCard, lookupEntries, looseName, matchesName, printings, printingsForMany } from './cards';
import type { ScryfallClient } from './client';
import type { ScryCard } from './types';

export interface ResolvedLine {
  entry: ParsedLine;
  /** The matched card, or null when the name didn't match. */
  card: ScryCard | null;
  /** Scryfall's "did you mean" for an unmatched name, or null. */
  suggestion: ScryCard | null;
  /** Set when the typed name is an alternate printed name, e.g. "Panther Idol" for Mind's Eye. */
  aliasOf?: string;
}

/** Matches pasted lines to cards and finds suggestions for the ones that don't match. */
export async function resolveList(client: ScryfallClient, entries: ParsedLine[]): Promise<ResolvedLine[]> {
  const cards = await lookupEntries(client, entries);
  // All "did you mean" lookups are queued at once; the client spaces them out.
  return Promise.all(
    entries.map(async (entry, i): Promise<ResolvedLine> => {
      const card = cards[i];
      if (card) return { entry, card, suggestion: null, ...alias(card, entry.name) };
      const suggestion = await fuzzyCard(client, entry.name);
      // A "did you mean" that is exactly what was typed (or its alternate name) needs no question.
      if (suggestion && matchesName(suggestion, entry.name)) return { entry, card: suggestion, suggestion: null, ...alias(suggestion, entry.name) };
      return { entry, card: null, suggestion };
    }),
  );
}

const alias = (card: ScryCard, typed: string) =>
  card.flavor_name && looseName(card.flavor_name) === looseName(typed) && looseName(card.name) !== looseName(typed) ? { aliasOf: card.name } : {};

export const oracleIdOf = (c: ScryCard) => c.oracle_id ?? c.card_faces?.[0]?.oracle_id ?? c.id;

const typeLineOf = (c: ScryCard) => c.type_line ?? c.card_faces?.map((f) => f.type_line).join(' // ') ?? '';

export const isLegendaryCreature = (c: ScryCard) => /\bLegendary\b/.test(typeLineOf(c).split(' // ')[0]) && /\bCreature\b/.test(typeLineOf(c).split(' // ')[0]);

/** Who could be the commander: lines marked as commander, else every legendary creature in the list. */
export function commanderCandidates(lines: Array<{ entry: ParsedLine; card: ScryCard }>): ScryCard[] {
  const marked = lines.filter((l) => l.entry.isCommander).map((l) => l.card);
  const pool = marked.length ? marked : lines.filter((l) => isLegendaryCreature(l.card)).map((l) => l.card);
  const seen = new Set<string>();
  return pool.filter((c) => !seen.has(oracleIdOf(c)) && seen.add(oracleIdOf(c)));
}

/** Builds a deck from matched lines; a line with a pasted set and number keeps that printing. */
export function buildDeck(name: string, lines: Array<{ entry: ParsedLine; card: ScryCard }>, commander: ScryCard, now = new Date()): Deck {
  const commanderId = oracleIdOf(commander);
  const entries: DeckEntry[] = [];
  let commanderSkipped = false;
  for (const { entry, card } of lines) {
    const id = oracleIdOf(card);
    if (id === commanderId && !commanderSkipped) {
      commanderSkipped = true;
      if (entry.qty === 1) continue;
      entries.push({ card: { oracleId: id, name: card.name }, qty: entry.qty - 1 });
      continue;
    }
    const e: DeckEntry = { card: { oracleId: id, name: card.name }, qty: entry.qty };
    if (entry.set && entry.number) e.printingId = card.id;
    entries.push(e);
  }
  return {
    id: newDeckId(),
    name: name.trim() || `${commander.name} deck`,
    format: 'commander',
    commander: { oracleId: commanderId, name: commander.name },
    cards: mergeEntries(entries),
    updatedAt: now.toISOString(),
  };
}

export interface PricedCard {
  entry: DeckEntry;
  isCommander: boolean;
  /** The printing that is priced: the pinned one, else the cheapest. Null if Scryfall has no such card. */
  card: ScryCard | null;
  typeLine: string;
  price: number | null;
  finish: Finish | null;
  url: string | null;
  /** True when Scryfall couldn't be reached for this card's printings; reloading may fix it. */
  failed?: boolean;
}

/** Prices every card in a deck at its pinned or cheapest printing. Reports progress per card. */
export function priceDeck(client: ScryfallClient, deck: Deck, onProgress?: (done: number, total: number) => void): Promise<PricedCard[]> {
  return priceEntries(
    client,
    [{ entry: { card: deck.commander, qty: 1 }, isCommander: true }, ...deck.cards.map((entry) => ({ entry, isCommander: false }))],
    onProgress,
  );
}

/**
 * Prices deck entries. `known` holds card objects already fetched (say, a card just added by name),
 * which saves looking them up again.
 */
export async function priceEntries(
  client: ScryfallClient,
  all: Array<{ entry: DeckEntry; isCommander: boolean }>,
  onProgress: (done: number, total: number) => void = () => {},
  known: Map<string, ScryCard> = new Map(),
): Promise<PricedCard[]> {
  const missing = all.map((x) => x.entry.card.oracleId).filter((id) => !known.has(id));
  const base = new Map([...known, ...(await cardsByOracleId(client, missing))]);
  let done = 0;
  onProgress(0, all.length);

  // Non-basic cards share a few batched searches; each basic land gets its own price-filtered one.
  const isBasic = (id: string) => /\bBasic\b/.test(base.get(id)?.type_line ?? '');
  const ids = [...base.keys()];
  const shared = printingsForMany(client, ids.filter((id) => !isBasic(id)));
  const printingsOf = async (id: string): Promise<ScryCard[]> => {
    if (isBasic(id)) return printings(client, id);
    const found = (await shared).get(id);
    if (!found) throw new Error('printings unavailable');
    return found;
  };

  return Promise.all(
    all.map(async ({ entry, isCommander }): Promise<PricedCard> => {
      const known = base.get(entry.card.oracleId) ?? null;
      let chosen: ScryCard | null = known;
      let price: number | null = null;
      let finish: Finish | null = null;

      let failed = false;
      if (known) {
        try {
          const prints = await printingsOf(entry.card.oracleId);
          const pinned = entry.printingId
            ? (prints.find((p) => p.id === entry.printingId) ?? (await cardById(client, entry.printingId)))
            : null;
          if (pinned) {
            chosen = pinned;
            const p = bestPrice(pinned);
            if (p) ({ price, finish } = p);
          } else {
            const cheapest = cheapestPrinting(prints);
            if (cheapest) ({ card: chosen, price, finish } = cheapest);
          }
        } catch {
          // Keep the card in the list, unpriced, rather than failing the whole deck.
          failed = true;
        }
      }

      done += 1;
      onProgress(done, all.length);
      const priced: PricedCard = { entry, isCommander, card: chosen, typeLine: chosen ? typeLineOf(chosen) : '', price, finish, url: chosen ? tcgplayerUrl(chosen, finish ?? 'nonfoil') : null };
      if (failed) priced.failed = true;
      return priced;
    }),
  );
}
