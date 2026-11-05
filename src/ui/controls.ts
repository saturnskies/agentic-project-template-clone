import { h } from './dom';

/**
 * A row of toggle buttons where exactly one is pressed (`aria-pressed`), shared by the suggestions panel, the deck
 * view's List/Grid, the Cards | Suggestions bar and the Life Counter. Clicking marks the clicked button pressed
 * before calling `onPick`, so callers that do not redraw stay correct.
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
