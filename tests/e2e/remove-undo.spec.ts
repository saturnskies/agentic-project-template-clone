import { expect, test, type Page } from '@playwright/test';
import { edgarFull, mockScryfall, seedEdgarDeck } from './helpers';

// Removing a card shows "Removed X." with an Undo for 10 seconds (docs/superpowers/plans/2026-11-05-undo-remove-and-short-rows.md).
// Quantities are checked through the card count, not the Qty column, which phones hide.

async function openDeck(page: Page) {
  await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
}

const toast = (page: Page) => page.getByRole('status').filter({ hasText: /^Removed / });
const row = (page: Page, name: string) => page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });

test('Undo puts a removed card back with its row, count and totals', async ({ page }) => {
  await openDeck(page);
  const total = await page.getByTestId('deck-total').textContent();
  await expect(row(page, 'Cordial Vampire')).toHaveCount(1);

  await page.getByRole('button', { name: 'Remove Cordial Vampire' }).click();
  await expect(row(page, 'Cordial Vampire')).toHaveCount(0);
  await expect(page.getByTestId('deck-count')).toHaveText('99 / 100 cards');
  await expect(toast(page)).toContainText('Removed Cordial Vampire.');

  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Cordial Vampire')).toHaveCount(1);
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await expect(page.getByTestId('deck-total')).toHaveText(total!);
  await expect(toast(page)).toHaveCount(0);
});

test('removing one copy of a basic land can be undone too', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: 'Remove Swamp' }).click();
  await expect(page.getByTestId('deck-count')).toHaveText('99 / 100 cards');
  await expect(row(page, 'Swamp')).toHaveCount(1); // seven copies are still there
  await expect(toast(page)).toContainText('Removed one copy of Swamp.');

  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
});

test('after a second removal, Undo brings back only the second card', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: 'Remove Cordial Vampire' }).click();
  await page.getByRole('button', { name: 'Remove Drana, Liberator of Malakir' }).click();
  await expect(page.getByTestId('deck-count')).toHaveText('98 / 100 cards');
  await expect(toast(page)).toContainText('Removed Drana, Liberator of Malakir.');

  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Drana, Liberator of Malakir')).toHaveCount(1);
  await expect(row(page, 'Cordial Vampire')).toHaveCount(0);
  await expect(page.getByTestId('deck-count')).toHaveText('99 / 100 cards');
  await expect(toast(page)).toHaveCount(0);
});

test('another change to the deck ends the offer, so Undo never reverts it', async ({ page }) => {
  await openDeck(page);
  await page.getByRole('button', { name: 'Remove Cordial Vampire' }).click();
  await expect(toast(page)).toBeVisible();

  await page.getByRole('button', { name: 'Keep Drana, Liberator of Malakir' }).click();
  await expect(page.getByRole('button', { name: 'Keep Drana, Liberator of Malakir' })).toHaveAttribute('aria-pressed', 'true');
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByTestId('deck-count')).toHaveText('99 / 100 cards');
});

test('the offer goes away by itself after about ten seconds', async ({ page }) => {
  await page.clock.install();
  await openDeck(page);
  await page.getByRole('button', { name: 'Remove Cordial Vampire' }).click();
  await expect(toast(page)).toBeVisible();
  await page.clock.fastForward(5_000);
  await expect(toast(page)).toBeVisible(); // still there at 5 s
  await page.clock.fastForward(6_000);
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByTestId('deck-count')).toHaveText('99 / 100 cards'); // the removal stands
});

test('on a phone the offer sits above the bottom bar and Undo is a 44px target', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the bottom bar only exists on a phone');
  await openDeck(page);
  await page.getByRole('button', { name: 'Remove Cordial Vampire' }).click();
  await expect(toast(page)).toBeInViewport();
  const bar = await page.getByRole('group', { name: 'Show' }).boundingBox();
  const box = await toast(page).boundingBox();
  const undo = await toast(page).getByRole('button', { name: 'Undo' }).boundingBox();
  expect(box!.y + box!.height, 'toast bottom vs bar top').toBeLessThanOrEqual(bar!.y + 1);
  expect(undo!.height).toBeGreaterThanOrEqual(44);
  expect(undo!.width).toBeGreaterThanOrEqual(44);
});
