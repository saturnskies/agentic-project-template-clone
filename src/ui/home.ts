import type { Deck } from '../lib/deck';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { cardArt } from '../lib/groups';
import { cardsByOracleId, cardsByPrintingId } from '../scryfall/cards';
import { backupSection } from './backup';
import { h, usd } from './dom';

export function renderHome(view: HTMLElement, ctx: AppContext): void {
  const arts = new Map<string, HTMLImageElement>();
  const decks = [...ctx.store.decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const actions = h('div', { class: 'actions' }, h('a', { class: 'button primary', href: '#/new' }, 'New deck'), h('a', { class: 'button', href: '#/paste' }, 'Paste a list'));

  const body = decks.length
    ? h(
        'ul',
        { class: 'deck-list' },
        ...decks.map((d) =>
          h(
            'li',
            {},
            h(
              'a',
              { class: 'deck-card', href: `#/deck/${d.id}` },
              deckArt(d.id, arts),
              h('span', { class: 'deck-card-name' }, d.name),
              h('span', { class: 'deck-card-commander' }, d.commander.name),
              h(
                'span',
                { class: 'deck-card-meta' },
                d.summary ? usd(d.summary.total) : 'Not priced yet',
                d.summary?.toBuy != null ? ` · ${usd(d.summary.toBuy)} to buy` : '',
                ' · ',
                `edited ${new Date(d.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
              ),
            ),
          ),
        ),
      )
    : h(
        'div',
        { class: 'empty' },
        h('p', {}, h('strong', {}, 'No decks yet.')),
        h('p', {}, 'Start a deck from a commander, or paste a decklist from any deck site to see what each card costs on TCGplayer.'),
      );

  view.append(
    h('section', { class: 'stack', 'aria-labelledby': 'decks-h' }, h('div', { class: 'row-between' }, h('h2', { id: 'decks-h' }, 'Your decks'), actions), body),
    backupSection(ctx),
  );

  // Two batched, cached lookups fill in the art: the printing each user picked for their commander,
  // else whichever printing Scryfall returns. If they fail the decks still show without art.
  if (arts.size) {
    const picked = decks.filter((d) => d.commanderPrintingId);
    const rest = decks.filter((d) => !d.commanderPrintingId);
    const fill = (d: Deck, card: ScryCard | undefined) => {
      const img = arts.get(d.id);
      const src = cardArt(card ?? null);
      if (!img || !src) return;
      img.addEventListener('load', () => img.classList.add('loaded'));
      img.src = src;
    };
    cardsByPrintingId(ctx.client, picked.map((d) => d.commanderPrintingId!))
      .then((cards) => picked.forEach((d) => fill(d, cards.get(d.commanderPrintingId!))))
      .catch(() => {});
    cardsByOracleId(ctx.client, rest.map((d) => d.commander.oracleId))
      .then((cards) => rest.forEach((d) => fill(d, cards.get(d.commander.oracleId))))
      .catch(() => {});
  }
}

/** An empty art slot for a deck card, filled in once the commander's image URL is known. */
function deckArt(deckId: string, arts: Map<string, HTMLImageElement>): HTMLElement {
  const img = h('img', { class: 'deck-card-art', alt: '', loading: 'lazy' }) as HTMLImageElement;
  arts.set(deckId, img);
  return h('span', { class: 'deck-card-art-slot' }, img);
}
