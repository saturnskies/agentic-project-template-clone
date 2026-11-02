import { expect, test } from '@playwright/test';
import { mockScryfall, pasteAndFix } from './helpers';

// Deck from tests/fixtures/e2e-list.txt: total $36.35, of which 8 Swamps ($0.88) are owned by default.

test('basic lands count as owned, and ticking cards lowers what is still to buy', async ({ page }) => {
  const misses = await mockScryfall(page);
  await pasteAndFix(page);
  await expect(page.getByTestId('deck-total')).toHaveText('$36.35');
  await expect(page.getByTestId('deck-to-buy')).toHaveText('$35.47');
  await expect(page.getByRole('checkbox', { name: 'Own Swamp' })).toBeChecked();

  await page.getByRole('checkbox', { name: 'Own Edgar Markov' }).check();
  await expect(page.getByTestId('deck-to-buy')).toHaveText('$6.39');

  await page.getByRole('checkbox', { name: 'Own Swamp' }).uncheck();
  await expect(page.getByTestId('deck-to-buy')).toHaveText('$7.27');
  await expect(page.getByTestId('deck-total')).toHaveText('$36.35');
  expect(misses).toEqual([]);
});

test('owned cards are remembered across reloads and shared by every deck', async ({ page }) => {
  await mockScryfall(page);
  await pasteAndFix(page, 'First');
  await page.getByRole('checkbox', { name: 'Own Sol Ring' }).check();
  await expect(page.getByTestId('deck-to-buy')).toHaveText('$34.37');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Own Sol Ring' })).toBeChecked();

  await pasteAndFix(page, 'Second');
  await expect(page.getByRole('checkbox', { name: 'Own Sol Ring' })).toBeChecked();
  await expect(page.getByTestId('deck-to-buy')).toHaveText('$34.37');

  await page.getByRole('link', { name: 'Swapsmith' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'First' })).toContainText('$34.37 to buy');
});

test('pick a different printing, then go back to the cheapest', async ({ page }) => {
  const misses = await mockScryfall(page);
  await pasteAndFix(page);

  await page.getByRole('button', { name: 'Change printing of Edgar Markov' }).click();
  const dialog = page.getByRole('dialog', { name: 'Printings of Edgar Markov' });
  await expect(dialog).toBeVisible();
  const options = dialog.getByRole('listitem');
  await expect(options.first()).toContainText('INR #428');
  await expect(options.first()).toContainText('Current');
  await expect(options.nth(1)).toContainText('INR #328');

  await options.nth(1).getByRole('button', { name: 'Use this printing' }).click();
  await expect(dialog).toBeHidden();
  const edgar = page.getByRole('row').filter({ hasText: 'Edgar Markov' });
  await expect(edgar).toContainText('INR #328');
  await expect(edgar).toContainText('$32.66');
  await expect(edgar.getByRole('link', { name: 'Edgar Markov' })).toHaveAttribute('href', 'https://www.tcgplayer.com/product/596295');
  await expect(page.getByTestId('deck-total')).toHaveText('$39.93');

  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'Edgar Markov' })).toContainText('INR #328');

  await page.getByRole('button', { name: 'Change printing of Edgar Markov' }).click();
  await page.getByRole('button', { name: 'Use the cheapest printing' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Edgar Markov' })).toContainText('INR #428');
  await expect(page.getByTestId('deck-total')).toHaveText('$36.35');
  expect(misses).toEqual([]);
});
