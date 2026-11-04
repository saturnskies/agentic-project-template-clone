import {
  CMDR_LETHAL,
  LIFE_PRESETS,
  MAX_PLAYERS,
  PALETTE,
  POISON_LETHAL,
  applyChange,
  counter,
  loadLife,
  newGame,
  parseStartingLife,
  resetGame,
  saveLife,
  seating,
  setPartners,
  undo,
  warnings,
  type Setup,
  type Target,
} from '../lib/life';
import { segmented } from './controls';
import { h } from './dom';

/** A press this long (ms) counts as a hold: ±10 instead of ±1. */
const HOLD_MS = 500;
/** After a hold registers, the one click that follows its release (a few ms later) is ignored; a deliberate tap after this long is not. */
const SWALLOW_MS = 150;
const UNSAVED = "Your browser is blocking storage, so this game won't be saved if you close the app.";

export interface Life {
  hasGame(): boolean;
  /** Draws the setup or the game for `route`. Drawn once per route: the container stays mounted while another tab shows. */
  render(view: HTMLElement, route: string): void;
}

/** A button that changes a counter: tap = ±1, hold = ±10 once, Shift+Enter = ±10. `delta` is 1 or -1. */
function holdButton(o: { text: string; aria: string; delta: 1 | -1; cls: string; onChange: (amount: number) => void }): HTMLButtonElement {
  const b = h('button', { type: 'button', class: o.cls, 'aria-label': o.aria, title: 'Tap for 1, hold for 10' }, o.text);
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
      o.onChange(o.delta * 10);
    }, HOLD_MS);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, stop);
  b.addEventListener('click', (e) => {
    if (performance.now() < swallowUntil) {
      swallowUntil = 0;
      return;
    }
    o.onChange(e.shiftKey ? o.delta * 10 : o.delta);
  });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  return b;
}

/** A modal question with two buttons; it removes itself when closed. */
function confirmDialog(host: HTMLElement, o: { id: string; title: string; text: string; keep: string; yes: string; onYes: () => void }) {
  const keep = h('button', { type: 'button', class: 'button' }, o.keep);
  const yes = h('button', { type: 'button', class: 'button primary' }, o.yes);
  const dlg = h('dialog', { class: 'picker', 'aria-labelledby': o.id }, h('h3', { id: o.id }, o.title), h('p', {}, o.text), h('div', { class: 'actions' }, keep, yes));
  dlg.addEventListener('close', () => dlg.remove());
  keep.addEventListener('click', () => dlg.close());
  yes.addEventListener('click', () => {
    dlg.close();
    o.onYes();
  });
  host.append(dlg);
  dlg.showModal();
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
      confirmDialog(view, { id: 'life-confirm-h', title: 'Replace the game in progress?', text: 'Its life totals will be lost.', keep: 'Keep current game', yes: 'Replace it', onYes: begin });
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
    const seats = store.game!.players.map((_, i) => i);
    const parts = new Map<number, { life: HTMLElement; badges: HTMLElement; warn: HTMLElement; el: HTMLElement }>();

    /** Redraws everything a seat's tile shows from the saved game. */
    const updateTile = (seat: number) => {
      const g = store.game!;
      const p = g.players[seat];
      const t = parts.get(seat)!;
      t.life.textContent = String(p.life);
      const worst = Math.max(0, ...Object.values(p.cmdr));
      t.badges.replaceChildren(...[p.poison > 0 ? `Poison ${p.poison}` : null, worst > 0 ? `Commander ${worst}` : null].filter((x): x is string => !!x).map((x) => h('span', { class: 'badge' }, x)));
      const why = warnings(g, seat);
      t.warn.textContent = why.join(' · ');
      t.el.dataset.warn = String(why.length > 0);
    };
    const updateAll = () => seats.forEach(updateTile);

    /** One change by one player, saved, with that player's tile redrawn. Returns the counter's new value. */
    const adjust = (seat: number, target: Target, delta: number) => {
      store.game = applyChange(store.game!, seat, target, delta);
      updateTile(seat);
      persist();
      return counter(store.game, seat, target);
    };

    const tile = (seat: number, flipped: boolean) => {
      const p = store.game!.players[seat];
      const life = h('output', { class: 'tile-life' }, String(p.life));
      const badges = h('span', { class: 'tile-badges' });
      const warn = h('p', { class: 'tile-warn', 'aria-live': 'polite' });
      const counters = h('button', { type: 'button', class: 'tile-counters', 'aria-label': `${p.name}: poison and commander damage` }, 'Counters');
      counters.addEventListener('click', () => openSheet(seat));
      const btn = (delta: 1 | -1) =>
        holdButton({ text: delta < 0 ? '−' : '+', aria: `${p.name}: ${delta < 0 ? 'lose' : 'gain'} 1 life`, delta, cls: `life-btn ${delta < 0 ? 'minus' : 'plus'}`, onChange: (n) => adjust(seat, { kind: 'life' }, n) });
      const el = h(
        'div',
        { class: 'tile', 'data-player': seat, 'data-rotate': flipped ? '180' : '0', 'data-warn': 'false', style: `--tile:${PALETTE[seat % PALETTE.length].hex}` },
        h(
          'div',
          { class: 'tile-inner' },
          h('div', { class: 'tile-head' }, h('span', { class: 'tile-name' }, p.name), counters),
          h('div', { class: 'tile-mid' }, life, badges, warn),
          h('div', { class: 'tile-buttons' }, btn(-1), btn(1)),
        ),
      );
      parts.set(seat, { life, badges, warn, el });
      return el;
    };

    /** The per-player sheet: poison, whether the commander has a partner, and damage taken from each opponent's commander. */
    function openSheet(seat: number) {
      const g = store.game!;
      const me = g.players[seat];
      const row = (label: string, target: Target, lethalAt: number) => {
        const value = h('output', { class: 'counter-value' }, String(counter(store.game!, seat, target)));
        const flag = h('span', { class: 'lethal' });
        const el = h('div', { class: 'counter-row', role: 'group', 'aria-label': label }, h('span', { class: 'counter-label' }, label, flag));
        const refresh = (v: number) => {
          value.textContent = String(v);
          flag.textContent = v >= lethalAt ? 'Lethal' : '';
          el.dataset.warn = String(v >= lethalAt);
        };
        const btn = (delta: 1 | -1) => holdButton({ text: delta < 0 ? '−' : '+', aria: `${label}: ${delta < 0 ? 'remove' : 'add'} 1`, delta, cls: 'counter-btn', onChange: (n) => refresh(adjust(seat, target, n)) });
        el.append(btn(-1), value, btn(1));
        refresh(counter(store.game!, seat, target));
        return el;
      };
      const partner = h('input', { type: 'checkbox' }) as HTMLInputElement;
      partner.checked = me.partners;
      partner.addEventListener('change', () => {
        store.game = setPartners(store.game!, seat, partner.checked);
        updateAll();
        persist();
      });
      const rows = seats
        .filter((o) => o !== seat)
        .flatMap((o) => {
          const other = g.players[o];
          const main = row(`Damage from ${other.name}`, { kind: 'cmdr', from: o, slot: 0 }, CMDR_LETHAL);
          return other.partners ? [main, row(`Damage from ${other.name}'s partner`, { kind: 'cmdr', from: o, slot: 1 }, CMDR_LETHAL)] : [main];
        });
      const close = h('button', { type: 'button', class: 'button' }, 'Close');
      const dlg = h(
        'dialog',
        { class: 'picker sheet', 'aria-labelledby': 'sheet-h' },
        h('h2', { id: 'sheet-h' }, `${me.name}: counters`),
        row('Poison', { kind: 'poison' }, POISON_LETHAL),
        h('label', { class: 'check' }, partner, ' Has a partner commander'),
        rows.length ? h('h3', {}, 'Commander damage taken') : null,
        ...rows,
        h('div', { class: 'actions' }, close),
      );
      close.addEventListener('click', () => dlg.close());
      dlg.addEventListener('close', () => dlg.remove());
      view.append(dlg);
      dlg.showModal();
    }

    const { top, bottom } = seating(seats.length);
    const undoBtn = h('button', { type: 'button', class: 'button' }, 'Undo') as HTMLButtonElement;
    const refreshUndo = () => (undoBtn.disabled = store.game!.history.length === 0);
    undoBtn.addEventListener('click', () => {
      store.game = undo(store.game!);
      updateAll();
      refreshUndo();
      persist();
    });
    const reset = h('button', { type: 'button', class: 'button danger' }, 'Reset life totals');
    reset.addEventListener('click', () =>
      confirmDialog(view, {
        id: 'reset-h',
        title: 'Reset all life totals?',
        text: 'Life goes back to the starting total, poison and commander damage clear, and Undo is emptied.',
        keep: 'Keep playing',
        yes: 'Reset',
        onYes: () => {
          store.game = resetGame(store.game!);
          updateAll();
          refreshUndo();
          persist();
        },
      }),
    );
    const close = h('button', { type: 'button', class: 'button' }, 'Close');
    const menu = h('dialog', { class: 'picker', 'aria-labelledby': 'game-menu-h' }, h('h2', { id: 'game-menu-h' }, 'Game menu'), notice(), h('div', { class: 'actions' }, undoBtn, reset, h('a', { class: 'button', href: '#/life' }, 'Leave game'), close));
    close.addEventListener('click', () => menu.close());
    const open = h('button', { type: 'button', class: `table-menu${top.length ? '' : ' corner'}`, 'aria-label': 'Game menu' }, 'Menu');
    open.addEventListener('click', () => {
      refreshUndo();
      menu.showModal();
    });

    view.replaceChildren(
      h('section', { class: 'table', 'aria-label': 'Life totals' }, top.length ? h('div', { class: 'table-row top' }, ...top.map((s) => tile(s, true))) : null, h('div', { class: 'table-row bottom' }, ...bottom.map((s) => tile(s, false))), open, menu),
    );
    updateAll();
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
