/**
 * What a deck is about, worked out from its own cards (v1 spec, "Deck profile"): the commander's
 * colors, the main creature type, and themes found in rules text.
 */

export interface ProfileCard {
  name: string;
  typeLine: string;
  oracleText: string;
  isCommander: boolean;
}

export interface Theme {
  id: string;
  /** Shown in reasons, e.g. "death triggers". */
  label: string;
  /** Matches a card's rules text. */
  test: RegExp;
  /** The same idea as a Scryfall search, for finding more cards with it. */
  query: string;
}

export const THEMES: Theme[] = [
  { id: 'sacrifice', label: 'sacrifice', test: /sacrifice (a|another) creature/i, query: 'o:/sacrifice (a|another) creature/' },
  { id: 'death-triggers', label: 'death triggers', test: /whenever .*\bdies\b/i, query: 'o:/whenever .* dies/' },
  { id: 'lifegain', label: 'lifegain', test: /\blifelink\b|gain .*\blife\b/i, query: '(keyword:lifelink or o:/gain .* life/)' },
  { id: 'tokens', label: 'tokens', test: /create .*\btokens?\b/i, query: 'o:/create .* token/' },
  { id: 'counters', label: '+1/+1 counters', test: /\+1\/\+1 counter/i, query: 'o:"+1/+1 counter"' },
  { id: 'graveyard', label: 'graveyard', test: /from your graveyard/i, query: 'o:"from your graveyard"' },
];

export const TRIBE_MIN = 8;
export const THEME_MIN = 5;

export interface DeckProfile {
  colorIdentity: string[];
  tribe: string | null;
  themes: Theme[];
}

/** Creature subtypes on a type line ("Creature — Vampire Knight" → Vampire, Knight); front face only. */
export function creatureTypes(typeLine: string): string[] {
  const front = typeLine.split(' // ')[0];
  const [types, subtypes] = front.split(' — ');
  if (!subtypes || !/\bCreature\b/.test(types)) return [];
  return subtypes.trim().split(/\s+/);
}

export function deckProfile(cards: ProfileCard[], commanderIdentity: string[]): DeckProfile {
  const counts = new Map<string, number>();
  for (const c of cards) {
    if (c.isCommander) continue;
    for (const t of new Set(creatureTypes(c.typeLine))) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const commanderTypes = new Set(cards.filter((c) => c.isCommander).flatMap((c) => creatureTypes(c.typeLine)));
  const best = [...counts.entries()]
    .filter(([, n]) => n >= TRIBE_MIN)
    .sort(([a, na], [b, nb]) => nb - na || Number(commanderTypes.has(b)) - Number(commanderTypes.has(a)) || a.localeCompare(b))[0];

  const themes = THEMES.filter((t) => cards.filter((c) => t.test.test(c.oracleText)).length >= THEME_MIN);
  return { colorIdentity: [...commanderIdentity], tribe: best?.[0] ?? null, themes };
}
