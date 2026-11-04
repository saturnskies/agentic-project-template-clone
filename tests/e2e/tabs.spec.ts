import { expect, test, type Page } from '@playwright/test';

/** A minimal saved deck; enough for the home list (art lookups are aborted, so no art shows). */
const deck = (i: number) => ({
  id: `d${i}`,
  name: `Deck ${i}`,
  format: 'commander',
  commander: { oracleId: `o${i}`, name: `Commander ${i}` },
  cards: [],
  updatedAt: new Date(2026, 0, 1 + i).toISOString(),
});

test.beforeEach(async ({ page }) => {
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
  const decks = Array.from({ length: 25 }, (_, i) => deck(i));
  await page.addInitScript((d) => {
    if (!localStorage.getItem('swapsmith:v1')) localStorage.setItem('swapsmith:v1', JSON.stringify({ version: 1, decks: d, owned: [], unownedBasics: [], prefs: { view: 'list' } }));
  }, decks);
});

const bar = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const tab = (page: Page, name: string) => bar(page).getByRole('link', { name });
const hash = (page: Page) => page.evaluate(() => location.hash);
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

test('shows Decks, Browse and Life Counter, with the current one marked', async ({ page }) => {
  await page.goto('./');
  await expect(tab(page, 'Decks')).toHaveAttribute('aria-current', 'page');
  await expect(tab(page, 'Browse')).not.toHaveAttribute('aria-current', 'page');
  await expect(tab(page, 'Life Counter')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your decks' })).toBeVisible();

  await tab(page, 'Browse').click();
  await expect(page).toHaveURL(/#\/browse$/);
  await expect(tab(page, 'Browse')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Browse' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your decks' })).toBeHidden();

  await tab(page, 'Life Counter').click();
  await expect(page).toHaveURL(/#\/life$/);
  await expect(tab(page, 'Life Counter')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Life Counter' })).toBeVisible();
});

test('a reload stays on the tab', async ({ page }) => {
  await page.goto('./#/life');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Life Counter' })).toBeVisible();
  await expect(tab(page, 'Life Counter')).toHaveAttribute('aria-current', 'page');
});

test('Decks keeps a half-typed form when you visit another tab and come back', async ({ page }) => {
  await page.goto('./#/new');
  const field = page.locator('[data-tab="decks"] input').first();
  await field.fill('Edgar');
  await tab(page, 'Life Counter').click();
  await expect(field).toBeHidden();
  await tab(page, 'Decks').click();
  await expect(page).toHaveURL(/#\/new$/);
  await expect(field).toHaveValue('Edgar');
});

test('Decks keeps its scroll position when you visit another tab and come back', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Deck 24', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  expect(await scrollY(page)).toBe(400);
  await tab(page, 'Browse').click();
  await expect(page.getByRole('heading', { name: 'Browse' })).toBeVisible();
  await tab(page, 'Decks').click();
  await expect(page.getByRole('heading', { name: 'Your decks' })).toBeVisible();
  await expect.poll(() => scrollY(page)).toBe(400);
});

test('tapping the tab you are on goes to its root and scrolls to the top', async ({ page }) => {
  await page.goto('./#/paste');
  await tab(page, 'Decks').click();
  await expect(page.getByRole('heading', { name: 'Your decks' })).toBeVisible();
  expect(await hash(page)).toBe('#/');

  await page.evaluate(() => window.scrollTo(0, 400));
  await tab(page, 'Decks').click();
  await expect.poll(() => scrollY(page)).toBe(0);
  expect(await hash(page)).toBe('#/');
});

test('Browse and Life Counter stay mounted while hidden', async ({ page }) => {
  await page.goto('./#/browse');
  const browse = page.locator('[data-tab="browse"]');
  await browse.evaluate((el) => ((el as HTMLElement).dataset.mark = 'kept'));
  await tab(page, 'Decks').click();
  await expect(browse).toBeHidden();
  await tab(page, 'Browse').click();
  await expect(browse).toBeVisible();
  await expect(browse).toHaveAttribute('data-mark', 'kept');
});

test('unknown Life Counter routes fall back to the setup screen', async ({ page }) => {
  await page.goto('./#/life/nope');
  await expect(page).toHaveURL(/#\/life$/);
  await page.goto('./#/life/game');
  await expect(page).toHaveURL(/#\/life$/);
  await expect(page.getByRole('heading', { name: 'Life Counter' })).toBeVisible();
});

test('the bar does not cover the end of the page', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Deck 24', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const footer = await page.locator('.site-footer').boundingBox();
  const nav = await bar(page).boundingBox();
  expect(footer && nav && footer.y + footer.height <= nav.y + 1).toBe(true);
});
