import { h } from './dom';

/** A row of toggle buttons where exactly one is pressed (`aria-pressed`), shared by the suggestions panel and the Life Counter. */
export function segmented<T extends string>(label: string, options: Array<{ id: T; label: string }>, current: T, onPick: (id: T) => void): HTMLElement {
  return h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': label },
    ...options.map((o) => {
      const b = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(o.id === current) }, o.label);
      b.addEventListener('click', () => onPick(o.id));
      return b;
    }),
  );
}
