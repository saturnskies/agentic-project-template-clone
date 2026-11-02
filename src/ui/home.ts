import type { AppContext } from './app';
import { h, usd } from './dom';

export function renderHome(view: HTMLElement, ctx: AppContext): void {
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
              h('span', { class: 'deck-card-name' }, d.name),
              h('span', { class: 'deck-card-commander' }, d.commander.name),
              h(
                'span',
                { class: 'deck-card-meta' },
                d.summary ? usd(d.summary.total) : 'Not priced yet',
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
}
