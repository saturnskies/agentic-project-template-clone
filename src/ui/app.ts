import type { Deck } from '../lib/deck';
import { setOwned as setOwnedIn } from '../lib/owned';
import { browserStorage, loadStore, saveStore, type Store } from '../lib/storage';
import { createClient, type ScryfallClient } from '../scryfall/client';
import { renderDeck, renderShared } from './deckView';
import { h } from './dom';
import { renderHome } from './home';
import { renderNewDeck } from './newDeck';
import { renderPaste } from './paste';

/** Shared state and actions every screen gets. */
export interface AppContext {
  client: ScryfallClient;
  store: Store;
  persistent: boolean;
  saveDeck(deck: Deck): void;
  deleteDeck(id: string): void;
  /** Ticks or unticks a card in the owned collection shared by every deck. */
  setOwned(oracleId: string, typeLine: string, owned: boolean): void;
  /** Remembers the list or grid view for every deck. */
  setView(view: 'list' | 'grid'): void;
  go(route: string): void;
  /** Like go, but swaps the current history entry, so back skips the screen we just left. */
  replace(route: string): void;
  /** Redraws the current screen (after the store changed underneath it). */
  refresh(): void;
  /** Overwrites the saved decks, owned cards and view with `next` (used by restore) and saves. */
  replaceStore(next: Store): void;
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
    setOwned(oracleId, typeLine, owned) {
      const next = setOwnedIn(store, oracleId, typeLine, owned);
      store.owned = next.owned;
      store.unownedBasics = next.unownedBasics;
      save();
    },
    setView(view) {
      store.prefs = { ...store.prefs, view };
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
    replace(route) {
      if (location.hash === route) render();
      else location.replace(route);
    },
    refresh: () => render(),
    replaceStore(next) {
      store.decks = next.decks;
      store.owned = next.owned;
      store.unownedBasics = next.unownedBasics;
      store.prefs = next.prefs;
      save();
    },
  };

  const banner = persistent
    ? null
    : h('p', { class: 'banner', role: 'status' }, "Your browser is blocking storage, so decks won't be saved after you close this tab.");
  const view = h('div', { class: 'view' });
  root.replaceChildren(...(banner ? [banner, view] : [view]));

  function render() {
    const route = location.hash.replace(/^#/, '') || '/';
    if (route.startsWith('d=')) {
      view.replaceChildren();
      void renderShared(view, ctx, route.slice(2));
      window.scrollTo(0, 0);
      return;
    }
    const deckMatch = route.match(/^\/deck\/([\w-]+)$/);
    view.replaceChildren();
    if (route === '/paste') renderPaste(view, ctx);
    else if (route === '/new') renderNewDeck(view, ctx);
    else if (deckMatch) renderDeck(view, ctx, deckMatch[1]);
    else renderHome(view, ctx);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  render();
}
