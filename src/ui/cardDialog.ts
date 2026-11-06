import { tcgplayerUrl } from '../lib/price';
import { PAGE_SIZE, type SwapOption } from '../lib/similar';
import type { PricedCard } from '../scryfall/resolve';
import { rulesText } from '../scryfall/suggest';
import type { ScryCard } from '../scryfall/types';
import { h, usd } from './dom';
import type { PanelActions, SwapPanel } from './suggestions';

/** "Better fit" only means more played for this commander, never faster or more efficient, and the label says so. */
const betterFitTag = (tappedName: string) => {
  const meaning = `More played than ${tappedName} for this commander`;
  return h('span', { class: 'tag', title: meaning }, 'Better fit', h('span', { class: 'visually-hidden' }, `: ${meaning}`));
};

const costOf = (c: ScryCard) => c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? '';

/**
 * The dialog behind a deck card's name (swap-from-card spec): the card pinned on top with its cost,
 * price, text and popularity, and below it the cards that do a similar job and fit the deck, read from
 * what the suggestions panel has loaded. It never fetches; if the panel hasn't searched yet it starts the
 * panel's own Find and fills in when the panel redraws. Swap on an option is the Suggestions tab's swap: the
 * deck redraws, which closes the dialog, and the same Undo offer follows.
 */
export function cardDialog(panel: SwapPanel, swap: PanelActions['swap']): { root: HTMLDialogElement; open(card: PricedCard): void } {
  const dialog = h('dialog', { class: 'picker card-dialog swap-dialog', 'aria-labelledby': 'swap-h' });
  const title = h('h3', { id: 'swap-h' });
  const close = h('button', { type: 'button', class: 'button' }, 'Close');
  close.addEventListener('click', () => dialog.close());
  const content = h('div', { class: 'stack' });
  dialog.append(h('div', { class: 'picker-head' }, title, close), content);

  /** The card shown, and how many options. */
  let current: PricedCard | null = null;
  let shown = PAGE_SIZE;

  const optionItem = (o: SwapOption) => {
    const c = o.suggestion.card;
    const cost = costOf(c);
    const cutId = current!.entry.card.oracleId;
    const swapBtn = h('button', { type: 'button', class: 'button', 'aria-label': `Swap ${current!.entry.card.name} for ${c.name}` }, 'Swap');
    const err = h('span', { class: 'muted small', role: 'status' });
    swapBtn.addEventListener('click', async () => {
      swapBtn.disabled = true;
      swapBtn.textContent = 'Working…';
      err.textContent = '';
      try {
        await swap(cutId, c);
      } catch {
        err.textContent = "Couldn't reach Scryfall. Try again.";
      } finally {
        // A swap that went through has redrawn the deck and closed the dialog; otherwise the button is usable again.
        swapBtn.disabled = false;
        swapBtn.textContent = 'Swap';
      }
    });
    return h(
      'li',
      { class: 'swap-option' },
      h(
        'div',
        { class: 'sugg-head' },
        h('span', {}, h('a', { href: tcgplayerUrl(c, o.suggestion.finish), target: '_blank', rel: 'noopener', class: 'sugg-name' }, c.name), o.betterFit ? betterFitTag(current!.entry.card.name) : null),
        h('span', { class: 'sugg-price' }, usd(o.suggestion.price)),
      ),
      h('p', { class: 'muted small swap-type' }, c.type_line ?? c.card_faces?.[0]?.type_line ?? ''),
      cost ? h('p', { class: 'mana-cost small' }, cost) : null,
      o.differences.length ? h('p', { class: 'small swap-diff' }, o.differences.join(' · ')) : null,
      h('p', { class: 'muted small sugg-reason' }, o.suggestion.reason),
      h('p', { class: 'swap-text small' }, rulesText(c)),
      h('span', { class: 'actions' }, swapBtn, err),
    );
  };

  /**
   * The one live region, kept in place across redraws so a change to its text is announced: it says only the
   * loading, failed and empty lines, never the option list.
   */
  const live = h('p', { class: 'muted small', role: 'status' });
  const cardBox = h('div', { class: 'stack' });
  const listBox = h('div', { class: 'stack' });
  content.append(cardBox, h('h4', {}, 'Similar cards that fit your deck'), live, listBox);

  /** The line for `live` ('' when there is none), and what goes below it. */
  const optionsView = (state: ReturnType<SwapPanel['swapOptions']>): { line: string; items: Array<HTMLElement | null> } => {
    if (state.status === 'idle' || state.status === 'loading') return { line: 'Finding similar cards…', items: [] };
    if (state.status === 'unavailable') return { line: 'No card details to compare for this card.', items: [] };
    if (state.status !== 'ready') {
      const retry = h('button', { type: 'button', class: 'button' }, 'Try again');
      retry.addEventListener('click', () => panel.find());
      return { line: "Couldn't load the cards to compare with. Check your connection and try again.", items: [retry] };
    }
    const { options } = state;
    if (!options.length) return { line: 'No similar cards found for this deck yet.', items: [] };
    const more = h('button', { type: 'button', class: 'button' }, 'Show more');
    more.addEventListener('click', () => {
      const from = shown;
      shown += PAGE_SIZE;
      render();
      content.querySelectorAll<HTMLElement>('.swap-option')[from]?.querySelector('a')?.focus();
    });
    return {
      line: '',
      items: [
        // Without EDHREC's page the options come from card rules, which is a looser match.
        state.source === 'rules' ? h('p', { class: 'notice small' }, 'Matching is approximate: EDHREC has no page for this commander, so these come from card rules.') : null,
        h('ul', { class: 'sugg-list', 'aria-label': 'Similar cards' }, ...options.slice(0, shown).map(optionItem)),
        options.length > shown ? more : null,
      ],
    };
  };

  const render = () => {
    if (!current) return;
    const p = current;
    const card = p.card;
    const state = panel.swapOptions(p.entry.card.oracleId);
    const cost = card ? costOf(card) : '';
    title.textContent = p.entry.card.name;
    cardBox.replaceChildren(
      h(
        'section',
        { class: 'swap-card stack', 'aria-label': 'Your card' },
        h(
          'div',
          { class: 'sugg-head' },
          h('span', { class: 'muted small' }, p.typeLine),
          h('span', { class: 'detail-price' }, p.price != null ? usd(p.price) : 'no price'),
        ),
        cost ? h('p', { class: 'mana-cost' }, cost) : null,
        state.status === 'ready' && state.popularity ? h('p', { class: 'small', 'data-testid': 'tapped-popularity' }, state.popularity) : null,
        state.status === 'ready' && !state.listed ? h('p', { class: 'muted small' }, "Not on this commander's page") : null,
        h('p', { class: 'swap-text' }, rulesText(card)),
        p.url ? h('a', { href: p.url, target: '_blank', rel: 'noopener' }, 'Buy on TCGplayer') : null,
      ),
    );
    const view = optionsView(state);
    if (live.textContent !== view.line) live.textContent = view.line;
    listBox.replaceChildren(...view.items.filter((x): x is HTMLElement => !!x));
  };

  // The panel redraws as its lists load and as the deck changes; an open dialog follows.
  panel.onUpdate(() => {
    if (dialog.open) render();
  });
  dialog.addEventListener('close', () => (current = null));

  return {
    root: dialog,
    open: (card) => {
      current = card;
      shown = PAGE_SIZE;
      // Before the first search, opening the dialog starts it: the same load as Find suggestions.
      if (panel.swapOptions(card.entry.card.oracleId).status === 'idle') panel.find();
      render();
      dialog.showModal();
    },
  };
}
