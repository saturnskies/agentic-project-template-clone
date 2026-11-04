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

  function show(page: SearchPage) {
    hint.hidden = true;
    results.replaceChildren(...page.cards.map(tile));
    count.textContent = page.cards.length ? `Showing ${page.cards.length.toLocaleString('en-US')} of ${page.total.toLocaleString('en-US')} cards` : 'No cards match.';
    ignored.hidden = !page.warnings.length;
    ignored.replaceChildren(...(page.warnings.length ? ['Scryfall ignored part of this search, so these cards may not match it: ', page.warnings.join(' ')] : []));
  }

  async function load(q: string) {
    const key = `${q}\n${sort}\n${descending}`;
    if (key === waiting) return;
    const mine = ++run;
    waiting = key;
    lastQuery = q;
    query.hidden = false;
    query.querySelector('code')!.textContent = q;
    count.textContent = 'Searching…';
    try {
      const page = await searchCards(ctx.client, q, sort, descending, 1);
      if (mine === run) show(page);
    } catch (e) {
      if (mine !== run) return;
      // The earlier results stay: one failed search shouldn't throw away what is on screen.
      const bad = e instanceof ScryfallError && e.status === 400;
      setError(bad && advanced.value.trim() ? 'advanced' : 'form', bad ? e.message : "Couldn't search Scryfall. Press Search to try again.");
      count.textContent = results.children.length ? `Showing ${results.children.length} cards from the earlier search.` : '';
    } finally {
      if (mine === run) waiting = '';
    }
  }

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
    ),
  );
}
