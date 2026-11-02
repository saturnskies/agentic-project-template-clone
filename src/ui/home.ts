import type { AppContext } from './app';
import { cardArt } from '../lib/groups';
import { cardsByOracleId } from '../scryfall/cards';
import { h, usd } from './dom';

export function renderHome(view: HTMLElement, ctx: AppContext): void {
  const arts = new Map<string, HTMLImageElement[]>();
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
              deckArt(d.commander.oracleId, arts),
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
  );

  // One batched, cached lookup fills in every commander's art; if it fails the decks still show without it.
  if (arts.size) {
    cardsByOracleId(ctx.client, [...arts.keys()])
      .then((cards) => {
        for (const [id, imgs] of arts) {
          const src = cardArt(cards.get(id) ?? null);
          if (!src) continue;
          for (const img of imgs) {
            img.addEventListener('load', () => img.classList.add('loaded'));
            img.src = src;
          }
        }
      })
      .catch(() => {});
  }
}

/** An empty art slot for a deck card, filled in once the commander's image URL is known. */
function deckArt(oracleId: string, arts: Map<string, HTMLImageElement[]>): HTMLElement {
  const img = h('img', { class: 'deck-card-art', alt: '', loading: 'lazy' }) as HTMLImageElement;
  arts.set(oracleId, [...(arts.get(oracleId) ?? []), img]);
  return h('span', { class: 'deck-card-art-slot' }, img);
}
