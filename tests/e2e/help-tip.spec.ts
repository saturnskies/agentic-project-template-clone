import { expect, test, type Page } from '@playwright/test';
import { edgarFull, mockScryfall, openEdgarDeck, seedTwoEdgarDecks, showPane } from './helpers';

// A first-use note above the card list explains Owned and Keep (docs/superpowers/plans/2026-11-05-keep-owned-help.md).

const note = (page: Page) => page.getByRole('note', { name: 'How Owned and Keep work' });

test('a first-time visitor is told what Owned and Keep mean, and can dismiss it for good', async ({ page }) => {
  await openEdgarDeck(page, { firstVisit: true });
  await expect(note(page)).toBeVisible();
  await expect(note(page)).toContainText('Owned');
  await expect(note(page)).toContainText('Other decks keep their own ticks');
  await expect(note(page)).toContainText('Keep');
  await expect(note(page)).toContainText('never cut or replace');

  await note(page).getByRole('button', { name: 'Got it' }).click();
  await expect(note(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await expect(note(page)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('swapsmith:v1')!).prefs.helpDismissed)).toBe(true);
});

test('dismissing it once means no deck shows it again', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  await seedTwoEdgarDecks(page, (a, b) => ({ version: 2, decks: [a, b], prefs: { view: 'list' } }));

  await page.goto('./#/deck/deck-a');
  await expect(note(page)).toBeVisible();
  await note(page).getByRole('button', { name: 'Got it' }).click();

  await page.goto('./#/deck/deck-b');
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await expect(note(page)).toHaveCount(0);
});

test('on a phone the note belongs to the Cards pane and its button is a 44px target', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the Cards | Suggestions switch only exists on a phone');
  await openEdgarDeck(page, { firstVisit: true });
  const gotIt = note(page).getByRole('button', { name: 'Got it' });
  const box = await gotIt.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);

  await showPane(page, 'Suggestions');
  await expect(note(page)).toBeHidden();
  await showPane(page, 'Cards');
  await expect(note(page)).toBeVisible();
});
