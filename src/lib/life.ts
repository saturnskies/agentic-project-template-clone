/** Life Counter game state and its saved copy. Pure: no DOM. Kept under its own key, apart from the deck store (see the spec). */

export const LIFE_KEY = 'swapsmith:life';
export const MAX_PLAYERS = 6;
export const MAX_NAME = 24;
export const LIFE_LIMIT = 9999;
export const LIFE_PRESETS = [20, 30, 40] as const;
export const DEFAULT_LIFE = 40;
export const DEFAULT_PLAYERS = 4;

export interface Player {
  name: string;
  life: number;
}

export interface Game {
  startingLife: number;
  players: Player[];
}

/** What the setup screen remembers for the next game. */
export interface Setup {
  players: number;
  startingLife: number;
  /** Typed names by seat; '' means the default "Player N". */
  names: string[];
}

export interface LifeStore {
  version: 1;
  game: Game | null;
  setup: Setup;
}

/** Tile colors: each keeps white text at 4.5:1 or better (checked in tests). */
export const PALETTE = [
  { id: 'red', name: 'Red', hex: '#b3261e' },
  { id: 'green', name: 'Green', hex: '#1b6b3a' },
  { id: 'blue', name: 'Blue', hex: '#1d4e9e' },
  { id: 'purple', name: 'Purple', hex: '#6b3fa0' },
  { id: 'orange', name: 'Orange', hex: '#9a4f00' },
  { id: 'teal', name: 'Teal', hex: '#00695c' },
  { id: 'magenta', name: 'Magenta', hex: '#a1205f' },
  { id: 'slate', name: 'Slate', hex: '#4a5560' },
] as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** WCAG contrast ratio of white text on the given `#rrggbb` color. */
export function contrastWithWhite(hex: string): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05);
}

export function defaultSetup(): Setup {
  return { players: DEFAULT_PLAYERS, startingLife: DEFAULT_LIFE, names: [] };
}

export function emptyLife(): LifeStore {
  return { version: 1, game: null, setup: defaultSetup() };
}

/** A typed custom starting life: whole numbers 1–999 only, else null. */
export function parseStartingLife(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 999 ? n : null;
}

const cleanName = (name: string, seat: number) => name.trim().slice(0, MAX_NAME) || `Player ${seat + 1}`;

export function newGame(setup: Setup): Game {
  const n = clamp(Math.round(setup.players), 1, MAX_PLAYERS);
  return {
    startingLife: setup.startingLife,
    players: Array.from({ length: n }, (_, i) => ({ name: cleanName(setup.names[i] ?? '', i), life: setup.startingLife })),
  };
}

/** Returns a new game with one player's life changed by `delta`; an unknown player changes nothing. */
export function changeLife(game: Game, index: number, delta: number): Game {
  if (!game.players[index]) return game;
  return { ...game, players: game.players.map((p, i) => (i === index ? { ...p, life: clamp(p.life + delta, -LIFE_LIMIT, LIFE_LIMIT) } : p)) };
}

/**
 * Who sits where, as player indexes left to right on each long edge. Turn order runs clockwise from the
 * bottom left: up the left side, along the top, down the right side, back along the bottom.
 */
export function seating(n: number): { top: number[]; bottom: number[] } {
  const top = Math.floor(n / 2);
  const along = Array.from({ length: top }, (_, i) => i + 1);
  const rest = Array.from({ length: n - top - 1 }, (_, i) => top + 1 + i);
  return { top: along, bottom: [0, ...rest.reverse()] };
}

// ---- saved copy ----

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const whole = (x: unknown, lo: number, hi: number): number | null => (typeof x === 'number' && Number.isFinite(x) ? clamp(Math.round(x), lo, hi) : null);

function sanitizeGame(raw: unknown): Game | null {
  if (!isObject(raw) || !Array.isArray(raw.players) || raw.players.length < 1 || raw.players.length > MAX_PLAYERS) return null;
  const players: Player[] = [];
  for (const p of raw.players) {
    if (!isObject(p) || typeof p.name !== 'string') return null;
    const life = whole(p.life, -LIFE_LIMIT, LIFE_LIMIT);
    if (life == null) return null;
    players.push({ name: p.name.trim().slice(0, MAX_NAME) || `Player ${players.length + 1}`, life });
  }
  return { startingLife: whole(raw.startingLife, 1, 999) ?? DEFAULT_LIFE, players };
}

function sanitizeSetup(raw: unknown): Setup {
  const r = isObject(raw) ? raw : {};
  const names = Array.isArray(r.names) ? r.names.slice(0, MAX_PLAYERS).map((n) => (typeof n === 'string' ? n.slice(0, MAX_NAME) : '')) : [];
  const players = whole(r.players, 0, 1000);
  return { players: players != null && players >= 1 && players <= MAX_PLAYERS ? players : DEFAULT_PLAYERS, startingLife: whole(r.startingLife, 1, 999) ?? DEFAULT_LIFE, names };
}

export interface LifeLoad {
  store: LifeStore;
  /** False when storage is missing or blocked: the game works but won't survive closing the app. */
  persistent: boolean;
  /** A newer version saved something here; it was left alone and must not be overwritten until a new game starts. */
  future: boolean;
}

/** Reads the saved game. Bad data is dropped or clamped, never thrown on. */
export function loadLife(storage: Storage | null): LifeLoad {
  const fresh = (persistent: boolean, future = false): LifeLoad => ({ store: emptyLife(), persistent, future });
  if (!storage) return fresh(false);
  let raw: string | null;
  try {
    raw = storage.getItem(LIFE_KEY);
  } catch {
    return fresh(false);
  }
  if (raw == null) return fresh(true);

  let data: unknown;
  try {
    data = JSON.parse(raw);
    if (!isObject(data)) throw new Error('not an object');
  } catch {
    try {
      storage.setItem(`${LIFE_KEY}:backup`, raw);
    } catch {
      // Nothing more we can do; start fresh.
    }
    return fresh(true);
  }
  if (typeof data.version === 'number' && data.version > 1) return fresh(true, true);
  return { store: { version: 1, game: sanitizeGame(data.game), setup: sanitizeSetup(data.setup) }, persistent: true, future: false };
}

/** Saves the game; returns false when storage is missing, blocked or full. */
export function saveLife(storage: Storage | null, store: LifeStore): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LIFE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}
