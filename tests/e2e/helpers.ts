import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { requestKey, type FixtureMap } from '../support/fixtures';

const load = (name: string): FixtureMap => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

/**
 * Recorded Scryfall replies (see tests/unit/record-fixtures.test.ts). Fixtures recorded at different
 * times can hold the same request with different prices, so each test uses only its own flow's map.
 */
export const flows: FixtureMap = { ...load('scryfall-e2e.json'), ...load('scryfall-new-deck.json') };
export const edgarFull: FixtureMap = load('scryfall-edgar-full.json');
export const e2eList = readFileSync(new URL('../fixtures/e2e-list.txt', import.meta.url), 'utf8');

// A 1×1 grey PNG standing in for card images, so tests never download from Scryfall's image host.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** Answers Scryfall from recorded replies; returns the requests that had no recording. */
export async function mockScryfall(page: Page, recorded: FixtureMap = flows): Promise<string[]> {
  const misses: string[] = [];
  await page.route('https://cards.scryfall.io/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  await page.route('https://api.scryfall.com/**', async (route) => {
    const req = route.request();
    const key = requestKey(req.method(), req.url(), req.postData());
    const hit = recorded[key];
    if (!hit) {
      misses.push(key);
      return route.fulfill({ status: 500, json: { object: 'error', details: 'unrecorded' } });
    }
    return route.fulfill({ status: hit.status, json: hit.body });
  });
  return misses;
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

const edgarDeck = () => JSON.parse(readFileSync(new URL('../fixtures/edgar-deck.json', import.meta.url), 'utf8'));

/** Saves `store` as the app's saved data before the page loads (only if nothing is saved yet). */
export async function seedStore(page: Page, store: object) {
  await page.addInitScript(([payload]) => {
    if (!localStorage.getItem('swapsmith:v1')) localStorage.setItem('swapsmith:v1', payload);
  }, [JSON.stringify(store)]);
}

/**
 * The full 100-card Edgar Markov deck, saved before the page loads, as if the user had built it. The
 * first-use note about Owned and Keep starts dismissed, as for a returning user, so it does not move
 * what other specs measure; pass `{ firstVisit: true }` to see it. (Saved in the old shape on purpose:
 * it is migrated on load, so every spec that uses this also exercises the migration.)
 */
export async function seedEdgarDeck(page: Page, opts: { firstVisit?: boolean } = {}) {
  const deck = edgarDeck();
  const prefs = opts.firstVisit ? { view: 'list' } : { view: 'list', helpDismissed: true };
  await seedStore(page, { version: 1, decks: [deck], owned: [], unownedBasics: [], prefs });
  return deck as { id: string };
}

/** Two copies of the Edgar deck (ids `deck-a` and `deck-b`), so the same card is in both; `store` builds the saved data from them. */
export async function seedTwoEdgarDecks(page: Page, store: (a: object, b: object) => object) {
  const edgar = edgarDeck();
  await seedStore(page, store({ ...edgar, id: 'deck-a', name: 'Deck A' }, { ...edgar, id: 'deck-b', name: 'Deck B' }));
}

/** Answers Scryfall from the recorded Edgar replies, seeds the deck and opens it once its 100 cards are priced. */
export async function openEdgarDeck(page: Page, opts: { firstVisit?: boolean } = {}) {
  await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page, opts);
  await page.goto(`./#/deck/${deck.id}`);
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  return deck;
}

/** The deck-list row for a card, found by its name link (counts hidden rows too, unlike a role query on the row). */
export const row = (page: Page, name: string) => page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
export const suggestionsPanel = (page: Page) => page.getByRole('complementary', { name: 'Suggestions' });
export const paneBar = (page: Page) => page.getByRole('group', { name: 'Show' });

/** 70rem in px (src/style.css): from this width the list and the suggestions panel sit side by side. */
const SIDE_BY_SIDE_PX = 1120;

/**
 * Below 70rem the card list and the suggestions panel share the screen and a bar switches between them;
 * this shows one. On a wide screen both are already visible, so nothing is clicked.
 */
export async function showPane(page: Page, pane: 'Cards' | 'Suggestions') {
  if ((page.viewportSize()?.width ?? 1280) >= SIDE_BY_SIDE_PX) return;
  await paneBar(page).getByRole('button', { name: pane, exact: true }).click();
}
