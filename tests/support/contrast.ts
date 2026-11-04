/** WCAG contrast helpers for tests that check the colours a page really renders. */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parses a computed CSS colour: `rgb(...)`, `rgba(...)` or `color(srgb r g b [/ a])`. Anything else
 * (named, oklch, `color-mix` left unresolved) throws, so a test fails loudly instead of passing on a guess.
 */
export function parseColor(css: string): Rgba {
  const s = css.trim();
  const rgb = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: alpha(rgb[4]) };
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (srgb) return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: alpha(srgb[4]) };
  throw new Error(`Cannot parse colour: ${css}`);
}

function alpha(v: string | undefined): number {
  if (v === undefined) return 1;
  return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
}

/** Lays `top` over an opaque `under`. */
export function composite(top: Rgba, under: Rgba): Rgba {
  const a = top.a;
  return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 };
}

/**
 * The colour actually seen behind an element, from its background and its ancestors' backgrounds
 * (nearest first). Throws when nothing in the chain is opaque, since the browser's own canvas colour
 * is not something a test should guess.
 */
export function effectiveBackground(chain: string[]): Rgba {
  const layers = chain.map(parseColor);
  const base = layers.findIndex((c) => c.a >= 1);
  if (base < 0) throw new Error(`No opaque background in chain: ${chain.join(' | ')}`);
  return layers.slice(0, base).reduceRight((under, top) => composite(top, under), layers[base]);
}

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: Rgba) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

/** WCAG contrast ratio of two opaque colours, 1 to 21. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
