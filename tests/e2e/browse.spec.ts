import { expect, test, type Page } from '@playwright/test';
import { browseSearches, mockScryfall } from './helpers';

const CRYPT = 'legal:commander name:"crypt"';
/** The request key the app sends for a search, to read what Scryfall really answered. */
const keyOf = (q: string, order = 'edhrec', dir = 'asc') => `GET /cards/search?${new URLSearchParams({ q, order, dir, unique: 'cards', page: '1' })}`;
const recorded = (q: string, order?: string, dir?: string) => (browseSearches[keyOf(q, order, dir)].body as { data: Array<{ name: string; oracle_id: string }> }).data;

let misses: string[];
let searches: string[];

test.beforeEach(async ({ page }) => {
  misses = await mockScryfall(page, browseSearches);
  searches = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname === 'api.scryfall.com' && u.pathname === '/cards/search') searches.push(u.searchParams.get('q') ?? '');
  });
});

const names = (page: Page) => page.locator('.card-tile-name').allTextContents();
const search = async (page: Page, name: string, advanced = '') => {
  await page.getByLabel('Card name').fill(name);
  await page.getByLabel('Advanced search').fill(advanced);
  await page.getByRole('button', { name: 'Search' }).click();
};

test('opens without fetching anything and shows a hint', async ({ page }) => {
  await page.goto('./#/browse');
  await expect(page.getByRole('heading', { name: 'Browse' })).toBeVisible();
  await expect(page.getByText('press Search')).toBeVisible();
  await page.waitForTimeout(800);
  expect(searches).toEqual([]);
});

test('lists the cards a search finds, with prices, and shows the query it ran', async ({ page }) => {
  await page.goto('./#/browse');
  await search(page, 'crypt');
  const want = recorded(CRYPT).map((c) => c.name);
  await expect(page.locator('.card-tile')).toHaveCount(49);
  expect(await names(page)).toEqual(want);
  expect(want[0]).toBe('Blood Crypt');
  await expect(page.getByText('Showing 49 of 49 cards')).toBeVisible();
  await expect(page.getByTestId('query')).toHaveText(CRYPT);
  await expect(page.locator('.card-tile-price').first()).toHaveText(/^\$\d/);
  expect(misses).toEqual([]);
});

test('a card the person owns says so', async ({ page }) => {
  const first = recorded(CRYPT)[0];
  await page.addInitScript((id) => localStorage.setItem('swapsmith:v1', JSON.stringify({ version: 1, decks: [], owned: [id], unownedBasics: [], prefs: { view: 'list' } })), first.oracle_id);
  await page.goto('./#/browse');
  await search(page, 'crypt');
  await expect(page.locator('.card-tile')).toHaveCount(49);
  await expect(page.locator('.card-tile').first().getByText('Owned')).toBeVisible();
  await expect(page.locator('.card-tile').nth(1).getByText('Owned')).toHaveCount(0);
});

test('changing the sort or its direction searches again from the start', async ({ page }) => {
  await page.goto('./#/browse');
  await search(page, 'crypt');
  await expect(page.locator('.card-tile')).toHaveCount(49);

  await page.getByLabel('Sort by').selectOption('price');
  await expect.poll(async () => (await names(page))[0]).toBe(recorded(CRYPT, 'usd', 'desc')[0].name);
  expect(await names(page)).toEqual(recorded(CRYPT, 'usd', 'desc').map((c) => c.name));

  await page.getByLabel('Sort by').selectOption('popularity');
  await expect.poll(async () => (await names(page))[0]).toBe('Blood Crypt');
  await page.getByRole('button', { name: 'Descending' }).click();
  await expect.poll(async () => (await names(page))[0]).toBe(recorded(CRYPT, 'edhrec', 'desc')[0].name);
  expect(misses).toEqual([]);
});

test('the advanced box narrows the search', async ({ page }) => {
  await page.goto('./#/browse');
  await search(page, 'crypt', 't:land');
  await expect(page.locator('.card-tile')).toHaveCount(6);
  await expect(page.getByTestId('query')).toHaveText(`${CRYPT} (t:land)`);
});

test('shows what Scryfall ignored, since those cards do not match what was typed', async ({ page }) => {
  await page.goto('./#/browse');
  await search(page, 'crypt', 'bogus:thing');
  await expect(page.locator('.card-tile')).toHaveCount(49);
  await expect(page.getByRole('status').filter({ hasText: 'Scryfall ignored' })).toContainText('bogus');
});

test('says so when nothing matches', async ({ page }) => {
  await page.goto('./#/browse');
  await search(page, 'zzzzqq');
  await expect(page.getByText('No cards match')).toBeVisible();
  await expect(page.locator('.card-tile')).toHaveCount(0);
});

test('refuses a search with no filters at all, and sends nothing', async ({ page }) => {
  await page.goto('./#/browse');
  await page.getByLabel('Commander-legal').uncheck();
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('alert')).toContainText('at least one filter');
  await page.waitForTimeout(800);
  expect(searches).toEqual([]);
});

test('refuses unbalanced parentheses and a too-long query without sending anything', async ({ page }) => {
  await page.goto('./#/browse');
  await search(page, 'crypt', 't:elf) or (t:goblin');
  await expect(page.getByRole('alert')).toContainText('parentheses');
  await search(page, 'crypt', 't:' + 'a'.repeat(900));
  await expect(page.getByRole('alert')).toContainText('too long');
  await page.waitForTimeout(800);
  expect(searches).toEqual([]);
});

test('shows Scryfall\'s own message for a bad query and keeps the earlier results', async ({ page }) => {
  // The form refuses what Scryfall 400s on (unbalanced parentheses), so the recorded 400 reply answers a search the form allows.
  const bad = browseSearches[keyOf('legal:commander (t:elf')];
  expect(bad.status).toBe(400);
  await page.route((u) => u.hostname === 'api.scryfall.com' && (u.searchParams.get('q') ?? '').includes('boom'), (route) => route.fulfill({ status: bad.status, json: bad.body }));
  await page.goto('./#/browse');
  await search(page, 'crypt');
  await expect(page.locator('.card-tile')).toHaveCount(49);
  await search(page, 'crypt', 't:boom');
  await expect(page.getByRole('alert')).toContainText('unclosed parentheses');
  await expect(page.locator('.card-tile')).toHaveCount(49);
});

test('keeps the earlier results and says to try again when Scryfall is down', async ({ page }) => {
  await page.route((u) => u.hostname === 'api.scryfall.com' && (u.searchParams.get('q') ?? '').includes('down'), (route) => route.fulfill({ status: 503, json: { object: 'error', details: 'Service Unavailable' } }));
  await page.goto('./#/browse');
  await search(page, 'crypt');
  await expect(page.locator('.card-tile')).toHaveCount(49);
  await search(page, 'crypt', 't:down');
  await expect(page.getByRole('alert')).toContainText('Press Search to try again');
  await expect(page.locator('.card-tile')).toHaveCount(49);
});

test('a slow earlier search cannot overwrite a newer one', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route((u) => u.hostname === 'api.scryfall.com' && u.searchParams.get('q') === CRYPT, async (route) => {
    await held;
    await route.fulfill({ status: 200, json: browseSearches[keyOf(CRYPT)].body });
  });
  await page.goto('./#/browse');
  await search(page, 'crypt');
  await expect.poll(() => searches.length).toBe(1);
  await search(page, 'crypt', 't:land');
  await expect(page.locator('.card-tile')).toHaveCount(6);
  release();
  await page.waitForTimeout(800);
  await expect(page.locator('.card-tile')).toHaveCount(6);
  await expect(page.getByTestId('query')).toHaveText(`${CRYPT} (t:land)`);
});

test('pressing Search twice quickly asks Scryfall once', async ({ page }) => {
  await page.goto('./#/browse');
  await page.getByLabel('Card name').fill('crypt');
  await page.getByRole('button', { name: 'Search' }).dblclick();
  await expect(page.locator('.card-tile')).toHaveCount(49);
  await page.waitForTimeout(800);
  expect(searches).toEqual([CRYPT]);
});

test('keeps the text, results and scroll while another tab shows', async ({ page }) => {
  await page.goto('./#/browse');
  await search(page, 'crypt');
  await expect(page.locator('.card-tile')).toHaveCount(49);
  await page.evaluate(() => window.scrollTo(0, 700));
  const before = await page.evaluate(() => Math.round(window.scrollY));
  expect(before).toBeGreaterThan(300);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Decks' }).click();
  await expect(page.getByRole('heading', { name: 'Your decks' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Browse' }).click();

  await expect(page.getByLabel('Card name')).toHaveValue('crypt');
  await expect(page.locator('.card-tile')).toHaveCount(49);
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(before - 5);
  await page.waitForTimeout(500);
  expect(searches).toEqual([CRYPT]);
});

test('fits the screen width, form and results', async ({ page }) => {
  await page.goto('./#/browse');
  await search(page, 'crypt');
  await expect(page.locator('.card-tile')).toHaveCount(49);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath(`browse-${test.info().project.name}.png`) });
});
