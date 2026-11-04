import { keepAwake, type AwakeDeps, type AwakeState } from '../lib/awake';
import {
  CMDR_LETHAL,
  LIFE_PRESETS,
  MAX_NAME,
  MAX_PLAYERS,
  PALETTE,
  POISON_LETHAL,
  applyChange,
  counter,
  loadLife,
  newGame,
  parseStartingLife,
  randomSeat,
  resetGame,
  saveLife,
  seatColor,
  seating,
  setColor,
  setFirst,
  setName,
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
const AWAKE_MSG = 'Your screen may turn off during the game.';
/** The roll highlights a tile every this many ms, around the table twice and on to the winner. */
const ROLL_STEP_MS = 100;

export interface Life {
  hasGame(): boolean;
  /** Draws the setup or the game for `route`. Drawn once per route: the container stays mounted while another tab shows. */
  render(view: HTMLElement, route: string): void;
  /** True while the game screen is showing: keeps the screen awake then, and lets go otherwise. */
  setAwake(on: boolean): void;
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

const padded = <T,>(items: T[], blank: T): T[] => Array.from({ length: MAX_PLAYERS }, (_, i) => items[i] ?? blank);

/** One row per seat: a name field and the eight color swatches. The setup and the in-game edit dialog both use it. */
function playerRows(o: { count: number; name(seat: number): string; color(seat: number): number; onName(seat: number, value: string): void; onColor(seat: number, color: number): void }): HTMLElement {
  return h(
    'div',
    { class: 'player-rows' },
    ...Array.from({ length: o.count }, (_, seat) => {
      const input = h('input', { type: 'text', maxlength: MAX_NAME, autocomplete: 'off', placeholder: `Player ${seat + 1}`, value: o.name(seat), 'aria-label': `Name for player ${seat + 1}` });
      input.addEventListener('input', () => o.onName(seat, input.value));
      const buttons = PALETTE.map((c, i) => {
        const b = h('button', { type: 'button', class: 'swatch', 'aria-label': c.name, 'aria-pressed': String(i === o.color(seat)), style: `--swatch:${c.hex}` });
        b.addEventListener('click', () => {
          o.onColor(seat, i);
          buttons.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
        });
        return b;
      });
      return h('div', { class: 'player-row' }, h('span', { class: 'seat', 'aria-hidden': 'true' }, String(seat + 1)), input, h('div', { class: 'swatches', role: 'group', 'aria-label': `Color for player ${seat + 1}` }, ...buttons));
    }),
  );
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
  let awakeState: AwakeState | null = null;
  let stopAwake: (() => void) | null = null;
  let awakeNotes: HTMLElement[] = [];

  // The setup being edited; it lives here so redrawing the screen keeps what was picked.
  const draft: Setup = { ...store.setup, names: [...store.setup.names] };
  let custom = !(LIFE_PRESETS as readonly number[]).includes(draft.startingLife);
  let customText = custom ? String(draft.startingLife) : '';
  while (draft.colors.length < draft.players) draft.colors.push(-1);

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

  /** Remembers the typed names and colors for the next game. */
  const remember = () => (store.setup = { ...store.setup, names: padded(draft.names, ''), colors: padded(draft.colors, -1) });
  const awakeNote = () => {
    const n = h('p', { class: 'banner notice', role: 'status' }, awakeState === 'unsupported' || awakeState === 'denied' ? AWAKE_MSG : '');
    awakeNotes.push(n);
    return n;
  };

  function begin() {
    store.setup = { players: draft.players, startingLife: draft.startingLife, names: padded(draft.names, ''), colors: padded(draft.colors, -1) };
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
        h(
          'div',
          { class: 'stack' },
          h('strong', {}, 'Names and colors'),
          h('p', { class: 'small muted' }, 'Seats run clockwise from the bottom left of the table. A blank name is "Player 1", "Player 2" and so on.'),
          playerRows({
            count: draft.players,
            name: (i) => draft.names[i] ?? '',
            color: (i) => seatColor(draft.colors[i], i),
            onName: (i, v) => (draft.names[i] = v.slice(0, MAX_NAME)),
            onColor: (i, c) => (draft.colors[i] = c),
          }),
        ),
        h('div', { class: 'actions' }, go),
      ),
    );
    if (custom) check();
  }

  function drawGame(view: HTMLElement) {
    notices = [];
    const seats = store.game!.players.map((_, i) => i);
    awakeNotes = [];
    const parts = new Map<number, { life: HTMLElement; badges: HTMLElement; warn: HTMLElement; el: HTMLElement; name: HTMLElement; counters: HTMLElement; minus: HTMLElement; plus: HTMLElement }>();

    /** Redraws everything a seat's tile shows from the saved game. */
    const updateTile = (seat: number) => {
      const g = store.game!;
      const p = g.players[seat];
      const t = parts.get(seat)!;
      t.life.textContent = String(p.life);
      t.name.textContent = p.name;
      t.counters.setAttribute('aria-label', `${p.name}: poison and commander damage`);
      t.minus.setAttribute('aria-label', `${p.name}: lose 1 life`);
      t.plus.setAttribute('aria-label', `${p.name}: gain 1 life`);
      t.el.style.setProperty('--tile', PALETTE[p.color].hex);
      t.el.dataset.first = String(g.first === seat);
      const worst = Math.max(0, ...Object.values(p.cmdr));
      t.badges.replaceChildren(...[g.first === seat ? 'Goes first' : null, p.poison > 0 ? `Poison ${p.poison}` : null, worst > 0 ? `Commander ${worst}` : null].filter((x): x is string => !!x).map((x) => h('span', { class: 'badge' }, x)));
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
      const minus = btn(-1);
      const plus = btn(1);
      const nameEl = h('span', { class: 'tile-name' }, p.name);
      const el = h(
        'div',
        { class: 'tile', 'data-player': seat, 'data-rotate': flipped ? '180' : '0', 'data-warn': 'false', 'data-first': 'false', style: `--tile:${PALETTE[p.color].hex}` },
        h(
          'div',
          { class: 'tile-inner' },
          h('div', { class: 'tile-head' }, nameEl, counters),
          h('div', { class: 'tile-mid' }, life, badges, warn),
          h('div', { class: 'tile-buttons' }, minus, plus),
        ),
      );
      parts.set(seat, { life, badges, warn, el, name: nameEl, counters, minus, plus });
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
    const edit = h('button', { type: 'button', class: 'button' }, 'Edit names & colors');
    edit.addEventListener('click', () => {
      const closeEdit = h('button', { type: 'button', class: 'button' }, 'Close');
      const dlg = h(
        'dialog',
        { class: 'picker sheet', 'aria-labelledby': 'edit-h' },
        h('h2', { id: 'edit-h' }, 'Edit players'),
        playerRows({
          count: seats.length,
          name: (i) => store.game!.players[i].name,
          color: (i) => store.game!.players[i].color,
          onName: (i, v) => {
            store.game = setName(store.game!, i, v);
            draft.names[i] = v.slice(0, MAX_NAME);
            remember();
            updateAll();
            persist();
          },
          onColor: (i, c) => {
            store.game = setColor(store.game!, i, c);
            draft.colors[i] = c;
            remember();
            updateAll();
            persist();
          },
        }),
        h('div', { class: 'actions' }, closeEdit),
      );
      closeEdit.addEventListener('click', () => dlg.close());
      dlg.addEventListener('close', () => dlg.remove());
      view.append(dlg);
      dlg.showModal();
    });
    /** One roll at a time: the menu closes, the table lights up seat by seat, and the winner is marked and saved. */
    let rolling = false;
    const rollBtn = h('button', { type: 'button', class: 'button' }, 'Roll for first player');
    rollBtn.addEventListener('click', () => {
      if (rolling) return;
      rolling = true;
      menu.close();
      const seat = randomSeat(seats.length);
      const finish = () => {
        rolling = false;
        for (const t of parts.values()) t.el.classList.remove('rolling');
        if (!store.game || seat >= store.game.players.length) return;
        store.game = setFirst(store.game, seat);
        updateAll();
        persist();
      };
      if (seats.length === 1 || matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
      const steps = 2 * seats.length + seat;
      const tick = (i: number) => {
        for (const t of parts.values()) t.el.classList.remove('rolling');
        if (i > steps) return finish();
        parts.get(i % seats.length)?.el.classList.add('rolling');
        window.setTimeout(() => tick(i + 1), ROLL_STEP_MS);
      };
      tick(0);
    });
    const close = h('button', { type: 'button', class: 'button' }, 'Close');
    const menu = h(
      'dialog',
      { class: 'picker', 'aria-labelledby': 'game-menu-h' },
      h('h2', { id: 'game-menu-h' }, 'Game menu'),
      notice(),
      awakeNote(),
      h('div', { class: 'actions' }, undoBtn, rollBtn, edit, reset, h('a', { class: 'button', href: '#/life' }, 'Leave game'), close),
    );
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
    setAwake(on) {
      if (on && !stopAwake) {
        awakeState = null;
        const deps: AwakeDeps = { wakeLock: (navigator as unknown as { wakeLock?: AwakeDeps['wakeLock'] }).wakeLock, doc: document };
        stopAwake = keepAwake(deps, (state) => {
          awakeState = state;
          for (const n of awakeNotes) n.textContent = state === 'unsupported' || state === 'denied' ? AWAKE_MSG : '';
        });
      } else if (!on && stopAwake) {
        stopAwake();
        stopAwake = null;
      }
    },
    render(view, route) {
      if (route === drawn) return;
      drawn = route;
      if (route === '#/life/game' && store.game) drawGame(view);
      else drawSetup(view);
    },
  };
}
