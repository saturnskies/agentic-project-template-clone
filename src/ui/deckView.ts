import { deckTotals, type Deck, type DeckEntry } from '../lib/deck';
import { cardWarnings, DECK_SIZE, isBasicLand, warningText } from '../lib/format';
import { isOwned, stillToBuy } from '../lib/owned';
import { sortPrintings } from '../lib/price';
import { autocompleteNames, cardByName } from '../scryfall/cards';
import { oracleIdOf, priceDeck, priceEntries, withPrinting, type PricedCard } from '../scryfall/resolve';
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
  const toBuy = h('span', { class: 'stat-value', 'data-testid': 'deck-to-buy' }, '—');
  const count = h('span', { class: 'stat-value', 'data-testid': 'deck-count' }, '—');
  const note = h('p', { class: 'muted' });
  const adder = h('div', { class: 'stack' });
  const body = h('div', { class: 'stack' });

  const owned = (p: PricedCard) => isOwned(ctx.store, p.entry.card.oracleId, p.typeLine);
  const summary = () => ({
    ...deckTotals(priced.map((p) => ({ qty: p.entry.qty, price: p.price }))),
    toBuy: stillToBuy(priced.map((p) => ({ qty: p.entry.qty, price: p.price, owned: owned(p) }))),
  });

  /** Saves the deck and redraws totals and the table from `priced`. */
  const commit = (cards: DeckEntry[], extra: Partial<Deck> = {}) => {
    deck = { ...deck, ...extra, cards, updatedAt: new Date().toISOString(), summary: summary() };
    ctx.saveDeck(deck);
    redraw();
  };
  const cardsOf = () => priced.filter((x) => !x.isCommander).map((x) => x.entry);

  const redraw = () => {
    const t = summary();
    total.textContent = usd(t.total);
    toBuy.textContent = usd(t.toBuy);
    count.textContent = `${t.count} / ${DECK_SIZE} cards`;
    const failed = priced.filter((p) => p.failed).length;
    note.textContent = failed
      ? `${failed} ${failed === 1 ? 'card' : 'cards'} couldn't be priced because Scryfall didn't answer. Reload the page to try again.`
      : t.unpriced
        ? `${t.unpriced} ${t.unpriced === 1 ? 'card has' : 'cards have'} no TCGplayer price and ${t.unpriced === 1 ? 'is' : 'are'} left out of the total.`
        : '';
    body.replaceChildren(
      table(priced, sort, {
        onSort: (key) => ((sort = key), redraw()),
        onRemove: remove,
        owned,
        onOwned: (p, value) => {
          ctx.setOwned(p.entry.card.oracleId, p.typeLine, value);
          deck = { ...deck, summary: summary() };
          ctx.saveDeck(deck);
          redraw();
        },
        onPrinting: openPicker,
      }),
    );
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
    commit(cardsOf());
  };

  // ---- Printing picker ------------------------------------------------------------------------
  const picker = h('dialog', { class: 'picker', 'aria-labelledby': 'picker-h' });
  const choosePrinting = (p: PricedCard, printingId: string | undefined) => {
    const next = withPrinting(p, printingId);
    priced = priced.map((x) => (x === p ? next : x));
    picker.close();
    if (p.isCommander) commit(cardsOf(), { commanderPrintingId: printingId });
    else commit(cardsOf());
  };
  const openPicker = (p: PricedCard) => {
    const name = p.entry.card.name;
    const fmt = (v: string | null) => (v ? usd(Number(v)) : null);
    const items = sortPrintings(p.prints).map((c) => {
      const current = c.id === p.card?.id;
      const finishes = [
        fmt(c.prices.usd) && `Nonfoil ${fmt(c.prices.usd)}`,
        fmt(c.prices.usd_foil) && `Foil ${fmt(c.prices.usd_foil)}`,
        fmt(c.prices.usd_etched) && `Etched ${fmt(c.prices.usd_etched)}`,
      ].filter(Boolean);
      const use = h('button', { type: 'button', class: 'button' }, 'Use this printing');
      use.addEventListener('click', () => choosePrinting(p, c.id));
      return h(
        'li',
        { class: current ? 'current' : '' },
        h('div', { class: 'picker-name' }, h('strong', {}, `${c.set.toUpperCase()} #${c.collector_number}`), h('span', { class: 'muted' }, c.set_name)),
        h('span', { class: 'picker-prices' }, finishes.length ? finishes.join(' · ') : 'No price'),
        current ? h('span', { class: 'tag' }, 'Current') : use,
      );
    });
    const cheapest = h('button', { type: 'button', class: 'button primary' }, 'Use the cheapest printing');
    cheapest.addEventListener('click', () => choosePrinting(p, undefined));
    const close = h('button', { type: 'button', class: 'button' }, 'Close');
    close.addEventListener('click', () => picker.close());
    picker.replaceChildren(
      h('div', { class: 'picker-head' }, h('h3', { id: 'picker-h' }, `Printings of ${name}`), close),
      h('p', { class: 'muted small' }, isBasicLand(p.typeLine) ? 'The cheapest 175 printings, cheapest first.' : `${p.prints.length} paper printings, cheapest first. Prices are each printing's cheapest finish.`),
      h('ul', { class: 'picker-list' }, ...items),
      h('div', { class: 'actions' }, p.entry.printingId ? cheapest : null),
    );
    picker.showModal();
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
    commit(cardsOf());
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
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Still to buy'), toBuy),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Cards'), count),
      ),
      note,
      adder,
      body,
      confirmBox,
      picker,
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
      deck = { ...deck, summary: summary() };
      ctx.saveDeck(deck);
      adder.append(search.root, warningBox, status);
      redraw();
    })
    .catch((err: unknown) => {
      console.error('Swapsmith: pricing failed', err);
      body.replaceChildren(h('p', { class: 'notice', role: 'alert' }, "Couldn't reach Scryfall to price this deck. Check your connection and reload."));
    });
}

interface TableHandlers {
  onSort: (k: SortKey) => void;
  onRemove: (p: PricedCard) => void;
  owned: (p: PricedCard) => boolean;
  onOwned: (p: PricedCard, owned: boolean) => void;
  onPrinting: (p: PricedCard) => void;
}

function table(priced: PricedCard[], sort: SortKey, { onSort, onRemove, owned, onOwned, onPrinting }: TableHandlers): HTMLElement {
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
    const own = h('input', { type: 'checkbox', 'aria-label': `Own ${name}`, checked: owned(p) });
    own.addEventListener('change', () => onOwned(p, own.checked));
    // Shown in the Printing column on wide screens, and under the card name on phones.
    const printingControl = () => {
      if (!p.prints.length) return h('span', {}, printing);
      const btn = h('button', { type: 'button', class: 'link-button', 'aria-label': `Change printing of ${name}`, title: 'Change printing' }, printing, ' ▾');
      btn.addEventListener('click', () => onPrinting(p));
      return btn;
    };
    let removeCell: HTMLElement | null = null;
    if (!p.isCommander) {
      const btn = h('button', { type: 'button', class: 'icon-button', 'aria-label': `Remove ${name}`, title: p.entry.qty > 1 ? 'Remove one copy' : 'Remove from deck' }, '×');
      btn.addEventListener('click', () => onRemove(p));
      removeCell = btn;
    }
    return h(
      'tr',
      {},
      h(
        'td',
        { class: 'name' },
        nameCell,
        p.isCommander ? h('span', { class: 'tag' }, 'Commander') : null,
        h('div', { class: 'show-narrow sub' }, printingControl(), finish ? h('span', { class: 'tag' }, finish) : null),
      ),
      h('td', { class: 'type hide-narrow' }, p.isCommander ? 'Commander' : typeGroup(p.typeLine)),
      h('td', { class: 'printing hide-narrow' }, printingControl(), finish ? h('span', { class: 'tag' }, finish) : null),
      h('td', { class: 'num' }, p.entry.qty),
      h('td', { class: 'num' }, p.price != null ? usd(p.price) : p.failed ? "couldn't load" : 'no price'),
      h('td', { class: 'num hide-narrow' }, p.price == null ? '—' : usd(p.price * p.entry.qty)),
      h('td', { class: 'owned' }, own),
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
          h('tr', {}, th('name', 'Card'), th('type', 'Type', 'hide-narrow'), th(null, 'Printing', 'hide-narrow'), th(null, 'Qty', 'num'), th('price', 'Price', 'num'), th(null, 'Line total', 'num hide-narrow'), th(null, 'Owned', 'owned'), h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Remove'))),
        ),
        h('tbody', {}, ...rows),
      ),
    ),
    h('p', { class: 'muted small' }, 'Prices are TCGplayer market prices for the cheapest printing, via Scryfall. Card names open TCGplayer in a new tab.'),
  );
}

