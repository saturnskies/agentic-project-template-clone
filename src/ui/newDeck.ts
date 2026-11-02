import { searchCommanders } from '../scryfall/cards';
import { buildDeck } from '../scryfall/resolve';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { combobox } from './combobox';
import { h } from './dom';

export function renderNewDeck(view: HTMLElement, ctx: AppContext): void {
  let commander: ScryCard | null = null;

  const name = h('input', { id: 'deck-name', type: 'text', autocomplete: 'off', placeholder: 'Optional, e.g. Edgar Vampires' });
  const chosen = h('p', { class: 'muted' }, 'Search for a legendary creature, or any card that can be your commander.');
  const create = h('button', { type: 'button', class: 'button primary', disabled: true }, 'Create deck');

  const search = combobox<ScryCard>({
    id: 'commander-search',
    label: 'Commander',
    placeholder: 'Start typing a name, e.g. Edgar',
    search: (typed) => searchCommanders(ctx.client, typed),
    render: (c) => ({ label: c.name, detail: c.type_line ?? c.card_faces?.[0]?.type_line }),
    onPick: (c) => {
      commander = c;
      search.input.value = c.name;
      chosen.replaceChildren(h('strong', {}, `Commander: ${c.name}`));
      create.disabled = false;
    },
  });

  create.addEventListener('click', () => {
    if (!commander) return;
    const deck = buildDeck(name.value, [], commander);
    ctx.saveDeck(deck);
    ctx.replace(`#/deck/${deck.id}`);
  });

  view.append(
    h(
      'section',
      { class: 'stack narrow' },
      h('h2', {}, 'New deck'),
      h('div', { class: 'field' }, h('label', { for: 'deck-name' }, 'Deck name'), name),
      search.root,
      chosen,
      h('div', { class: 'actions' }, create, h('a', { class: 'button', href: '#/' }, 'Cancel')),
    ),
  );
  search.input.focus();
}
