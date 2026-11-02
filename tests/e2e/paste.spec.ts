import { expect, test } from '@playwright/test';
import { mockScryfall, pasteAndFix } from './helpers';

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
