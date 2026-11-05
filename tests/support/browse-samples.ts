import type { Filters } from '../../src/lib/browse';

const CRYPT = 'legal:commander name:"crypt"';
const SOL = 'legal:commander name:"sol"';

/**
 * One real search per Browse filter, each narrowed by a name word so the replies stay small. The form must
 * build `q` from `filters`; the recorder saves Scryfall's real answer; the live test checks Scryfall accepts
 * every term without a warning (an unknown term is silently dropped, which would make the filter a no-op).
 */
export const SAMPLES: Array<{ id: string; filters: Partial<Filters>; q: string }> = [
  { id: 'set', filters: { name: 'crypt', set: 'rtr' }, q: `${CRYPT} set:rtr` },
  { id: 'type', filters: { name: 'sol', type: 'legendary creature' }, q: `${SOL} t:legendary t:creature` },
  { id: 'tribe', filters: { name: 'sol', tribe: 'elemental' }, q: `${SOL} t:creature t:elemental` },
  { id: 'keyword', filters: { name: 'sol', keyword: 'flying' }, q: `${SOL} kw:"flying"` },
  { id: 'keyword-two-words', filters: { name: 'sol', keyword: 'first strike' }, q: `${SOL} kw:"first strike"` },
  { id: 'role', filters: { name: 'sol', role: 'otag:ramp' }, q: `${SOL} otag:ramp` },
  { id: 'tokens', filters: { name: 'sol', role: 'o:/create .* token/' }, q: `${SOL} o:/create .* token/` },
  { id: 'colors-within', filters: { name: 'crypt', colors: ['B'] }, q: `${CRYPT} id<=b` },
  { id: 'colorless', filters: { name: 'crypt', colors: ['C'] }, q: `${CRYPT} id=c` },
  { id: 'colors-includes', filters: { name: 'crypt', colors: ['R', 'B'], colorMode: 'includes' }, q: `${CRYPT} id>=br` },
  { id: 'mana-value', filters: { name: 'crypt', mvMin: '3', mvMax: '4' }, q: `${CRYPT} mv>=3 mv<=4` },
  { id: 'rarity', filters: { name: 'crypt', rarities: ['rare', 'mythic'] }, q: `${CRYPT} (r:r or r:m)` },
  { id: 'price', filters: { name: 'crypt', priceMin: '1', priceMax: '5' }, q: `${CRYPT} usd>=1 usd<=5` },
];

/** A search whose results include basic lands, which a deck may hold many of. */
export const BASIC_SWAMP_QUERY = 'legal:commander name:"swamp" t:basic';
/** Typed into the commander search of New deck…: a mono-green commander (a black card is off-color for her) and one that plays black. */
export const COMMANDER_TYPED = { green: 'selvala', black: 'edgar markov' } as const;
/** Typed to pick, as commander, a card that was opened from the results. */
export const SOLPHIM_TYPED = 'solphim';
