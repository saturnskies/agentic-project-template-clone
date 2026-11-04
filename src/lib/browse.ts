/** Browse tab logic that needs no browser: turning the search form into a Scryfall query, and sorting. */

export interface Filters {
  /** Words that must all appear in the card name. */
  name: string;
  /** Only cards legal in Commander (`legal:commander`). */
  commanderLegal: boolean;
  /** Raw Scryfall syntax, ANDed with everything else. */
  advanced: string;
}

/** Scryfall silently drops the end of a query past ~1,000 characters; we refuse to send more than this. */
export const MAX_QUERY = 900;

export type QueryResult = { ok: true; q: string } | { ok: false; field: 'advanced' | 'form'; error: string };

const quote = (word: string) => `"${word.replace(/[\\"]/g, '\\$&')}"`;

/** True when every "(" has its ")" once quoted text and /regex/ text are set aside. */
function balanced(text: string): boolean {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    } else if (c === '/' && i > 0 && ':=<>'.includes(text[i - 1])) {
      i += 1;
      while (i < text.length && text[i] !== '/') i += text[i] === '\\' ? 2 : 1;
    } else if (c === '(') depth += 1;
    else if (c === ')' && (depth -= 1) < 0) return false;
  }
  return depth === 0;
}

/** The Scryfall query for the form, or the reason it can't be sent. Nothing is ever truncated. */
export function buildQuery(f: Filters): QueryResult {
  const advanced = f.advanced.trim();
  if (advanced && !balanced(advanced)) {
    return { ok: false, field: 'advanced', error: 'The advanced box has unbalanced parentheses. Close every ( with a ).' };
  }
  const parts: string[] = [];
  if (f.commanderLegal) parts.push('legal:commander');
  for (const word of f.name.split(/\s+/).filter(Boolean)) parts.push(`name:${quote(word)}`);
  if (advanced) parts.push(`(${advanced})`);
  if (!parts.length) return { ok: false, field: 'form', error: 'Add at least one filter, or turn Commander-legal on.' };
  const q = parts.join(' ');
  if (q.length > MAX_QUERY) {
    const where = advanced ? 'Shorten the advanced box or drop a filter.' : 'Drop a filter.';
    return { ok: false, field: advanced ? 'advanced' : 'form', error: `This search is too long (${q.length} of ${MAX_QUERY} characters). ${where}` };
  }
  return { ok: true, q };
}

export type SortKey = 'popularity' | 'price' | 'name' | 'mana' | 'released';

/** The sorts offered, with Scryfall's `order` and the direction that suits each (popularity 1 is the best). */
export const SORTS: Array<{ id: SortKey; label: string; order: string; descending: boolean }> = [
  { id: 'popularity', label: 'Popularity', order: 'edhrec', descending: false },
  { id: 'price', label: 'Price', order: 'usd', descending: true },
  { id: 'name', label: 'Name', order: 'name', descending: false },
  { id: 'mana', label: 'Mana value', order: 'cmc', descending: false },
  { id: 'released', label: 'Release date', order: 'released', descending: true },
];

export function sortParams(id: SortKey, descending: boolean): { order: string; dir: 'asc' | 'desc' } {
  const s = SORTS.find((x) => x.id === id) ?? SORTS[0];
  return { order: s.order, dir: descending ? 'desc' : 'asc' };
}
