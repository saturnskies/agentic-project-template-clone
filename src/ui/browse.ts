import { buildQuery, SORTS, type SortKey } from '../lib/browse';
import { cardImage } from '../lib/groups';
import { isOwned } from '../lib/owned';
import { bestPrice } from '../lib/price';
import { searchCards, type SearchPage } from '../scryfall/browse';
import { ScryfallError } from '../scryfall/client';
import { oracleIdOf } from '../scryfall/resolve';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { segmented } from './controls';
import { h, usd } from './dom';

/**
 * The Browse tab: search every card with a few filters and look through the results. The container stays
 * mounted while another tab shows, so the text, results and scroll survive a visit elsewhere.
 */
export function renderBrowse(view: HTMLElement, ctx: AppContext): void {
  let sort: SortKey = 'popularity';
  let descending = SORTS[0].descending;
  /** The search most recently started; replies from an older one are dropped. */
  let run = 0;
  /** The search being waited on (query and sort), so pressing Search twice asks once. */
  let waiting = '';
  /** The query last sent, which a change of sort repeats. */
  let lastQuery: string | null = null;
  /** The results on screen: what they were searched with, and where the next page starts. */
  let shown: { q: string; sort: SortKey; descending: boolean; page: number; hasMore: boolean; total: number } | null = null;
  /** A new search is waiting (the old results stay up meanwhile), or the next page is. */
  let searching = false;
  let loadingMore = false;

  const name = h('input', { id: 'browse-name', type: 'text', autocomplete: 'off', placeholder: 'e.g. sol ring' });
  const legal = h('input', { id: 'browse-legal', type: 'checkbox', checked: true });
  const advanced = h('input', { id: 'browse-advanced', type: 'text', autocomplete: 'off', placeholder: 'e.g. t:elf mv<=2' });
  const advancedError = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const formError = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const hint = h('p', { class: 'muted' }, 'Pick some filters and press Search. With no filters it lists the most popular Commander-legal cards.');
  const query = h('p', { class: 'muted small', hidden: true }, 'Searching: ', h('code', { 'data-testid': 'query' }));
  const count = h('p', { role: 'status', 'aria-live': 'polite' });
  const ignored = h('p', { class: 'banner', role: 'status', hidden: true });
  const results = h('ul', { class: 'card-grid' });
  const more = h('button', { type: 'button', class: 'button', hidden: true }, 'Load more');
  const moreError = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const sortSelect = h('select', { id: 'browse-sort' }, ...SORTS.map((s) => h('option', { value: s.id }, s.label)));
  const direction = h('span');

  const setError = (where: 'advanced' | 'form' | null, text = '') => {
    for (const [el, w] of [[advancedError, 'advanced'], [formError, 'form']] as const) {
      el.hidden = where !== w;
      el.textContent = where === w ? text : '';
    }
  };

  function drawDirection() {
    direction.replaceChildren(
      segmented('Sort direction', [{ id: 'asc', label: 'Ascending' }, { id: 'desc', label: 'Descending' }], descending ? 'desc' : 'asc', (id) => {
        descending = id === 'desc';
        drawDirection();
        rerun();
      }),
    );
  }

  function tile(card: ScryCard): HTMLElement {
    const src = cardImage(card);
    const price = bestPrice(card);
    return h(
      'li',
      { class: 'card-tile' },
      h(
        'div',
        { class: 'card-art' },
        src ? h('img', { src, alt: card.name, loading: 'lazy', width: 488, height: 680 }) : h('div', { class: 'card-missing', role: 'img', 'aria-label': card.name }, card.name),
        isOwned(ctx.store, oracleIdOf(card), card.type_line ?? card.card_faces?.[0]?.type_line ?? '') ? h('span', { class: 'qty-badge' }, 'Owned') : null,
      ),
      h('div', { class: 'card-meta' }, h('span', { class: 'card-tile-name' }, card.name), h('span', { class: 'card-tile-price' }, price ? usd(price.price) : 'No price')),
    );
  }

  const num = (n: number) => n.toLocaleString('en-US');

  /** The Load more button: there only while another page exists, and idle only when nothing is being fetched. */
  function syncMore() {
    more.hidden = !shown?.hasMore;
    more.disabled = searching || loadingMore;
  }

  function drawCount() {
    count.textContent = shown && results.children.length ? `Showing ${num(results.children.length)} of ${num(shown.total)} cards` : 'No cards match.';
  }

  function show(page: SearchPage, q: string) {
    hint.hidden = true;
    results.replaceChildren(...page.cards.map(tile));
    shown = { q, sort, descending, page: 1, hasMore: page.hasMore, total: page.total };
    drawCount();
    ignored.hidden = !page.warnings.length;
    ignored.replaceChildren(...(page.warnings.length ? ['Scryfall ignored part of this search, so these cards may not match it: ', page.warnings.join(' ')] : []));
  }

  async function load(q: string) {
    const key = `${q}\n${sort}\n${descending}`;
    if (key === waiting) return;
    const mine = ++run;
    waiting = key;
    lastQuery = q;
    // This search owns the screen now: a page still on its way for the older one will be dropped.
    searching = true;
    loadingMore = false;
    moreError.hidden = true;
    syncMore();
    query.hidden = false;
    query.querySelector('code')!.textContent = q;
    count.textContent = 'Searching…';
    try {
      const page = await searchCards(ctx.client, q, sort, descending, 1);
      if (mine === run) show(page, q);
    } catch (e) {
      if (mine !== run) return;
      // The earlier results stay: one failed search shouldn't throw away what is on screen.
      const bad = e instanceof ScryfallError && e.status === 400;
      setError(bad && advanced.value.trim() ? 'advanced' : 'form', bad ? e.message : "Couldn't search Scryfall. Press Search to try again.");
      count.textContent = results.children.length ? `Showing ${num(results.children.length)} cards from the earlier search.` : '';
    } finally {
      if (mine === run) {
        waiting = '';
        searching = false;
        syncMore();
      }
    }
  }

  /** The next page of the results on screen. It belongs to the search that made them: a newer search drops its reply. */
  async function loadMore() {
    if (!shown || loadingMore || searching) return;
    const mine = run;
    const from = shown;
    loadingMore = true;
    moreError.hidden = true;
    syncMore();
    try {
      const page = await searchCards(ctx.client, from.q, from.sort, from.descending, from.page + 1);
      if (mine !== run) return;
      results.append(...page.cards.map(tile));
      from.page += 1;
      from.hasMore = page.hasMore;
      from.total = page.total;
      drawCount();
    } catch {
      if (mine !== run) return;
      moreError.textContent = "Couldn't load more cards. Press Load more to try again.";
      moreError.hidden = false;
    } finally {
      if (mine === run) {
        loadingMore = false;
        syncMore();
      }
    }
  }
  more.addEventListener('click', () => void loadMore());

  function rerun() {
    if (lastQuery) void load(lastQuery);
  }

  function submit() {
    const built = buildQuery({ name: name.value, commanderLegal: legal.checked, advanced: advanced.value });
    if (!built.ok) {
      setError(built.field, built.error);
      return;
    }
    setError(null);
    void load(built.q);
  }

  sortSelect.addEventListener('change', () => {
    sort = sortSelect.value as SortKey;
    descending = SORTS.find((s) => s.id === sort)!.descending;
    drawDirection();
    rerun();
  });
  drawDirection();

  const form = h(
    'form',
    { class: 'browse-form stack', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'browse-name' }, 'Card name'), name),
    h('label', { class: 'own-label' }, legal, 'Commander-legal'),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'browse-advanced' }, 'Advanced search'),
      advanced,
      h('p', { class: 'muted small' }, 'Scryfall syntax, added to the filters above. ', h('a', { href: 'https://scryfall.com/docs/syntax', target: '_blank', rel: 'noopener' }, 'Syntax guide')),
      advancedError,
    ),
    formError,
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'button primary' }, 'Search')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  view.replaceChildren(
    h(
      'section',
      { class: 'stack', 'aria-labelledby': 'browse-h' },
      h('h2', { id: 'browse-h' }, 'Browse'),
      form,
      query,
      h('div', { class: 'actions' }, h('label', { for: 'browse-sort' }, 'Sort by'), sortSelect, direction),
      hint,
      ignored,
      count,
      results,
      moreError,
      h('div', { class: 'actions' }, more),
    ),
  );
}
