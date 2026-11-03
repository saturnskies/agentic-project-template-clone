/**
 * Gaps (recommendations spec, "Upgrades layout"): card types the deck runs clearly fewer of than
 * EDHREC's average deck for the commander, so Upgrades can show those categories first.
 */

/** EDHREC's average-deck labels, in the order a card's main type is decided: creatures first, then lands. */
const TYPES: Array<[type: string, plural: string, categories: string[]]> = [
  ['Creature', 'Creatures', ['Creatures']],
  ['Land', 'Lands', ['Utility Lands', 'Lands']],
  ['Planeswalker', 'Planeswalkers', ['Planeswalkers']],
  ['Battle', 'Battles', ['Battles']],
  ['Instant', 'Instants', ['Instants']],
  ['Sorcery', 'Sorceries', ['Sorceries']],
  ['Artifact', 'Artifacts', ['Utility Artifacts', 'Mana Artifacts']],
  ['Enchantment', 'Enchantments', ['Enchantments']],
];

/** A deck this many cards short of the average shows a gap. */
export const GAP_MIN = 3;

export interface TypeGap {
  type: string;
  label: string;
  have: number;
  typical: number;
}

/** A card's main type on its front face, as EDHREC's average deck counts it: an artifact creature is a creature, an artifact land a land. */
export const mainType = (typeLine: string): string | null => {
  const front = typeLine.split(' // ')[0];
  return TYPES.find(([t]) => new RegExp(`\\b${t}\\b`).test(front))?.[0] ?? null;
};

/** "Artifact" → "Artifacts". */
export const typePlural = (type: string): string => TYPES.find(([t]) => t === type)?.[1] ?? type;

/** Cards per main type, with copies, commander left out. */
export function deckTypeCounts(lines: Array<{ typeLine: string; qty: number; isCommander: boolean }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    if (l.isCommander) continue;
    const type = mainType(l.typeLine);
    if (type) out[type] = (out[type] ?? 0) + l.qty;
  }
  return out;
}

/** Types the deck runs at least GAP_MIN fewer of than the (rounded) average, biggest gap first. */
export function typeGaps(have: Record<string, number>, average: Record<string, number>): TypeGap[] {
  return TYPES.flatMap(([type, label]) => {
    const avg = average[type];
    if (typeof avg !== 'number' || !Number.isFinite(avg) || avg <= 0) return [];
    const typical = Math.round(avg);
    const n = have[type] ?? 0;
    return typical - n >= GAP_MIN ? [{ type, label, have: n, typical }] : [];
  }).sort((a, b) => b.typical - b.have - (a.typical - a.have));
}

/** The Upgrades categories that hold each gap's type, in the gaps' order. */
export const gapCategories = (gaps: Array<{ type: string }>): string[] => gaps.flatMap((g) => TYPES.find(([t]) => t === g.type)?.[2] ?? []);
