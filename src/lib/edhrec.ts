/**
 * EDHREC commander pages, parsed (recommendations spec, "Data source: EDHREC"). Pure functions; the
 * fetching lives in src/edhrec/. EDHREC's JSON is unofficial (ADR-005), so every field used is checked
 * and a page that doesn't look right is treated as missing.
 */

export interface EdhCard {
  name: string;
  /** EDHREC's type list for the card, or null when it only appeared in a mixed list (Top Cards…). */
  category: string | null;
  /** Share of this commander's decks that run the card, 0 to 1. */
  inclusion: number;
  /** How much more this commander's decks run it than other decks in its colors, −1 to 1. */
  synergy: number;
}

export interface EdhTheme {
  slug: string;
  label: string;
  count: number;
}

export interface EdhPage {
  /** Decks in the sample. */
  numDecks: number;
  cards: EdhCard[];
  themes: EdhTheme[];
  /** The average deck's card-type counts, e.g. { Land: 36, Creature: 24 }. */
  typeCounts: Record<string, number>;
}

export type ParsedPage = { kind: 'page'; page: EdhPage } | { kind: 'redirect'; path: string };

/** EDHREC's type lists, in the order it shows them. Mixed lists (New Cards, Top Cards…) aren't here. */
const TYPE_LISTS: Array<[tag: string, category: string]> = [
  ['creatures', 'Creatures'],
  ['instants', 'Instants'],
  ['sorceries', 'Sorceries'],
  ['utilityartifacts', 'Utility Artifacts'],
  ['manaartifacts', 'Mana Artifacts'],
  ['enchantments', 'Enchantments'],
  ['battles', 'Battles'],
  ['planeswalkers', 'Planeswalkers'],
  ['utilitylands', 'Utility Lands'],
  ['lands', 'Lands'],
];
export const CATEGORIES = TYPE_LISTS.map(([, c]) => c);
const CATEGORY_BY_TAG = new Map(TYPE_LISTS);

/**
 * The EDHREC slug for a commander, or a partner pair (both slugs in alphabetical order). Checked
 * against EDHREC on 2026-11-03: accents and quotes are dropped, apostrophes vanish, every other run
 * of non-letters becomes "-", and a double-faced commander uses its front face.
 */
export function commanderSlug(names: string[]): string {
  const one = (name: string) =>
    name
      .split(' // ')[0]
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return names.map(one).filter(Boolean).sort().join('-');
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REDIRECT = /^\/commanders\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Reads a commander page reply. Returns a redirect (EDHREC sends one for a partner pair in the other
 * order), the page, or null when the reply isn't a page this code understands or lists no cards.
 * Individual cards with a missing or odd field are skipped.
 */
export function parsePage(json: unknown): ParsedPage | null {
  if (!isObj(json)) return null;
  if (typeof json.redirect === 'string') return REDIRECT.test(json.redirect) ? { kind: 'redirect', path: json.redirect } : null;

  const dict = isObj(json.container) && isObj(json.container.json_dict) ? json.container.json_dict : null;
  if (!dict || !Array.isArray(dict.cardlists)) return null;

  const byName = new Map<string, EdhCard>();
  let biggestSample = 0;
  for (const list of dict.cardlists) {
    if (!isObj(list) || !Array.isArray(list.cardviews)) continue;
    const category = (typeof list.tag === 'string' && CATEGORY_BY_TAG.get(list.tag)) || null;
    for (const v of list.cardviews) {
      if (!isObj(v) || typeof v.name !== 'string' || !v.name.trim()) continue;
      const decks = num(v.num_decks);
      const potential = num(v.potential_decks);
      const synergy = num(v.synergy);
      if (decks == null || potential == null || potential <= 0 || synergy == null) continue;
      biggestSample = Math.max(biggestSample, potential);
      const seen = byName.get(v.name);
      if (seen) {
        seen.category ??= category;
        continue;
      }
      byName.set(v.name, { name: v.name, category, inclusion: clamp(decks / potential, 0, 1), synergy: clamp(synergy, -1, 1) });
    }
  }
  if (!byName.size) return null;

  const card = isObj(dict.card) ? dict.card : null;
  const panels = isObj(json.panels) ? json.panels : {};
  const themes = (Array.isArray(panels.taglinks) ? panels.taglinks : []).flatMap((t): EdhTheme[] =>
    isObj(t) && typeof t.slug === 'string' && SLUG.test(t.slug) && typeof t.value === 'string' && num(t.count) != null ? [{ slug: t.slug, label: t.value, count: t.count as number }] : [],
  );
  const pie = isObj(panels.piechart) && Array.isArray(panels.piechart.content) ? panels.piechart.content : [];
  const typeCounts: Record<string, number> = {};
  for (const p of pie) if (isObj(p) && typeof p.label === 'string' && num(p.value) != null) typeCounts[p.label] = p.value as number;

  return { kind: 'page', page: { numDecks: num(card?.num_decks) ?? biggestSample, cards: [...byName.values()], themes, typeCounts } };
}

/**
 * The category a suggested card is shown under: EDHREC's own type list when it named one, otherwise
 * from the card's front-face type line (a creature first, since artifact creatures are creatures).
 */
export function categoryFor(edhCategory: string | null, typeLine: string): string {
  if (edhCategory) return edhCategory;
  const t = typeLine.split(' // ')[0];
  if (/\bCreature\b/.test(t)) return 'Creatures';
  if (/\bLand\b/.test(t)) return 'Lands';
  if (/\bPlaneswalker\b/.test(t)) return 'Planeswalkers';
  if (/\bBattle\b/.test(t)) return 'Battles';
  if (/\bInstant\b/.test(t)) return 'Instants';
  if (/\bSorcery\b/.test(t)) return 'Sorceries';
  if (/\bArtifact\b/.test(t)) return 'Utility Artifacts';
  if (/\bEnchantment\b/.test(t)) return 'Enchantments';
  return 'Other';
}
