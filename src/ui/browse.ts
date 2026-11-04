import { h } from './dom';

/** Placeholder until Browse ships (part 2 of the tab bar spec); the tab, route and container already exist. */
export function renderBrowse(view: HTMLElement): void {
  view.replaceChildren(
    h('section', { class: 'stack', 'aria-labelledby': 'browse-h' }, h('h2', { id: 'browse-h' }, 'Browse'), h('p', {}, 'Search every card here soon.'), h('a', { class: 'button', href: '#/' }, 'Back to your decks')),
  );
}
