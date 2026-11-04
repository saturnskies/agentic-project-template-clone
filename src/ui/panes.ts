import { h } from './dom';

type Pane = 'cards' | 'suggestions';

/**
 * The bar that switches between the card list and the suggestions panel below 70rem, where the two
 * share the screen. It only sets `data-pane` on the columns; the stylesheet shows the matching pane and,
 * from 70rem up, shows both side by side and hides the bar, so resizing or rotating needs no code here.
 * Neither pane is ever removed, so the suggestions keep refreshing while hidden. Each pane remembers its
 * own scroll position, and suggestions open with the panel at the top the first time.
 */
export function paneSwitch(columns: HTMLElement, panel: HTMLElement): HTMLElement {
  let pane: Pane = 'cards';
  const scrollAt: Record<Pane, number | null> = { cards: null, suggestions: null };
  columns.dataset.pane = pane;

  const choices: Array<{ pane: Pane; label: string }> = [
    { pane: 'cards', label: 'Cards' },
    { pane: 'suggestions', label: 'Suggestions' },
  ];
  const buttons = choices.map(({ pane: target, label }) => {
    const button = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(target === pane) }, label);
    button.addEventListener('click', () => {
      if (target === pane) return;
      scrollAt[pane] = window.scrollY;
      pane = target;
      columns.dataset.pane = pane;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(choices[i].pane === pane)));
      // Read after the switch: the page is a different height now.
      const top = scrollAt[pane] ?? Math.max(0, panel.getBoundingClientRect().top + window.scrollY - 8);
      window.scrollTo(0, top);
    });
    return button;
  });

  return h('div', { class: 'pane-bar' }, h('div', { class: 'segmented', role: 'group', 'aria-label': 'Show' }, ...buttons));
}
