import { expect, test, type Page } from '@playwright/test';
import { edgarFull, mockScryfall, seedEdgarDeck } from './helpers';

// Shorter list rows on phones (docs/superpowers/plans/2026-11-05-undo-remove-and-short-rows.md): below 40rem
// the Qty column goes away and a card with several copies shows "×N" beside its name. Wide screens keep the column.

async function openDeck(page: Page) {
  await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
}

const row = (page: Page, name: string) => page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });

test('on a phone the Qty column is gone and several copies show as ×N beside the name', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only');
  await openDeck(page);
  await expect(page.getByRole('columnheader', { name: 'Qty' })).toBeHidden();
  await expect(row(page, 'Swamp').locator('.qty-mark')).toHaveText('×8');
  await expect(row(page, 'Cordial Vampire').locator('.qty-mark')).toHaveCount(0); // a single copy needs no mark
  await expect(row(page, 'Cordial Vampire')).toBeVisible();
});

test('the mark follows the quantity when a copy is removed', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only');
  await openDeck(page);
  await page.getByRole('button', { name: 'Remove Swamp' }).click();
  await expect(row(page, 'Swamp').locator('.qty-mark')).toHaveText('×7');
});

test('on a wide screen the Qty column stays and no ×N mark shows', async ({ page, isMobile }) => {
  test.skip(isMobile, 'wide screens only');
  await openDeck(page);
  await expect(page.getByRole('columnheader', { name: 'Qty' })).toBeVisible();
  await expect(row(page, 'Swamp').locator('td.num').first()).toHaveText('8');
  await expect(page.locator('.qty-mark:visible')).toHaveCount(0);
});

test('the phone list is shorter than it was with a Qty column', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only');
  await openDeck(page);
  await expect(page.locator('table.cards tbody tr').first()).toBeVisible();
  // 8486px at Pixel 7 width on the seeded 100-card deck with the Qty column; 8026px without it.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThanOrEqual(8100);
});
