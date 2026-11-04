import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { frontFace, looseName } from '../../src/scryfall/cards';
import { requestKey, type FixtureMap } from '../support/fixtures';

const load = (name: string): FixtureMap => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

/**
 * Recorded Scryfall replies (see tests/unit/record-fixtures.test.ts). Fixtures recorded at different
 * times can hold the same request with different prices, so each test uses only its own flow's map.
 */
export const flows: FixtureMap = { ...load('scryfall-e2e.json'), ...load('scryfall-new-deck.json') };
/** The Edgar Markov EDHREC pages and their Scryfall name lookups, recorded 2026-11-03. */
export const edgarEdhrec: FixtureMap = load('edhrec-edgar.json');
/**
 * The full Edgar deck's Scryfall replies. Every Find also counts the deck's Game Changers, so the
 * recorded `is:gamechanger` replies (from the EDHREC recording) come with it, and the rules-based
 * fallback's newer searches with them.
 */
export const edgarFull: FixtureMap = {
  ...load('scryfall-edgar-full.json'),
  // The fallback's wider searches (more roles, the tokens theme Edgar's text names), recorded 2026-11-04.
  ...load('scryfall-edgar-fallback.json'),
  ...Object.fromEntries(Object.entries(edgarEdhrec).filter(([k]) => k.startsWith('GET /cards/search?q=is%3Agamechanger'))),
};
export const e2eList = readFileSync(new URL('../fixtures/e2e-list.txt', import.meta.url), 'utf8');

// A 1×1 grey PNG standing in for card images, so tests never download from Scryfall's image host.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * Answers Scryfall and EDHREC from recorded replies; returns the requests that had no recording.
 * EDHREC answers 403 ("no page for this commander") unless `edhrec` holds its replies, so tests that
 * don't pass one see the rules-based fallback.
 */
export async function mockScryfall(page: Page, recorded: FixtureMap = flows, edhrec?: FixtureMap): Promise<string[]> {
  const misses: string[] = [];
  await page.route('https://json.edhrec.com/**', async (route) => {
    if (!edhrec) return route.fulfill({ status: 403, contentType: 'text/html', body: '<html>Forbidden</html>' });
    const key = requestKey('GET', route.request().url());
    const hit = edhrec[key];
    if (!hit) {
      misses.push(key);
      return route.fulfill({ status: 500, json: { error: 'unrecorded' } });
    }
    return route.fulfill({ status: hit.status, json: hit.body });
  });
  const lookups = edhrec ? lookupIndex(edhrec) : null;
  const roles = edhrec ? roleIndex({ ...recorded, ...edhrec }) : null;
  if (edhrec) recorded = { ...recorded, ...edhrec };
  await page.route('https://cards.scryfall.io/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  await page.route('https://api.scryfall.com/**', async (route) => {
    const req = route.request();
    const key = requestKey(req.method(), req.url(), req.postData());
    const hit = recorded[key] ?? (lookups && answerLookup(lookups, req.url())) ?? (roles && answerRoles(roles, req.url()));
    if (!hit) {
      misses.push(key);
      return route.fulfill({ status: 500, json: { object: 'error', details: 'unrecorded' } });
    }
    return route.fulfill({ status: hit.status, json: hit.body });
  });
  return misses;
}

const LOOKUP = /^f:commander id<=\w+ game:paper prefer:usd-low \((.*)\)$/;
/** The app's own name matching, so the mock pairs names exactly as the app does. */
const loose = (n: string) => looseName(frontFace(n));

/** Every card in the recorded EDHREC name lookups, by loose front-face name. */
function lookupIndex(map: FixtureMap): Map<string, unknown> {
  const index = new Map<string, unknown>();
  for (const [key, rec] of Object.entries(map)) {
    const q = key.startsWith('GET /cards/search?') ? new URLSearchParams(key.split('?')[1]).get('q') : null;
    if (!q || !LOOKUP.test(q)) continue;
    for (const c of (rec.body as { data?: Array<{ name: string }> }).data ?? []) index.set(loose(c.name), c);
  }
  return index;
}

/**
 * Answers an EDHREC name lookup (`… prefer:usd-low (!"A" or !"B" …)`) from recorded cards, as Scryfall
 * would: the cards found, or 404 when none are. The app batches names by what it has already looked
 * up, so batches vary with the order a test changes filters; the cards themselves are all recorded.
 */
function answerLookup(index: Map<string, unknown>, url: string): { status: number; body: unknown } | null {
  const q = new URL(url).searchParams.get('q') ?? '';
  const m = LOOKUP.exec(q);
  if (!m) return null;
  const data = [...m[1].matchAll(/!"([^"]+)"/g)].map(([, n]) => index.get(loose(n))).filter(Boolean);
  return data.length ? { status: 200, body: { object: 'list', has_more: false, total_cards: data.length, data } } : { status: 404, body: { object: 'error', status: 404, details: 'Your query didn’t match any cards.' } };
}

/** Pastes tests/fixtures/e2e-list.txt, fixes its two problem lines, and creates the deck. */
export async function pasteAndFix(page: Page, name = 'Edgar test') {
  await page.goto('./');
  await page.getByRole('link', { name: 'Paste a list' }).click();
  await page.getByLabel('Deck name').fill(name);
  await page.getByLabel('Decklist').fill(e2eList);
  await page.getByRole('button', { name: 'Price this deck' }).click();

  await expect(page.getByText('2 cards need attention')).toBeVisible();
  await page.getByRole('button', { name: 'Use Kalastria Highborn' }).click();
  const emmerstorm = page.getByRole('listitem').filter({ hasText: 'Emmerstorm Predator' });
  await expect(emmerstorm).toContainText('No close match');
  await emmerstorm.getByRole('button', { name: 'Remove' }).click();

  await expect(page.getByText('Commander: Edgar Markov')).toBeVisible();
  await page.getByRole('button', { name: 'Create deck' }).click();
  await expect(page.getByTestId('deck-total')).toHaveText(/\$/);
}

/** The full 100-card Edgar Markov deck, saved before the page loads, as if the user had built it. */
export async function seedEdgarDeck(page: Page) {
  const deck = JSON.parse(readFileSync(new URL('../fixtures/edgar-deck.json', import.meta.url), 'utf8'));
  await page.addInitScript((d) => {
    if (!localStorage.getItem('swapsmith:v1')) {
      localStorage.setItem('swapsmith:v1', JSON.stringify({ version: 1, decks: [d], owned: [], unownedBasics: [], prefs: { view: 'list' } }));
    }
  }, deck);
  return deck as { id: string };
}

const ROLE = /^(otag:[a-z-]+) \((.*)\)$/;
type RoleIndex = { checked: Set<string>; byTag: Map<string, Map<string, unknown>> };

/** Every card checked in a recorded role search (`otag:<tag> (!"A" or …)`), and the cards found per tag. */
function roleIndex(map: FixtureMap): RoleIndex {
  const index: RoleIndex = { checked: new Set(), byTag: new Map() };
  for (const [key, rec] of Object.entries(map)) {
    const q = key.startsWith('GET /cards/search?') ? new URLSearchParams(key.split('?')[1]).get('q') : null;
    const m = q && ROLE.exec(q);
    if (!m || rec.status >= 500) continue;
    for (const [, n] of m[2].matchAll(/!"([^"]+)"/g)) index.checked.add(loose(n));
    const found = index.byTag.get(m[1]) ?? new Map<string, unknown>();
    for (const c of (rec.body as { data?: Array<{ name: string }> }).data ?? []) found.set(loose(c.name), c);
    index.byTag.set(m[1], found);
  }
  return index;
}

/**
 * Answers a role search over names the recordings already checked for roles, from those recorded
 * answers; batches differ with the order a test changes filters, the cards' roles don't.
 */
function answerRoles(index: RoleIndex, url: string): { status: number; body: unknown } | null {
  const m = ROLE.exec(new URL(url).searchParams.get('q') ?? '');
  if (!m) return null;
  const names = [...m[2].matchAll(/!"([^"]+)"/g)].map(([, n]) => loose(n));
  if (!names.length || !names.every((n) => index.checked.has(n))) return null;
  const found = index.byTag.get(m[1]) ?? new Map();
  const data = names.map((n) => found.get(n)).filter(Boolean);
  return data.length ? { status: 200, body: { object: 'list', has_more: false, total_cards: data.length, data } } : { status: 404, body: { object: 'error', status: 404, details: 'Your query didn’t match any cards.' } };
}

