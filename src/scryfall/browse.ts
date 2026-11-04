import { sortParams, type SortKey } from '../lib/browse';
import { ScryfallError, type ScryfallClient } from './client';
import type { ScryCard, ScryList } from './types';

export interface SearchPage {
  cards: ScryCard[];
  /** Every match across all pages. */
  total: number;
  hasMore: boolean;
  /** Terms Scryfall ignored; the cards then don't reflect them. */
  warnings: string[];
}

/**
 * One page (175 cards) of a Scryfall search, one printing per card, through the shared client (queue,
 * retry, cache). No match (404) is an empty page; a bad query (400) and every other failure throw.
 */
export async function searchCards(client: ScryfallClient, q: string, sort: SortKey, descending: boolean, page: number): Promise<SearchPage> {
  const { order, dir } = sortParams(sort, descending);
  try {
    const res = await client.get<ScryList<ScryCard>>(`/cards/search?${new URLSearchParams({ q, order, dir, unique: 'cards', page: String(page) })}`);
    return { cards: res.data, total: res.total_cards ?? res.data.length, hasMore: res.has_more === true, warnings: res.warnings ?? [] };
  } catch (e) {
    if (e instanceof ScryfallError && e.status === 404) return { cards: [], total: 0, hasMore: false, warnings: [] };
    throw e;
  }
}
