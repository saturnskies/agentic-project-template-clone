import { deckTotals } from '../lib/deck';
import { priceDeck, type PricedCard } from '../scryfall/resolve';
import type { AppContext } from './app';
import { h, usd } from './dom';

type SortKey = 'type' | 'name' | 'price';

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Battle', 'Land'];
const typeGroup = (typeLine: string) => {
  const front = typeLine.split(' // ')[0];
  return TYPE_ORDER.find((t) => front.includes(t)) ?? 'Other';
};
const FINISH_LABEL = { nonfoil: '', foil: 'Foil', etched: 'Etched' } as const;

export function renderDeck(view: HTMLElement, ctx: AppContext, id: string): void {
  const deck = ctx.store.decks.find((d) => d.id === id);
  if (!deck) {
    view.append(h('section', { class: 'stack' }, h('h2', {}, 'Deck not found'), h('p', {}, 'It may have been deleted, or saved in a different browser.'), h('a', { class: 'button', href: '#/' }, 'Back to your decks')));
    return;
  }

  const total = h('span', { class: 'stat-value', 'data-testid': 'deck-total' }, '—');
  const count = h('span', { class: 'stat-value', 'data-testid': 'deck-count' }, '—');
  const unpricedNote = h('p', { class: 'muted' });
  const body = h('div', { class: 'stack' });
  const progress = h('progress', { max: 1, value: 0, 'aria-label': 'Pricing progress' });
  const progressText = h('span', { class: 'muted' });

  const confirmBox = h('div', { class: 'actions' });
  const del = h('button', { type: 'button', class: 'button danger' }, 'Delete deck');
  del.addEventListener('click', () => {
    const yes = h('button', { type: 'button', class: 'button danger' }, `Yes, delete ${deck.name}`);
    const no = h('button', { type: 'button', class: 'button' }, 'Cancel');
    yes.addEventListener('click', () => {
      ctx.deleteDeck(deck.id);
      ctx.go('#/');
    });
    no.addEventListener('click', () => confirmBox.replaceChildren(del));
    confirmBox.replaceChildren(h('span', {}, 'Delete this deck? This cannot be undone.'), yes, no);
  });
  confirmBox.append(del);

  view.append(
    h(
      'section',
      { class: 'stack' },
      h('a', { href: '#/', class: 'back' }, '← Your decks'),
      h('div', { class: 'deck-head' }, h('h2', {}, deck.name), h('p', { class: 'muted' }, `Commander: ${deck.commander.name}`)),
      h(
        'div',
        { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Deck total'), total),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Cards'), count),
      ),
      unpricedNote,
      body,
      confirmBox,
    ),
  );

  body.append(h('div', { class: 'progress', role: 'status' }, progress, progressText));
  priceDeck(ctx.client, deck, (done, all) => {
    progress.max = all;
    progress.value = done;
    progressText.textContent = `Pricing ${done} of ${all} cards…`;
  })
    .then((priced) => {
      const t = deckTotals(priced.map((p) => ({ qty: p.entry.qty, price: p.price })));
      total.textContent = usd(t.total);
      count.textContent = `${t.count} / 100 cards`;
      const failed = priced.filter((p) => p.failed).length;
      unpricedNote.textContent = failed
        ? `${failed} ${failed === 1 ? 'card' : 'cards'} couldn't be priced because Scryfall didn't answer. Reload the page to try again.`
        : t.unpriced
          ? `${t.unpriced} ${t.unpriced === 1 ? 'card has' : 'cards have'} no TCGplayer price and ${t.unpriced === 1 ? 'is' : 'are'} left out of the total.`
          : '';
      ctx.saveDeck({ ...deck, summary: t });
      drawTable(body, priced, 'type');
    })
    .catch((err: unknown) => {
      console.error('Swapsmith: pricing failed', err);
      body.replaceChildren(h('p', { class: 'notice', role: 'alert' }, "Couldn't reach Scryfall to price this deck. Check your connection and reload."));
    });
}

function drawTable(host: HTMLElement, priced: PricedCard[], sort: SortKey): void {
  const sorted = [...priced].sort((a, b) => {
    if (a.isCommander !== b.isCommander) return a.isCommander ? -1 : 1;
    if (sort === 'price') return (b.price ?? -1) - (a.price ?? -1) || a.entry.card.name.localeCompare(b.entry.card.name);
    if (sort === 'type') {
      const d = TYPE_ORDER.indexOf(typeGroup(a.typeLine)) - TYPE_ORDER.indexOf(typeGroup(b.typeLine));
      if (d) return d;
    }
    return a.entry.card.name.localeCompare(b.entry.card.name);
  });

  const th = (key: SortKey | null, label: string, cls = '') => {
    if (!key) return h('th', { scope: 'col', class: cls }, label);
    const btn = h('button', { type: 'button', class: 'sort' }, label);
    btn.addEventListener('click', () => drawTable(host, priced, key));
    return h('th', { scope: 'col', class: cls, 'aria-sort': sort === key ? (key === 'price' ? 'descending' : 'ascending') : 'none' }, btn);
  };

  const rows = sorted.map((p) => {
    const printing = p.card ? `${p.card.set.toUpperCase()} #${p.card.collector_number}` : '—';
    const finish = p.finish ? FINISH_LABEL[p.finish] : '';
    const nameCell = p.url
      ? h('a', { href: p.url, target: '_blank', rel: 'noopener', 'data-testid': 'card-name' }, p.entry.card.name)
      : h('span', { 'data-testid': 'card-name' }, p.entry.card.name);
    return h(
      'tr',
      {},
      h('td', { class: 'name' }, nameCell, p.isCommander ? h('span', { class: 'tag' }, 'Commander') : null),
      h('td', { class: 'type hide-narrow' }, p.isCommander ? 'Commander' : typeGroup(p.typeLine)),
      h('td', { class: 'printing hide-narrow' }, printing, finish ? h('span', { class: 'tag' }, finish) : null),
      h('td', { class: 'num' }, p.entry.qty),
      h('td', { class: 'num' }, p.price != null ? usd(p.price) : p.failed ? "couldn't load" : 'no price'),
      h('td', { class: 'num' }, p.price == null ? '—' : usd(p.price * p.entry.qty)),
    );
  });

  host.replaceChildren(
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'cards' },
        h('thead', {}, h('tr', {}, th('name', 'Card'), th('type', 'Type', 'hide-narrow'), th(null, 'Printing', 'hide-narrow'), th(null, 'Qty', 'num'), th('price', 'Price', 'num'), th(null, 'Line total', 'num'))),
        h('tbody', {}, ...rows),
      ),
    ),
    h('p', { class: 'muted small' }, 'Prices are TCGplayer market prices for the cheapest printing, via Scryfall. Card names open TCGplayer in a new tab.'),
  );
}
