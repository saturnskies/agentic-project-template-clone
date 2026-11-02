import { deckTotals, type Deck, type DeckEntry } from '../lib/deck';
import { cardWarnings, DECK_SIZE, warningText } from '../lib/format';
import { autocompleteNames, cardByName } from '../scryfall/cards';
import { oracleIdOf, priceDeck, priceEntries, type PricedCard } from '../scryfall/resolve';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { combobox } from './combobox';
import { h, usd } from './dom';

type SortKey = 'type' | 'name' | 'price';

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Battle', 'Land'];
const typeGroup = (typeLine: string) => {
  const front = typeLine.split(' // ')[0];
  return TYPE_ORDER.find((t) => front.includes(t)) ?? 'Other';
};
const FINISH_LABEL = { nonfoil: '', foil: 'Foil', etched: 'Etched' } as const;
const SCRYFALL_DOWN = "Couldn't reach Scryfall. Check your connection and try again.";

export function renderDeck(view: HTMLElement, ctx: AppContext, id: string): void {
  const found = ctx.store.decks.find((d) => d.id === id);
  if (!found) {
    view.append(h('section', { class: 'stack' }, h('h2', {}, 'Deck not found'), h('p', {}, 'It may have been deleted, or saved in a different browser.'), h('a', { class: 'button', href: '#/' }, 'Back to your decks')));
    return;
  }
  let deck: Deck = found;
  let priced: PricedCard[] = [];
  let sort: SortKey = 'type';

  const total = h('span', { class: 'stat-value', 'data-testid': 'deck-total' }, '—');
  const count = h('span', { class: 'stat-value', 'data-testid': 'deck-count' }, '—');
  const note = h('p', { class: 'muted' });
  const adder = h('div', { class: 'stack' });
  const body = h('div', { class: 'stack' });

  /** Saves the deck and redraws totals and the table from `priced`. */
  const commit = (cards: DeckEntry[]) => {
    const t = deckTotals(priced.map((p) => ({ qty: p.entry.qty, price: p.price })));
    deck = { ...deck, cards, updatedAt: new Date().toISOString(), summary: t };
    ctx.saveDeck(deck);
    redraw();
  };

  const redraw = () => {
    const t = deckTotals(priced.map((p) => ({ qty: p.entry.qty, price: p.price })));
    total.textContent = usd(t.total);
    count.textContent = `${t.count} / ${DECK_SIZE} cards`;
    const failed = priced.filter((p) => p.failed).length;
    note.textContent = failed
      ? `${failed} ${failed === 1 ? 'card' : 'cards'} couldn't be priced because Scryfall didn't answer. Reload the page to try again.`
      : t.unpriced
        ? `${t.unpriced} ${t.unpriced === 1 ? 'card has' : 'cards have'} no TCGplayer price and ${t.unpriced === 1 ? 'is' : 'are'} left out of the total.`
        : '';
    body.replaceChildren(table(priced, sort, (key) => ((sort = key), redraw()), remove));
  };

  // ---- Removing -------------------------------------------------------------------------------
  /** Removes one copy; the last copy removes the card. The commander can't be removed. */
  const remove = (p: PricedCard) => {
    if (p.isCommander) return;
    if (p.entry.qty > 1) {
      p.entry = { ...p.entry, qty: p.entry.qty - 1 };
    } else {
      priced = priced.filter((x) => x !== p);
    }
    commit(priced.filter((x) => !x.isCommander).map((x) => x.entry));
  };

  // ---- Adding ---------------------------------------------------------------------------------
  const add = async (card: ScryCard) => {
    const oid = oracleIdOf(card);
    const existing = priced.find((p) => !p.isCommander && p.entry.card.oracleId === oid);
    if (existing) {
      existing.entry = { ...existing.entry, qty: existing.entry.qty + 1 };
    } else {
      const entry: DeckEntry = { card: { oracleId: oid, name: card.name }, qty: 1 };
      const [p] = await priceEntries(ctx.client, [{ entry, isCommander: false }], undefined, new Map([[oid, card]]));
      priced = [...priced, p];
    }
    commit(priced.filter((x) => !x.isCommander).map((x) => x.entry));
  };

  const warningBox = h('div');
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const search = combobox<string>({
    id: 'add-card',
    label: 'Add a card',
    placeholder: 'Start typing a card name',
    search: (typed) => autocompleteNames(ctx.client, typed),
    render: (name) => ({ label: name }),
    onPick: async (name) => {
      search.clear();
      warningBox.replaceChildren();
      status.textContent = `Adding ${name}…`;
      try {
        const card = await cardByName(ctx.client, name);
        if (!card) {
          status.textContent = `Scryfall has no card named ${name}.`;
          return;
        }
        const commander = priced.find((p) => p.isCommander)?.card;
        const warnings = cardWarnings(
          {
            oracleId: oracleIdOf(card),
            name: card.name,
            typeLine: card.type_line ?? card.card_faces?.[0]?.type_line ?? '',
            colorIdentity: card.color_identity ?? [],
            commanderLegality: card.legalities?.commander,
          },
          { colorIdentity: commander?.color_identity ?? [], oracleIds: new Set(priced.map((p) => p.entry.card.oracleId)) },
        );
        if (!warnings.length) {
          await add(card);
          status.textContent = `Added ${card.name}.`;
          return;
        }
        status.textContent = '';
        const yes = h('button', { type: 'button', class: 'button' }, 'Add anyway');
        const no = h('button', { type: 'button', class: 'button' }, 'Cancel');
        yes.addEventListener('click', async () => {
          warningBox.replaceChildren();
          await add(card);
          status.textContent = `Added ${card.name}.`;
          search.input.focus();
        });
        no.addEventListener('click', () => {
          warningBox.replaceChildren();
          search.input.focus();
        });
        warningBox.replaceChildren(
          h('div', { class: 'notice stack', role: 'alert' }, ...warnings.map((w) => h('p', {}, warningText(w, card.name, deck.commander.name))), h('div', { class: 'actions' }, yes, no)),
        );
        yes.focus();
      } catch {
        status.textContent = SCRYFALL_DOWN;
      }
    },
  });

  // ---- Delete deck ----------------------------------------------------------------------------
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
      note,
      adder,
      body,
      confirmBox,
    ),
  );

  // ---- First load -----------------------------------------------------------------------------
  const progress = h('progress', { max: 1, value: 0, 'aria-label': 'Pricing progress' });
  const progressText = h('span', { class: 'muted' });
  body.append(h('div', { class: 'progress', role: 'status' }, progress, progressText));
  priceDeck(ctx.client, deck, (done, all) => {
    progress.max = all;
    progress.value = done;
    progressText.textContent = `Pricing ${done} of ${all} cards…`;
  })
    .then((result) => {
      priced = result;
      deck = { ...deck, summary: deckTotals(priced.map((p) => ({ qty: p.entry.qty, price: p.price }))) };
      ctx.saveDeck(deck);
      adder.append(search.root, warningBox, status);
      redraw();
    })
    .catch((err: unknown) => {
      console.error('Swapsmith: pricing failed', err);
      body.replaceChildren(h('p', { class: 'notice', role: 'alert' }, "Couldn't reach Scryfall to price this deck. Check your connection and reload."));
    });
}

function table(priced: PricedCard[], sort: SortKey, onSort: (k: SortKey) => void, onRemove: (p: PricedCard) => void): HTMLElement {
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
    btn.addEventListener('click', () => onSort(key));
    return h('th', { scope: 'col', class: cls, 'aria-sort': sort === key ? (key === 'price' ? 'descending' : 'ascending') : 'none' }, btn);
  };

  const rows = sorted.map((p) => {
    const printing = p.card ? `${p.card.set.toUpperCase()} #${p.card.collector_number}` : '—';
    const finish = p.finish ? FINISH_LABEL[p.finish] : '';
    const name = p.entry.card.name;
    const nameCell = p.url
      ? h('a', { href: p.url, target: '_blank', rel: 'noopener', 'data-testid': 'card-name' }, name)
      : h('span', { 'data-testid': 'card-name' }, name);
    let removeCell: HTMLElement | null = null;
    if (!p.isCommander) {
      const btn = h('button', { type: 'button', class: 'icon-button', 'aria-label': `Remove ${name}`, title: p.entry.qty > 1 ? 'Remove one copy' : 'Remove from deck' }, '×');
      btn.addEventListener('click', () => onRemove(p));
      removeCell = btn;
    }
    return h(
      'tr',
      {},
      h('td', { class: 'name' }, nameCell, p.isCommander ? h('span', { class: 'tag' }, 'Commander') : null),
      h('td', { class: 'type hide-narrow' }, p.isCommander ? 'Commander' : typeGroup(p.typeLine)),
      h('td', { class: 'printing hide-narrow' }, printing, finish ? h('span', { class: 'tag' }, finish) : null),
      h('td', { class: 'num' }, p.entry.qty),
      h('td', { class: 'num' }, p.price != null ? usd(p.price) : p.failed ? "couldn't load" : 'no price'),
      h('td', { class: 'num' }, p.price == null ? '—' : usd(p.price * p.entry.qty)),
      h('td', { class: 'remove' }, removeCell),
    );
  });

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'cards' },
        h(
          'thead',
          {},
          h('tr', {}, th('name', 'Card'), th('type', 'Type', 'hide-narrow'), th(null, 'Printing', 'hide-narrow'), th(null, 'Qty', 'num'), th('price', 'Price', 'num'), th(null, 'Line total', 'num'), h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Remove'))),
        ),
        h('tbody', {}, ...rows),
      ),
    ),
    h('p', { class: 'muted small' }, 'Prices are TCGplayer market prices for the cheapest printing, via Scryfall. Card names open TCGplayer in a new tab.'),
  );
}

