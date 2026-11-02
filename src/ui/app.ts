import type { Deck } from '../lib/deck';
import { browserStorage, loadStore, saveStore, type Store } from '../lib/storage';
import { createClient, type ScryfallClient } from '../scryfall/client';
import { renderDeck } from './deckView';
import { h } from './dom';
import { renderHome } from './home';
import { renderPaste } from './paste';

/** Shared state and actions every screen gets. */
export interface AppContext {
  client: ScryfallClient;
  store: Store;
  persistent: boolean;
  saveDeck(deck: Deck): void;
  deleteDeck(id: string): void;
  go(route: string): void;
}

export function startApp(root: HTMLElement): void {
  const storage = browserStorage();
  const { store, persistent } = loadStore(storage);
  const save = () => void saveStore(storage, store);

  const ctx: AppContext = {
    client: createClient(),
    store,
    persistent,
    saveDeck(deck) {
      const i = store.decks.findIndex((d) => d.id === deck.id);
      if (i >= 0) store.decks[i] = deck;
      else store.decks.unshift(deck);
      save();
    },
    deleteDeck(id) {
      store.decks = store.decks.filter((d) => d.id !== id);
      save();
    },
    go(route) {
      if (location.hash === route) render();
      else location.hash = route;
    },
  };

  const banner = persistent
    ? null
    : h('p', { class: 'banner', role: 'status' }, "Your browser is blocking storage, so decks won't be saved after you close this tab.");
  const view = h('div', { class: 'view' });
  root.replaceChildren(...(banner ? [banner, view] : [view]));

  function render() {
    const route = location.hash.replace(/^#/, '') || '/';
    const deckMatch = route.match(/^\/deck\/([\w-]+)$/);
    view.replaceChildren();
    if (route === '/paste') renderPaste(view, ctx);
    else if (deckMatch) renderDeck(view, ctx, deckMatch[1]);
    else renderHome(view, ctx);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  render();
}
