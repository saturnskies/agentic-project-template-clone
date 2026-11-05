/** Tiny element builder. Strings become text nodes, so card data from Scryfall is never parsed as HTML. */

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

/**
 * A row of buttons where one is pressed (`aria-pressed`): List/Grid, Upgrades/Swaps/Cheaper and the like. Clicking
 * marks the clicked button pressed before calling `onPick`, so callers that do not redraw stay correct.
 */
export function segmented<T extends string>(label: string, options: Array<{ id: T; label: string }>, current: T, onPick: (id: T) => void, extraClass = ''): HTMLElement {
  const buttons = options.map((o) => h('button', { type: 'button', class: 'segment', 'aria-pressed': String(o.id === current) }, o.label));
  buttons.forEach((b, i) =>
    b.addEventListener('click', () => {
      buttons.forEach((other) => other.setAttribute('aria-pressed', String(other === b)));
      onPick(options[i].id);
    }),
  );
  return h('div', { class: `segmented${extraClass ? ` ${extraClass}` : ''}`, role: 'group', 'aria-label': label }, ...buttons);
}

