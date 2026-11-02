import { frontFace } from './cards';
import { ScryfallError, type ScryfallClient } from './client';
import type { ScryCard, ScryList } from './types';

/** The generic roles suggestions search for, by Scryfall Tagger tag. Shared with the candidate pool. */
export const CORE_ROLES: Array<{ label: string; query: string }> = [
  { label: 'ramp', query: 'otag:ramp' },
  { label: 'card draw', query: 'otag:card-advantage' },
  { label: 'removal', query: 'otag:removal' },
  { label: 'board wipe', query: 'otag:board-wipe' },
];

// Scryfall silently drops the end of a query past ~1,000 characters (checked 2026-11-02).
const MAX_QUERY_CHARS = 900;

// Quotes and backslashes would break the quoted name, so they are dropped.
const clean = (n: string) => n.replace(/["\\]/g, '').trim();
const nameQuery = (role: string, names: string[]) => `${role} (${names.map((n) => `!"${clean(n)}"`).join(' or ')})`;

/** Splits names into groups whose query stays within MAX_QUERY_CHARS for the longest role tag. */
function batches(names: string[]): string[][] {
  const longest = CORE_ROLES.reduce((a, r) => (r.query.length > a.length ? r.query : a), '');
  const out: string[][] = [];
  let current: string[] = [];
  for (const n of names) {
    if (current.length && nameQuery(longest, [...current, n]).length > MAX_QUERY_CHARS) {
      out.push(current);
      current = [];
    }
    current.push(n);
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * Which core roles each deck card fills, by Oracle ID: one search per role per batch of exact names
 * (front faces, since a double-faced card's full name doesn't match `!"…"`). Searches that fail are
 * skipped and `complete` is false; only when every search fails does this throw.
 */
export async function deckRoles(
  client: ScryfallClient,
  cards: Array<{ oracleId: string; name: string }>,
): Promise<{ roles: Map<string, string[]>; complete: boolean }> {
  const out = new Map<string, string[]>(cards.map((c) => [c.oracleId, []]));
  const byName = new Map(cards.map((c) => [clean(frontFace(c.name)).toLowerCase(), c.oracleId]));
  const groups = batches([...new Set(cards.map((c) => frontFace(c.name)))].filter((n) => clean(n)));
  const outcomes = await Promise.all(
    CORE_ROLES.flatMap((role) =>
      groups.map(async (names): Promise<unknown> => {
        let res: ScryList<ScryCard>;
        try {
          res = await client.get<ScryList<ScryCard>>(`/cards/search?${new URLSearchParams({ q: nameQuery(role.query, names) })}`);
        } catch (e) {
          if (e instanceof ScryfallError && e.status === 404) return null; // none of these cards has the role
          return e;
        }
        for (const c of res.data) {
          const id = c.oracle_id ?? c.card_faces?.[0]?.oracle_id;
          const known = (id && out.has(id) ? id : undefined) ?? byName.get(clean(frontFace(c.name)).toLowerCase());
          if (known && !out.get(known)!.includes(role.label)) out.get(known)!.push(role.label);
        }
        return null;
      }),
    ),
  );
  const errors = outcomes.filter((o) => o !== null);
  if (outcomes.length && errors.length === outcomes.length) throw errors[0];

  // Report roles in a stable order.
  const order = CORE_ROLES.map((r) => r.label);
  for (const [id, roles] of out) out.set(id, roles.sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  return { roles: out, complete: errors.length === 0 };
}
