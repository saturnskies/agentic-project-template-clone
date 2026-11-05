import { segmented } from './controls';
import { h } from './dom';

type Pane = 'cards' | 'suggestions';

/** Where a suggestions search is, as the Suggestions tab shows it while you are on the Cards pane. */
export type SearchState = 'idle' | 'searching' | 'ready' | 'failed';

const BADGE: Record<SearchState, string> = { idle: '', searching: 'Searching', ready: 'Ready', failed: 'Failed' };
const SPOKEN: Record<SearchState, string> = {
  idle: '',
  searching: 'Searching Scryfall for suggestions…',
  ready: 'Suggestions are ready.',
  failed: "Couldn't search Scryfall.",
};

/**
 * The bar that switches between the card list and the suggestions panel below 70rem, where the two
 * share the screen. It only sets `data-pane` on the columns; the stylesheet shows the matching pane and,
 * from 70rem up, shows both side by side and hides the bar, so resizing or rotating needs no code here.
 * Neither pane is ever removed, so the suggestions keep refreshing while hidden. Each pane remembers its
 * own scroll position, and suggestions open with the panel at the top the first time.
 *
 * `setSearch` puts the search state on the Suggestions tab as a small badge, so a search started there is
 * visible from the Cards pane. It shows only while you are on Cards: the panel has its own status, and
 * opening it clears Ready and Failed (seen). The badge is decoration (`aria-hidden`), so the tab keeps its
 * name; a hidden live region announces the change instead.
 */
export function paneSwitch(columns: HTMLElement, panel: HTMLElement): { root: HTMLElement; setSearch(state: SearchState): void } {
  let pane: Pane = 'cards';
  let search: SearchState = 'idle';
  const scrollAt: Record<Pane, number | null> = { cards: null, suggestions: null };
  columns.dataset.pane = pane;

  const badge = h('span', { class: 'pane-badge', 'aria-hidden': 'true' });
  const live = h('span', { class: 'visually-hidden pane-live', role: 'status' });
  const render = () => {
    const show = pane === 'cards' && search !== 'idle';
    badge.textContent = show ? BADGE[search] : '';
    badge.dataset.state = show ? search : '';
    live.textContent = show ? SPOKEN[search] : '';
  };

  const switcher = segmented<Pane>(
    'Show',
    [{ id: 'cards', label: 'Cards' }, { id: 'suggestions', label: 'Suggestions' }],
    pane,
    (target) => {
      if (target === pane) return;
      scrollAt[pane] = window.scrollY;
      pane = target;
      columns.dataset.pane = pane;
      if (pane === 'suggestions' && search !== 'searching') search = 'idle'; // Ready and Failed have been seen
      render();
      // Read after the switch: the page is a different height now.
      const top = scrollAt[pane] ?? Math.max(0, panel.getBoundingClientRect().top + window.scrollY - 8);
      window.scrollTo(0, top);
    },
  );
  switcher.lastElementChild!.append(badge); // the Suggestions tab carries the search badge

  return {
    root: h('div', { class: 'pane-bar' }, switcher, live),
    setSearch(state) {
      // Finishing while you are already looking at the panel needs no badge: it shows its own result.
      search = pane === 'suggestions' && (state === 'ready' || state === 'failed') ? 'idle' : state;
      render();
    },
  };
}
