import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { requestKey, type FixtureMap } from '../support/fixtures';

const map: FixtureMap = JSON.parse(readFileSync(new URL('../fixtures/scryfall-e2e.json', import.meta.url), 'utf8'));
const list = readFileSync(new URL('../fixtures/e2e-list.txt', import.meta.url), 'utf8');

/** Answers Scryfall from recorded replies; anything unrecorded fails the test. */
async function mockScryfall(page: Page) {
  const misses: string[] = [];
  await page.route('https://api.scryfall.com/**', async (route) => {
    const req = route.request();
    const key = requestKey(req.method(), req.url(), req.postData());
    const hit = map[key];
    if (!hit) {
      misses.push(key);
      return route.fulfill({ status: 500, json: { object: 'error', details: 'unrecorded' } });
    }
    return route.fulfill({ status: hit.status, json: hit.body });
  });
  return misses;
}

async function pasteAndFix(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: 'Paste a list' }).click();
  await page.getByLabel('Deck name').fill('Edgar test');
  await page.getByLabel('Decklist').fill(list);
  await page.getByRole('button', { name: 'Price this deck' }).click();

  await expect(page.getByText('2 cards need attention')).toBeVisible();
  await page.getByRole('button', { name: 'Use Kalastria Highborn' }).click();
  const emmerstorm = page.getByRole('listitem').filter({ hasText: 'Emmerstorm Predator' });
  await expect(emmerstorm).toContainText('No close match');
  await emmerstorm.getByRole('button', { name: 'Remove' }).click();

  await expect(page.getByText('Commander: Edgar Markov')).toBeVisible();
  await page.getByRole('button', { name: 'Create deck' }).click();
}

test('paste a list, fix a typo, and see every card priced with TCGplayer links', async ({ page }) => {
  const misses = await mockScryfall(page);
  await pasteAndFix(page);

  await expect(page.getByRole('heading', { level: 2, name: 'Edgar test' })).toBeVisible();
  await expect(page.getByTestId('deck-total')).toHaveText('$36.35');
  await expect(page.getByTestId('deck-count')).toHaveText('13 / 100 cards');

  const edgar = page.getByRole('row').filter({ hasText: 'Edgar Markov' });
  await expect(edgar.getByRole('link', { name: 'Edgar Markov' })).toHaveAttribute('href', 'https://www.tcgplayer.com/product/596294');
  await expect(edgar).toContainText('Commander');
  await expect(edgar).toContainText('$29.08');

  const keeper = page.getByRole('row').filter({ hasText: 'Bloodline Keeper' });
  await expect(keeper).toContainText('INR #327');
  await expect(keeper).toContainText('Foil');

  const swamp = page.getByRole('row').filter({ hasText: 'Swamp' });
  await expect(swamp).toContainText('$0.11');
  await expect(swamp).toContainText('$0.88');
  await expect(page.getByRole('row').filter({ hasText: 'Emmerstorm' })).toHaveCount(0);
  expect(misses).toEqual([]);
});

test('a saved deck survives a reload and shows on the home screen', async ({ page }) => {
  await mockScryfall(page);
  await pasteAndFix(page);
  await expect(page.getByTestId('deck-total')).toHaveText('$36.35');

  await page.reload();
  await expect(page.getByTestId('deck-total')).toHaveText('$36.35');

  await page.getByRole('link', { name: 'Swapsmith' }).click();
  const card = page.getByRole('listitem').filter({ hasText: 'Edgar test' });
  await expect(card).toContainText('Edgar Markov');
  await expect(card).toContainText('$36.35');
});

test('sorting the list by price puts the most expensive card first', async ({ page }) => {
  await mockScryfall(page);
  await pasteAndFix(page);
  await page.getByRole('button', { name: 'Price' }).click();
  const names = await page.getByTestId('card-name').allTextContents();
  expect(names[0]).toBe('Edgar Markov');
  expect(names.at(-1)).toBe('Swamp');
});

test('deleting a deck asks first, then removes it', async ({ page }) => {
  await mockScryfall(page);
  await pasteAndFix(page);
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await page.getByRole('button', { name: 'Yes, delete Edgar test' }).click();
  await expect(page.getByText('No decks yet')).toBeVisible();
});

test('shows a warning when the browser blocks storage, and still works', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  await mockScryfall(page);
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText("decks won't be saved");
  await pasteAndFix(page);
  await expect(page.getByTestId('deck-total')).toHaveText('$36.35');
});

test('explains when Scryfall cannot be reached', async ({ page }) => {
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
  await page.goto('./#/paste');
  await page.getByLabel('Decklist').fill('1 Sol Ring');
  await page.getByRole('button', { name: 'Price this deck' }).click();
  // The client retries a dropped connection three times (1 s, 2 s, 4 s) before giving up.
  await expect(page.getByRole('alert')).toContainText("Couldn't reach Scryfall", { timeout: 15_000 });
});
