import { cleanDeckName, deckTotals, newDeckId, savedBracket, type Deck, type DeckEntry } from '../lib/deck';
import { deckFileName, deckToText } from '../lib/export';
import { decodeDeck, encodeDeck, ShareError } from '../lib/share';
import { cardWarnings, DECK_SIZE, isBasicLand, warningText } from '../lib/format';
import { cardImage, compareLines, GROUP_ORDER, groupByType, typeGroup, typeName, type SortKey } from '../lib/groups';
import { isOwned, stillToBuy } from '../lib/owned';
import { sortPrintings } from '../lib/price';
import { autocompleteNames, cardByName } from '../scryfall/cards';
import { oracleIdOf, priceDeck, priceEntries, withPrinting, type PricedCard } from '../scryfall/resolve';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { combobox } from './combobox';
import { saveFile } from './saveFile';
import { suggestionsPanel } from './suggestions';
import { h, usd } from './dom';

const FINISH_LABEL = { nonfoil: '', foil: 'Foil', etched: 'Etched' } as const;
const SCRYFALL_DOWN = "Couldn't reach Scryfall. Check your connection and try again.";

export function renderDeck(view: HTMLElement, ctx: AppContext, id: string): void {
  const found = ctx.store.decks.find((d) => d.id === id);
  if (!found) {
    view.append(h('section', { class: 'stack' }, h('h2', {}, 'Deck not found'), h('p', {}, 'It may have been deleted, or saved in a different browser.'), h('a', { class: 'button', href: '#/' }, 'Back to your decks')));
    return;
  }
  renderDeckPage(view, ctx, found, false);
}

/** A deck someone shared by link (`#d=<code>`): read-only, with a button to save a copy. */
export async function renderShared(view: HTMLElement, ctx: AppContext, code: string): Promise<void> {
  try {
    const shared = await decodeDeck(code);
    renderDeckPage(view, ctx, { ...shared, id: newDeckId(), format: 'commander', updatedAt: new Date().toISOString() }, true);
  } catch (e) {
    const why = e instanceof ShareError ? e.message : 'This share link could not be opened.';
    view.append(
      h('section', { class: 'stack' }, h('h2', {}, "Couldn't open this shared deck"), h('p', { role: 'alert' }, why, ' Ask for the link again, or check that it was copied in full.'), h('a', { class: 'button', href: '#/' }, 'Go to your decks')),
    );
  }
}

function renderDeckPage(view: HTMLElement, ctx: AppContext, start: Deck, readOnly: boolean): void {
  let deck: Deck = start;
  /** Saves the deck, except for a shared deck that hasn't been saved to this browser. */
  const persist = (d: Deck) => {
    if (!readOnly) ctx.saveDeck(d);
  };
  let priced: PricedCard[] = [];
  let sort: SortKey = 'type';

  const viewButtons = (['list', 'grid'] as const).map((v) => {
    const btn = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(ctx.store.prefs.view === v) }, v === 'list' ? 'List' : 'Grid');
    btn.addEventListener('click', () => {
      ctx.setView(v);
      viewButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(['list', 'grid'][i] === v)));
      redraw();
    });
    return btn;
  });
  const viewSwitch = h('div', { class: 'segmented', role: 'group', 'aria-label': 'View' }, ...viewButtons);

  const total = h('span', { class: 'stat-value', 'data-testid': 'deck-total' }, '—');
  const toBuy = h('span', { class: 'stat-value', 'data-testid': 'deck-to-buy' }, '—');
  const count = h('span', { class: 'stat-value', 'data-testid': 'deck-count' }, '—');
  const note = h('p', { class: 'muted' });
  const adder = h('div', { class: 'stack' });
  const body = h('div', { class: 'stack' });

  // ---- Title and rename -----------------------------------------------------------------------
  const titleBox = h('div', { class: 'deck-head' });
  const drawTitle = () => {
    const rename = h('button', { type: 'button', class: 'button small' }, 'Rename');
    rename.addEventListener('click', editTitle);
    titleBox.replaceChildren(
      h('div', { class: 'deck-title-row' }, h('h2', {}, deck.name || 'Shared deck'), readOnly ? null : rename),
      h('p', { class: 'muted' }, `Commander: ${deck.commander.name}`),
    );
    return rename;
  };
  function editTitle() {
    const input = h('input', { type: 'text', 'aria-label': 'Deck name', autocomplete: 'off', maxlength: 80, value: deck.name, class: 'title-input' });
    const error = h('p', { class: 'notice', role: 'alert' });
    const saveBtn = h('button', { type: 'submit', class: 'button primary small' }, 'Save name');
    const cancel = h('button', { type: 'button', class: 'button small' }, 'Cancel');
    const finish = () => drawTitle().focus();
    cancel.addEventListener('click', finish);
    const form = h('form', { class: 'title-edit' }, input, saveBtn, cancel);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = cleanDeckName(input.value);
      if (!name) {
        error.textContent = 'Give the deck a name.';
        titleBox.replaceChildren(form, error);
        input.focus();
        return;
      }
      if (name !== deck.name) {
        deck = { ...deck, name, updatedAt: new Date().toISOString() };
        persist(deck);
      }
      finish();
    });
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') finish();
    });
    titleBox.replaceChildren(form);
    input.focus();
    input.select();
  }
  drawTitle();

  const owned = (p: PricedCard) => isOwned(ctx.store, p.entry.card.oracleId, p.typeLine);
  const summary = () => ({
    ...deckTotals(priced.map((p) => ({ qty: p.entry.qty, price: p.price }))),
    toBuy: stillToBuy(priced.map((p) => ({ qty: p.entry.qty, price: p.price, owned: owned(p) }))),
  });

  let panel: { root: HTMLElement; refresh(): void } | null = null;
  let lastSwap: { removed: PricedCard; index: number; addedOracleId: string; label: string } | null = null;

  /** Saves the deck and redraws totals, the cards and the suggestions from `priced`. Any edit other than a swap ends the Undo offer. */
  const commit = (cards: DeckEntry[], extra: Partial<Deck> = {}, opts: { keepUndo?: boolean } = {}) => {
    if (!opts.keepUndo) lastSwap = null;
    deck = { ...deck, ...extra, cards, updatedAt: new Date().toISOString(), summary: summary() };
    persist(deck);
    redraw();
    panel?.refresh();
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
    const draw = ctx.store.prefs.view === 'grid' ? grid : table;
    body.replaceChildren(
      draw(priced, sort, {
        onSort: (key) => ((sort = key), redraw()),
        onRemove: remove,
        owned,
        onOwned: (p, value) => {
          ctx.setOwned(p.entry.card.oracleId, p.typeLine, value);
          deck = { ...deck, summary: summary() };
          persist(deck);
          redraw();
          panel?.refresh(); // cheaper replacements skip owned cards
        },
        onPrinting: openPicker,
        onKeep: (p, value) => {
          const entry = { ...p.entry };
          if (value) entry.keep = true;
          else delete entry.keep;
          priced = priced.map((x) => (x === p ? { ...x, entry } : x));
          commit(cardsOf());
        },
        readOnly,
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
  /** Prices one new card from the card object already in hand (no lookup by name). */
  const priceCard = async (card: ScryCard) => {
    const oid = oracleIdOf(card);
    const [p] = await priceEntries(ctx.client, [{ entry: { card: { oracleId: oid, name: card.name }, qty: 1 }, isCommander: false }], undefined, new Map([[oid, card]]));
    return p;
  };
  const add = async (card: ScryCard) => {
    const oid = oracleIdOf(card);
    const existing = priced.find((p) => !p.isCommander && p.entry.card.oracleId === oid);
    if (existing) {
      existing.entry = { ...existing.entry, qty: existing.entry.qty + 1 };
    } else {
      priced = [...priced, await priceCard(card)];
    }
    commit(cardsOf());
  };

  // ---- Swapping (from suggestions) ------------------------------------------------------------
  let swapping = false;
  /**
   * Replaces a deck card with a suggested card; Undo puts it back. One swap at a time, and the cut is
   * found again by Oracle ID after pricing, since the deck may have changed meanwhile.
   */
  const swap = async (cutId: string, card: ScryCard) => {
    if (swapping) return;
    swapping = true;
    try {
      const added = await priceCard(card);
      const index = priced.findIndex((x) => !x.isCommander && x.entry.card.oracleId === cutId);
      if (index < 0 || priced.some((x) => x.entry.card.oracleId === added.entry.card.oracleId)) return; // already swapped or added
      const removed = priced[index];
      priced = [...priced.slice(0, index), ...priced.slice(index + 1), added];
      commit(cardsOf(), {}, { keepUndo: true });
      lastSwap = { removed, index, addedOracleId: added.entry.card.oracleId, label: `${removed.entry.card.name} → ${card.name}` };
      panel?.refresh();
    } finally {
      swapping = false;
    }
  };
  const undo = () => {
    if (!lastSwap) return;
    const { removed, index, addedOracleId } = lastSwap;
    priced = priced.filter((x) => x.isCommander || x.entry.card.oracleId !== addedOracleId);
    priced.splice(Math.min(index, priced.length), 0, removed);
    commit(cardsOf()); // also ends the Undo offer
  };

  const warningBox = h('div', { class: 'warning-box' });
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
      ctx.replace('#/');
    });
    no.addEventListener('click', () => confirmBox.replaceChildren(del));
    confirmBox.replaceChildren(h('span', {}, 'Delete this deck? This cannot be undone.'), yes, no);
  });
  confirmBox.append(del);

  // On wide screens the upgrades panel sits beside the cards; on phones it follows them.
  const columns = h('div', { class: 'deck-columns' }, body);

  // ---- Sharing --------------------------------------------------------------------------------
  const shareBox = h('div', { class: 'stack' });
  const shareBtn = h('button', { type: 'button', class: 'button' }, 'Share');
  shareBtn.addEventListener('click', async () => {
    const link = `${location.origin}${location.pathname}#d=${await encodeDeck(deck)}`;
    const field = h('input', { type: 'text', readonly: true, value: link, 'aria-label': 'Share link', class: 'share-field' });
    const msg = h('p', { class: 'muted small', role: 'status' });
    shareBox.replaceChildren(field, msg);
    try {
      await navigator.clipboard.writeText(link);
      msg.textContent = 'Link copied. Anyone with it can see this deck and save a copy. Your owned cards are not included.';
    } catch {
      field.select();
      msg.textContent = 'Copy the link above. Anyone with it can see this deck and save a copy. Your owned cards are not included.';
    }
  });

  // ---- Exporting ------------------------------------------------------------------------------
  const exportMsg = h('p', { class: 'muted small', role: 'status' });
  const copyBtn = h('button', { type: 'button', class: 'button' }, 'Copy deck');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(deckToText(deck));
      exportMsg.textContent = 'Deck copied.';
    } catch {
      exportMsg.textContent = "Couldn't copy. Use Download .txt instead.";
    }
  });
  const downloadBtn = h('button', { type: 'button', class: 'button' }, 'Download .txt');
  downloadBtn.addEventListener('click', async () => {
    try {
      await saveFile(deckToText(deck), deckFileName(deck), 'text/plain');
      exportMsg.textContent = 'Deck list saved.';
    } catch (e) {
      // Closing the share sheet rejects on some devices; that is not an error.
      if (!/cancel|dismiss/i.test(String((e as Error)?.message))) exportMsg.textContent = "Couldn't save the deck list. Try again.";
    }
  });

  const save = h('button', { type: 'button', class: 'button primary' }, 'Save to my decks');
  save.addEventListener('click', () => {
    ctx.saveDeck(deck);
    ctx.replace(`#/deck/${deck.id}`);
  });
  const sharedBanner = h('div', { class: 'banner row-between' }, h('p', {}, 'A shared deck. Save it to change it or track your cards.'), save);

  view.append(
    h(
      'section',
      { class: 'stack' },
      h('a', { href: '#/', class: 'back' }, '← Your decks'),
      readOnly ? sharedBanner : null,
      h(
        'div',
        { class: 'row-between' },
        titleBox,
        h('div', { class: 'actions' }, copyBtn, downloadBtn, readOnly ? null : shareBtn),
      ),
      exportMsg,
      shareBox,
      h(
        'div',
        { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Deck total'), total),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Still to buy'), toBuy),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Cards'), count),
      ),
      note,
      adder,
      columns,
      readOnly ? null : confirmBox,
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
      persist(deck);
      if (readOnly) adder.append(viewSwitch);
      else {
        adder.append(search.root, warningBox, status, viewSwitch);
        columns.classList.add('with-panel');
        panel = suggestionsPanel(ctx, () => priced, {
          add,
          swap,
          undo,
          lastSwap: () => lastSwap?.label ?? null,
          bracket: () => savedBracket(deck),
          // Saved quietly: not a deck edit, so it neither redraws the cards nor ends the Undo offer.
          setBracket: (bracket) => {
            deck = { ...deck, bracket };
            persist(deck);
          },
        });
        columns.append(panel.root);
      }
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
  onKeep: (p: PricedCard, keep: boolean) => void;
  /** A shared deck: no owned ticks, removing or changing printings. */
  readOnly?: boolean;
}

/** The controls every card gets in both views: link, owned tick, printing button, remove button. */
function cardControls(p: PricedCard, { onRemove, owned, onOwned, onPrinting, onKeep, readOnly }: TableHandlers) {
  const name = p.entry.card.name;
  const printing = p.card ? `${p.card.set.toUpperCase()} #${p.card.collector_number}` : '—';
  const finish = p.finish ? FINISH_LABEL[p.finish] : '';
  const link = (...children: Array<Node | string>) =>
    p.url ? h('a', { href: p.url, target: '_blank', rel: 'noopener' }, ...children) : h('span', {}, ...children);
  const own = () => {
    if (readOnly) return null;
    const box = h('input', { type: 'checkbox', 'aria-label': `Own ${name}`, checked: owned(p) });
    box.addEventListener('change', () => onOwned(p, box.checked));
    return box;
  };
  const printingControl = () => {
    if (readOnly || !p.prints.length) return h('span', {}, printing);
    const btn = h('button', { type: 'button', class: 'link-button', 'aria-label': `Change printing of ${name}`, title: 'Change printing' }, printing, ' ▾');
    btn.addEventListener('click', () => onPrinting(p));
    return btn;
  };
  const finishTag = () => (finish ? h('span', { class: 'tag' }, finish) : null);
  const remove = () => {
    if (readOnly || p.isCommander) return null;
    const btn = h('button', { type: 'button', class: 'icon-button', 'aria-label': `Remove ${name}`, title: p.entry.qty > 1 ? 'Remove one copy' : 'Remove from deck' }, '×');
    btn.addEventListener('click', () => onRemove(p));
    return btn;
  };
  /** "Keep" pins a card so suggestions never offer to cut or replace it. */
  const keepToggle = () => {
    if (readOnly || p.isCommander || isBasicLand(p.typeLine)) return null;
    const kept = !!p.entry.keep;
    const btn = h('button', { type: 'button', class: 'keep-toggle', 'aria-pressed': String(kept), 'aria-label': `Keep ${name}`, title: kept ? 'Kept: never suggested as a cut' : 'Keep: never suggest cutting this card' }, 'Keep');
    btn.addEventListener('click', () => onKeep(p, !kept));
    return btn;
  };
  const priceText = p.price != null ? usd(p.price) : p.failed ? "couldn't load" : 'no price';
  return { name, link, own, printingControl, finishTag, remove, keepToggle, priceText };
}

const asLine = (p: PricedCard) => ({ name: p.entry.card.name, typeLine: p.typeLine, qty: p.entry.qty, price: p.price, isCommander: p.isCommander, p });

/** Card images grouped by type, commander first. */
function grid(priced: PricedCard[], sort: SortKey, handlers: TableHandlers): HTMLElement {
  const groups = groupByType(priced.map(asLine), sort === 'price' ? 'price' : 'name');
  return h(
    'div',
    { class: 'stack' },
    ...groups.map(({ group, count, cards }) =>
      h(
        'section',
        { class: 'grid-group', 'aria-label': group },
        h('h3', {}, `${group} (${count})`),
        h(
          'ul',
          { class: 'card-grid' },
          ...cards.map(({ p }) => {
            const c = cardControls(p, handlers);
            const src = cardImage(p.card);
            const art = src
              ? h('img', { src, alt: c.name, loading: 'lazy', width: 488, height: 680 })
              : h('div', { class: 'card-missing', role: 'img', 'aria-label': c.name }, c.name);
            return h(
              'li',
              { class: 'card-tile' },
              h('div', { class: 'card-art' }, c.link(art), p.entry.qty > 1 ? h('span', { class: 'qty-badge' }, `×${p.entry.qty}`) : null),
              h('div', { class: 'card-meta' }, h('span', { class: 'card-tile-name' }, c.link(c.name)), h('span', { class: 'card-tile-price' }, c.priceText)),
              h('div', { class: 'card-printing' }, c.printingControl(), c.finishTag()),
              handlers.readOnly ? null : h('div', { class: 'card-tools' }, h('label', { class: 'own-label' }, c.own(), 'Owned'), c.keepToggle(), c.remove()),
            );
          }),
        ),
      ),
    ),
    h('p', { class: 'muted small' }, 'Card images from Scryfall. Prices are TCGplayer market prices for the cheapest printing. Card names open TCGplayer in a new tab.'),
  );
}

function table(priced: PricedCard[], sort: SortKey, handlers: TableHandlers): HTMLElement {
  const { onSort } = handlers;
  const byName = compareLines('name');
  const sorted = [...priced].sort((a, b) => {
    if (a.isCommander !== b.isCommander) return a.isCommander ? -1 : 1;
    if (sort === 'type') {
      const d = GROUP_ORDER.indexOf(typeGroup(a.typeLine)) - GROUP_ORDER.indexOf(typeGroup(b.typeLine));
      if (d) return d;
    }
    return compareLines(sort === 'price' ? 'price' : 'name')(asLine(a), asLine(b)) || byName(asLine(a), asLine(b));
  });

  const th = (key: SortKey | null, label: string, cls = '') => {
    if (!key) return h('th', { scope: 'col', class: cls }, label);
    const btn = h('button', { type: 'button', class: 'sort' }, label);
    btn.addEventListener('click', () => onSort(key));
    return h('th', { scope: 'col', class: cls, 'aria-sort': sort === key ? (key === 'price' ? 'descending' : 'ascending') : 'none' }, btn);
  };

  const rows = sorted.map((p) => {
    const c = cardControls(p, handlers);
    const nameEl = c.link(c.name);
    nameEl.setAttribute('data-testid', 'card-name');
    return h(
      'tr',
      {},
      h(
        'td',
        { class: 'name' },
        nameEl,
        p.isCommander ? h('span', { class: 'tag' }, 'Commander') : null,
        c.keepToggle(),
        // On phones the Printing column is hidden, so the printing shows under the name.
        h('div', { class: 'show-narrow sub' }, c.printingControl(), c.finishTag()),
      ),
      h('td', { class: 'type hide-narrow' }, p.isCommander ? 'Commander' : typeName(p.typeLine)),
      h('td', { class: 'printing hide-narrow' }, c.printingControl(), c.finishTag()),
      h('td', { class: 'num' }, p.entry.qty),
      h('td', { class: 'num' }, c.priceText),
      h('td', { class: 'num hide-narrow' }, p.price == null ? '—' : usd(p.price * p.entry.qty)),
      handlers.readOnly ? null : h('td', { class: 'owned' }, c.own()),
      handlers.readOnly ? null : h('td', { class: 'remove' }, c.remove()),
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
          h('tr', {}, th('name', 'Card'), th('type', 'Type', 'hide-narrow'), th(null, 'Printing', 'hide-narrow'), th(null, 'Qty', 'num'), th('price', 'Price', 'num'), th(null, 'Line total', 'num hide-narrow'), handlers.readOnly ? null : th(null, 'Owned', 'owned'), handlers.readOnly ? null : h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Remove'))),
        ),
        h('tbody', {}, ...rows),
      ),
    ),
    h('p', { class: 'muted small' }, 'Prices are TCGplayer market prices for the cheapest printing, via Scryfall. Card names open TCGplayer in a new tab.'),
  );
}

