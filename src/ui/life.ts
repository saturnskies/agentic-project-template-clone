import { LIFE_PRESETS, MAX_PLAYERS, PALETTE, changeLife, loadLife, newGame, parseStartingLife, saveLife, seating, type Setup } from '../lib/life';
import { segmented } from './controls';
import { h } from './dom';

/** A press this long (ms) counts as a hold: ±10 instead of ±1. */
const HOLD_MS = 500;
/** After a hold registers, the click that follows its release is ignored for this long (ms). */
const SWALLOW_MS = 350;
const UNSAVED = "Your browser is blocking storage, so this game won't be saved if you close the app.";

export interface Life {
  hasGame(): boolean;
  /** Draws the setup or the game for `route`. Drawn once per route: the container stays mounted while another tab shows. */
  render(view: HTMLElement, route: string): void;
}

/** The Life Counter: setup screen at `#/life`, the full-screen game at `#/life/game`, saved under its own key after every change. */
export function createLife(storage: Storage | null): Life {
  const loaded = loadLife(storage);
  const store = loaded.store;
  /** A newer version's save sits in storage: leave it alone until a new game starts. */
  let future = loaded.future;
  let saved = loaded.persistent;
  let drawn: string | null = null;
  let notices: HTMLElement[] = [];

  // The setup being edited; it lives here so redrawing the screen keeps what was picked.
  const draft: Setup = { ...store.setup, names: [...store.setup.names] };
  let custom = !(LIFE_PRESETS as readonly number[]).includes(draft.startingLife);
  let customText = custom ? String(draft.startingLife) : '';

  const notice = () => {
    const n = h('p', { class: 'banner notice', role: 'status' }, saved ? '' : UNSAVED);
    notices.push(n);
    return n;
  };
  const persist = () => {
    if (future) return;
    saved = saveLife(storage, store);
    for (const n of notices) n.textContent = saved ? '' : UNSAVED;
  };

  function begin() {
    store.setup = { players: draft.players, startingLife: draft.startingLife, names: [...draft.names] };
    store.game = newGame(store.setup);
    future = false;
    persist();
    location.hash = '#/life/game';
  }

  function drawSetup(view: HTMLElement) {
    notices = [];
    const redraw = () => drawSetup(view);
    const startLife = custom ? parseStartingLife(customText) : draft.startingLife;
    const lifeOptions = [...LIFE_PRESETS.map((n) => ({ id: String(n), label: String(n) })), { id: 'custom', label: 'Custom' }];

    const field = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', value: customText, 'aria-describedby': 'life-custom-hint' }) as HTMLInputElement;
    const hint = h('p', { id: 'life-custom-hint', class: 'small muted', role: 'status' });
    const go = h('button', { type: 'button', class: 'button primary' }, store.game ? 'New game' : 'Start game') as HTMLButtonElement;
    const check = () => {
      const n = parseStartingLife(customText);
      hint.textContent = n == null ? 'Enter a whole number from 1 to 999.' : '';
      go.disabled = n == null;
      if (n != null) draft.startingLife = n;
    };
    field.addEventListener('input', () => {
      customText = field.value;
      check();
    });
    if (custom) check();

    go.addEventListener('click', () => {
      if (!store.game) return begin();
      const keep = h('button', { type: 'button', class: 'button' }, 'Keep current game');
      const replace = h('button', { type: 'button', class: 'button primary' }, 'Replace it');
      const dlg = h('dialog', { class: 'picker', 'aria-labelledby': 'life-confirm-h' }, h('h3', { id: 'life-confirm-h' }, 'Replace the game in progress?'), h('p', {}, 'Its life totals will be lost.'), h('div', { class: 'actions' }, keep, replace));
      dlg.addEventListener('close', () => dlg.remove());
      keep.addEventListener('click', () => dlg.close());
      replace.addEventListener('click', () => {
        dlg.close();
        begin();
      });
      view.append(dlg);
      dlg.showModal();
    });

    view.replaceChildren(
      h(
        'section',
        { class: 'stack', 'aria-labelledby': 'life-h' },
        h('h2', { id: 'life-h' }, 'Life Counter'),
        store.game ? h('div', { class: 'actions' }, h('a', { class: 'button primary', href: '#/life/game' }, 'Resume game')) : null,
        notice(),
        h('div', { class: 'stack' }, h('strong', {}, 'Players'), segmented('Players', Array.from({ length: MAX_PLAYERS }, (_, i) => ({ id: String(i + 1), label: String(i + 1) })), String(draft.players), (id) => ((draft.players = Number(id)), redraw()))),
        h(
          'div',
          { class: 'stack' },
          h('strong', {}, 'Starting life'),
          segmented('Starting life', lifeOptions, custom ? 'custom' : String(draft.startingLife), (id) => {
            custom = id === 'custom';
            if (!custom) draft.startingLife = Number(id);
            else if (startLife != null) customText = customText || String(startLife);
            redraw();
          }),
          custom ? h('label', { class: 'stack' }, 'Custom starting life', field) : null,
          custom ? hint : null,
        ),
        h('div', { class: 'actions' }, go),
      ),
    );
    if (custom) check();
  }

  function drawGame(view: HTMLElement) {
    notices = [];
    const players = store.game!.players;
    const out = new Map<number, HTMLElement>();
    const change = (seat: number, delta: number) => {
      store.game = changeLife(store.game!, seat, delta);
      out.get(seat)!.textContent = String(store.game.players[seat].life);
      persist();
    };

    /** −/+ for one player: tap = ±1, hold = ±10 once, Shift+Enter = ±10. */
    const lifeButton = (seat: number, delta: 1 | -1) => {
      const who = store.game!.players[seat].name;
      const b = h('button', { type: 'button', class: `life-btn ${delta < 0 ? 'minus' : 'plus'}`, 'aria-label': `${who}: ${delta < 0 ? 'lose' : 'gain'} 1 life`, title: 'Tap for 1, hold for 10' }, delta < 0 ? '−' : '+');
      let timer = 0;
      let held = false;
      let swallowUntil = 0;
      const stop = () => {
        window.clearTimeout(timer);
        timer = 0;
        if (held) swallowUntil = performance.now() + SWALLOW_MS;
        held = false;
      };
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        stop();
        timer = window.setTimeout(() => {
          timer = 0;
          held = true;
          change(seat, delta * 10);
        }, HOLD_MS);
      });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, stop);
      b.addEventListener('click', (e) => {
        if (performance.now() < swallowUntil) return;
        change(seat, e.shiftKey ? delta * 10 : delta);
      });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };

    const tile = (seat: number, flipped: boolean) => {
      const life = h('output', { class: 'tile-life' }, String(players[seat].life));
      out.set(seat, life);
      return h(
        'div',
        { class: 'tile', 'data-player': seat, 'data-rotate': flipped ? '180' : '0', style: `--tile:${PALETTE[seat % PALETTE.length].hex}` },
        h('div', { class: 'tile-inner' }, h('span', { class: 'tile-name' }, players[seat].name), life, h('div', { class: 'tile-buttons' }, lifeButton(seat, -1), lifeButton(seat, 1))),
      );
    };

    const { top, bottom } = seating(players.length);
    const close = h('button', { type: 'button', class: 'button' }, 'Close');
    const menu = h('dialog', { class: 'picker', 'aria-labelledby': 'game-menu-h' }, h('h2', { id: 'game-menu-h' }, 'Game menu'), notice(), h('div', { class: 'actions' }, h('a', { class: 'button', href: '#/life' }, 'Leave game'), close));
    close.addEventListener('click', () => menu.close());
    const open = h('button', { type: 'button', class: `table-menu${top.length ? '' : ' corner'}`, 'aria-label': 'Game menu' }, 'Menu');
    open.addEventListener('click', () => menu.showModal());

    view.replaceChildren(
      h('section', { class: 'table', 'aria-label': 'Life totals' }, top.length ? h('div', { class: 'table-row top' }, ...top.map((s) => tile(s, true))) : null, h('div', { class: 'table-row bottom' }, ...bottom.map((s) => tile(s, false))), open, menu),
    );
  }

  return {
    hasGame: () => !!store.game,
    render(view, route) {
      if (route === drawn) return;
      drawn = route;
      if (route === '#/life/game' && store.game) drawGame(view);
      else drawSetup(view);
    },
  };
}
