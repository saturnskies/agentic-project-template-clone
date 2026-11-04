import { describe, expect, it } from 'vitest';
import {
  LIFE_KEY,
  PALETTE,
  changeLife,
  contrastWithWhite,
  defaultSetup,
  emptyLife,
  loadLife,
  newGame,
  parseStartingLife,
  saveLife,
  seating,
} from '../../src/lib/life';

/** A Storage stand-in that can be told to fail. */
function fakeStorage(initial: Record<string, string> = {}, opts: { failGet?: boolean; failSet?: boolean } = {}): Storage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => {
      if (opts.failGet) throw new Error('blocked');
      return k in data ? data[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (opts.failSet) throw new Error('full');
      data[k] = v;
    },
  } as unknown as Storage & { data: Record<string, string> };
}

describe('seating', () => {
  it.each([
    [1, [], [0]],
    [2, [1], [0]],
    [3, [1], [0, 2]],
    [4, [1, 2], [0, 3]],
    [5, [1, 2], [0, 4, 3]],
    [6, [1, 2, 3], [0, 5, 4]],
  ])('%i players: top %j, bottom %j (left to right, turn order clockwise from the bottom left)', (n, top, bottom) => {
    expect(seating(n)).toEqual({ top, bottom });
  });

  it('seats every player exactly once', () => {
    for (let n = 1; n <= 6; n++) {
      const { top, bottom } = seating(n);
      expect([...top, ...bottom].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
});

describe('newGame', () => {
  it('starts every player at the starting life with default names', () => {
    const g = newGame({ players: 3, startingLife: 30, names: [] });
    expect(g.players.map((p) => p.life)).toEqual([30, 30, 30]);
    expect(g.players.map((p) => p.name)).toEqual(['Player 1', 'Player 2', 'Player 3']);
    expect(g.startingLife).toBe(30);
  });

  it('uses set names, falls back for blank ones, and cuts long ones to 24 characters', () => {
    const g = newGame({ players: 3, startingLife: 40, names: ['Alex', '   ', 'x'.repeat(40)] });
    expect(g.players[0].name).toBe('Alex');
    expect(g.players[1].name).toBe('Player 2');
    expect(g.players[2].name).toBe('x'.repeat(24));
  });
});

describe('changeLife', () => {
  it('changes only the chosen player and leaves the old game untouched', () => {
    const g = newGame(defaultSetup());
    const next = changeLife(g, 2, -10);
    expect(next.players.map((p) => p.life)).toEqual([40, 40, 30, 40]);
    expect(g.players[2].life).toBe(40);
  });

  it('goes below zero (nobody is eliminated automatically) and stops at the limits', () => {
    let g = newGame({ players: 1, startingLife: 1, names: [] });
    g = changeLife(g, 0, -5);
    expect(g.players[0].life).toBe(-4);
    g = changeLife(g, 0, -100000);
    expect(g.players[0].life).toBe(-9999);
    g = changeLife(g, 0, 100000);
    expect(g.players[0].life).toBe(9999);
  });

  it('ignores a player that does not exist', () => {
    const g = newGame(defaultSetup());
    expect(changeLife(g, 9, 1)).toEqual(g);
  });
});

describe('parseStartingLife', () => {
  it.each([
    ['40', 40],
    [' 25 ', 25],
    ['1', 1],
    ['999', 999],
  ])('accepts %j', (text, n) => expect(parseStartingLife(text)).toBe(n));

  it.each(['', '0', '-5', '1000', '12.5', 'abc', '4e2', '1 2'])('rejects %j', (text) => expect(parseStartingLife(text)).toBeNull());
});

describe('loadLife and saveLife', () => {
  it('starts empty when nothing is saved', () => {
    const r = loadLife(fakeStorage());
    expect(r).toMatchObject({ persistent: true, future: false });
    expect(r.store).toEqual(emptyLife());
    expect(r.store.game).toBeNull();
  });

  it('round-trips a game and the setup', () => {
    const s = fakeStorage();
    const store = emptyLife();
    store.setup = { players: 3, startingLife: 30, names: ['A', 'B', 'C'] };
    store.game = changeLife(newGame(store.setup), 1, -4);
    expect(saveLife(s, store)).toBe(true);
    const back = loadLife(s).store;
    expect(back.game?.players.map((p) => p.life)).toEqual([30, 26, 30]);
    expect(back.setup).toEqual(store.setup);
  });

  it('works without storage: not persistent, nothing thrown', () => {
    expect(loadLife(null).persistent).toBe(false);
    expect(loadLife(fakeStorage({}, { failGet: true })).persistent).toBe(false);
    expect(saveLife(null, emptyLife())).toBe(false);
  });

  it('reports a failed save (storage full)', () => {
    expect(saveLife(fakeStorage({}, { failSet: true }), emptyLife())).toBe(false);
  });

  it('copies text that is not JSON to a backup key and starts empty', () => {
    const s = fakeStorage({ [LIFE_KEY]: '{oops' });
    const r = loadLife(s);
    expect(r.store.game).toBeNull();
    expect(s.data[`${LIFE_KEY}:backup`]).toBe('{oops');
  });

  it('also backs up JSON that is not an object', () => {
    const s = fakeStorage({ [LIFE_KEY]: '5' });
    expect(loadLife(s).store.game).toBeNull();
    expect(s.data[`${LIFE_KEY}:backup`]).toBe('5');
  });

  it.each([
    ['seven players', { players: Array.from({ length: 7 }, () => ({ name: 'x', life: 40 })) }],
    ['no players', { players: [] }],
    ['players not an array', { players: 'many' }],
    ['a life total that is a string', { players: [{ name: 'x', life: '40' }] }],
    ['a life total that is not finite', { players: [{ name: 'x', life: null }] }],
    ['a player that is not an object', { players: [4] }],
  ])('drops a saved game with %s', (_label, game) => {
    const s = fakeStorage({ [LIFE_KEY]: JSON.stringify({ version: 1, game: { startingLife: 40, ...game }, setup: {} }) });
    expect(loadLife(s).store.game).toBeNull();
  });

  it('clamps long names, and rounds and limits life totals', () => {
    const raw = { version: 1, game: { startingLife: 40, players: [{ name: 'y'.repeat(80), life: 12.6 }, { name: 'ok', life: 1e9 }] }, setup: {} };
    const g = loadLife(fakeStorage({ [LIFE_KEY]: JSON.stringify(raw) })).store.game!;
    expect(g.players[0]).toMatchObject({ name: 'y'.repeat(24), life: 13 });
    expect(g.players[1].life).toBe(9999);
  });

  it('repairs a bad setup to defaults', () => {
    const raw = { version: 1, game: null, setup: { players: 9, startingLife: 'lots', names: [1, 'ok'] } };
    const { setup } = loadLife(fakeStorage({ [LIFE_KEY]: JSON.stringify(raw) })).store;
    expect(setup.players).toBe(4);
    expect(setup.startingLife).toBe(40);
    expect(setup.names).toEqual(['', 'ok']);
  });

  it('ignores a game saved by a newer version, and says so, without touching it', () => {
    const raw = JSON.stringify({ version: 2, game: { whatever: true } });
    const s = fakeStorage({ [LIFE_KEY]: raw });
    const r = loadLife(s);
    expect(r.future).toBe(true);
    expect(r.store.game).toBeNull();
    expect(s.data[LIFE_KEY]).toBe(raw);
  });
});

describe('tile colors', () => {
  it('offers eight swatches that all keep white text readable (WCAG AA, 4.5:1)', () => {
    expect(PALETTE).toHaveLength(8);
    for (const c of PALETTE) expect(contrastWithWhite(c.hex), c.name).toBeGreaterThanOrEqual(4.5);
  });

  it('computes known contrast ratios', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 5);
  });
});
