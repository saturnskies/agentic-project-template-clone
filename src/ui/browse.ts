import { buildQuery, COLORS, defaultFilters, loadPrefs, RARITIES, savePrefs, SORTS, type ColorMode, type Field, type Filters, type SortKey } from '../lib/browse';
import { cardImage } from '../lib/groups';
import { isOwned } from '../lib/owned';
import { bestPrice } from '../lib/price';
import { THEMES } from '../lib/profile';
import { searchCards, type SearchPage } from '../scryfall/browse';
import { ScryfallError } from '../scryfall/client';
import { POOL_ROLES } from '../scryfall/roles';
import { oracleIdOf } from '../scryfall/resolve';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { segmented } from './controls';
import { h, usd } from './dom';

/**
 * The Browse tab: search every card with a few filters and look through the results. The container stays
 * mounted while another tab shows, so the text, results and scroll survive a visit elsewhere.
 */
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The role choices: the roles suggestions search for, plus token makers (there is no Tagger tag for them). */
const ROLES: Array<{ label: string; query: string }> = [
  ...POOL_ROLES.map((r) => ({ label: cap(r.label), query: r.query })),
  { label: 'Token maker', query: THEMES.find((t) => t.id === 'tokens')!.query },
];

export function renderBrowse(view: HTMLElement, ctx: AppContext, storage: Storage | null): void {
  const loaded = loadPrefs(storage);
  let sort: SortKey = loaded.prefs.sort;
  let descending = loaded.prefs.descending;
  let layout: 'grid' | 'list' = loaded.prefs.view;
  let colorMode: ColorMode = 'within';
  /** The cards on screen, kept so a change of view can draw them again. */
  let cards: ScryCard[] = [];
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
  const legal = h('input', { id: 'browse-legal', type: 'checkbox', checked: loaded.prefs.commanderLegal });
  const advanced = h('input', { id: 'browse-advanced', type: 'text', autocomplete: 'off', placeholder: 'e.g. t:elf mv<=2' });
  const advancedError = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const formError = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const hint = h('p', { class: 'muted' }, 'Pick some filters and press Search. With no filters it lists the most popular Commander-legal cards.');
  const query = h('p', { class: 'muted small', hidden: true }, 'Searching: ', h('code', { 'data-testid': 'query' }));
  const count = h('p', { role: 'status', 'aria-live': 'polite' });
  const ignored = h('p', { class: 'banner', role: 'status', hidden: true });
  const results = h('ul', { class: layout === 'grid' ? 'card-grid' : 'card-list' });
  const more = h('button', { type: 'button', class: 'button', hidden: true }, 'Load more');
  const moreError = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const sortSelect = h('select', { id: 'browse-sort' }, ...SORTS.map((s) => h('option', { value: s.id }, s.label)));
  sortSelect.value = sort;
  const direction = h('span');
  const layoutToggle = h('span');

  // The extra filters live in a collapsible section so the form stays short on a phone.
  const field = (id: string, label: string, input: HTMLElement) => h('div', { class: 'field' }, h('label', { for: id }, label), input);
  const text = (id: string, placeholder: string, mode?: string) => h('input', { id, type: 'text', autocomplete: 'off', placeholder, inputmode: mode });
  const setInput = text('browse-set', 'e.g. cmr');
  const typeInput = text('browse-type', 'e.g. legendary artifact');
  const tribeInput = text('browse-tribe', 'e.g. elf');
  const keywordInput = text('browse-keyword', 'e.g. flying');
  const roleSelect = h('select', { id: 'browse-role' }, h('option', { value: '' }, 'Any role'), ...ROLES.map((r) => h('option', { value: r.query }, r.label)));
  const mvMin = text('browse-mv-min', 'min', 'numeric');
  const mvMax = text('browse-mv-max', 'max', 'numeric');
  const priceMin = text('browse-price-min', 'min', 'decimal');
  const priceMax = text('browse-price-max', 'max', 'decimal');
  const colorBoxes = COLORS.map((c) => ({ id: c.id, box: h('input', { type: 'checkbox', id: `browse-color-${c.id}` }), label: c.label }));
  const rarityBoxes = RARITIES.map((r) => ({ id: r.id, box: h('input', { type: 'checkbox', id: `browse-rarity-${r.id}` }), label: r.label }));
  const colorModeBox = h('span');
  const filterError = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const checks = (legend: string, items: Array<{ box: HTMLInputElement; label: string }>) =>
    h('fieldset', { class: 'checks' }, h('legend', {}, legend), ...items.map((i) => h('label', { class: 'own-label', for: i.box.id }, i.box, i.label)));
  const range = (label: string, lo: HTMLInputElement, hi: HTMLInputElement, loLabel: string, hiLabel: string) =>
    h('div', { class: 'field' }, h('span', { class: 'label-text' }, label), h('div', { class: 'range' }, h('label', { class: 'sr-only', for: lo.id }, loLabel), lo, h('span', { 'aria-hidden': 'true' }, 'to'), h('label', { class: 'sr-only', for: hi.id }, hiLabel), hi));
  const filters = h(
    'details',
    { class: 'more-filters' },
    h('summary', {}, 'More filters'),
    h(
      'div',
      { class: 'filter-grid' },
      field('browse-set', 'Set code', setInput),
      field('browse-type', 'Type', typeInput),
      field('browse-tribe', 'Tribe (creature type)', tribeInput),
      field('browse-keyword', 'Keyword', keywordInput),
      field('browse-role', 'Role', roleSelect),
      h('div', { class: 'field' }, checks('Color identity', colorBoxes), colorModeBox),
      range('Mana value', mvMin, mvMax, 'Mana value min', 'Mana value max'),
      checks('Rarity', rarityBoxes),
      h('div', { class: 'field' }, range('Price (USD)', priceMin, priceMax, 'Price min (USD)', 'Price max (USD)'), h('p', { class: 'muted small' }, 'Cards with no USD price are left out when you set a price.')),
    ),
    filterError,
  );

  /** Shows one error where it belongs, opening the extra filters if that is where it is, and hides the rest. */
  const setError = (field: Field | null, message = '') => {
    const home = field === null ? null : field === 'advanced' ? advancedError : field === 'form' ? formError : filterError;
    for (const el of [advancedError, formError, filterError]) {
      el.hidden = el !== home;
      el.textContent = el === home ? message : '';
    }
    if (home === filterError) filters.open = true;
  };

  /** What the form holds now. */
  function readFilters(): Filters {
    return {
      ...defaultFilters(),
      name: name.value,
      commanderLegal: legal.checked,
      advanced: advanced.value,
      set: setInput.value,
      type: typeInput.value,
      tribe: tribeInput.value,
      keyword: keywordInput.value,
      role: roleSelect.value,
      colors: colorBoxes.filter((c) => c.box.checked).map((c) => c.id),
      colorMode,
      mvMin: mvMin.value,
      mvMax: mvMax.value,
      rarities: rarityBoxes.filter((r) => r.box.checked).map((r) => r.id),
      priceMin: priceMin.value,
      priceMax: priceMax.value,
    };
  }

  /** Remembers how results look and are ordered (not the filters), unless a newer version saved something there. */
  function persist() {
    if (!loaded.future) savePrefs(storage, { version: 1, view: layout, sort, descending, commanderLegal: legal.checked });
  }

  function drawColorMode() {
    colorModeBox.replaceChildren(
      segmented('Color match', [{ id: 'within', label: 'Within' }, { id: 'exactly', label: 'Exactly' }, { id: 'includes', label: 'Includes' }], colorMode, (id) => {
        colorMode = id;
        drawColorMode();
      }),
    );
  }

  function resetFilters() {
    for (const input of [name, advanced, setInput, typeInput, tribeInput, keywordInput, mvMin, mvMax, priceMin, priceMax]) input.value = '';
    roleSelect.value = '';
    for (const c of [...colorBoxes, ...rarityBoxes]) c.box.checked = false;
    colorMode = 'within';
    drawColorMode();
    setError(null);
  }

  function drawDirection() {
    direction.replaceChildren(
      segmented('Sort direction', [{ id: 'asc', label: 'Ascending' }, { id: 'desc', label: 'Descending' }], descending ? 'desc' : 'asc', (id) => {
        descending = id === 'desc';
        drawDirection();
        persist();
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

  function row(card: ScryCard): HTMLElement {
    const price = bestPrice(card);
    const type = card.type_line ?? card.card_faces?.[0]?.type_line ?? '';
    return h(
      'li',
      { class: 'card-row' },
      h('span', { class: 'card-row-name' }, card.name),
      h('span', { class: 'card-row-cost' }, card.mana_cost ?? ''),
      h('span', { class: 'card-row-type' }, type),
      h('span', { class: 'card-row-rarity' }, card.rarity ? cap(card.rarity) : ''),
      isOwned(ctx.store, oracleIdOf(card), type) ? h('span', { class: 'card-row-owned' }, 'Owned') : null,
      h('span', { class: 'card-row-price' }, price ? usd(price.price) : 'No price'),
    );
  }

  const render = (card: ScryCard) => (layout === 'grid' ? tile(card) : row(card));

  function drawResults() {
    results.className = layout === 'grid' ? 'card-grid' : 'card-list';
    results.replaceChildren(...cards.map(render));
  }

  function drawLayout() {
    layoutToggle.replaceChildren(
      segmented('View', [{ id: 'grid', label: 'Grid' }, { id: 'list', label: 'List' }], layout, (id) => {
        layout = id;
        drawLayout();
        drawResults();
        persist();
      }),
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
    cards = page.cards;
    drawResults();
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
      cards = [...cards, ...page.cards];
      results.append(...page.cards.map(render));
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
    const built = buildQuery(readFilters());
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
    persist();
    rerun();
  });
  legal.addEventListener('change', persist);
  // Colorless is its own choice: picking it clears the colors, and picking a color clears it.
  for (const c of colorBoxes) {
    c.box.addEventListener('change', () => {
      if (!c.box.checked) return;
      for (const other of colorBoxes) if (other !== c && (c.id === 'C' || other.id === 'C')) other.box.checked = false;
    });
  }
  drawDirection();
  drawLayout();
  drawColorMode();

  const form = h(
    'form',
    { class: 'browse-form stack', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'browse-name' }, 'Card name'), name),
    h('label', { class: 'own-label' }, legal, 'Commander-legal'),
    filters,
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'browse-advanced' }, 'Advanced search'),
      advanced,
      h('p', { class: 'muted small' }, 'Scryfall syntax, added to the filters above. ', h('a', { href: 'https://scryfall.com/docs/syntax', target: '_blank', rel: 'noopener' }, 'Syntax guide')),
      advancedError,
    ),
    formError,
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'button primary' }, 'Search'), h('button', { type: 'button', class: 'button', id: 'browse-reset' }, 'Reset filters')),
  );
  form.querySelector('#browse-reset')!.addEventListener('click', resetFilters);
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
      h('div', { class: 'actions' }, h('label', { for: 'browse-sort' }, 'Sort by'), sortSelect, direction, layoutToggle),
      hint,
      ignored,
      count,
      results,
      moreError,
      h('div', { class: 'actions' }, more),
    ),
  );
}
