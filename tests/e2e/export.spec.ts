import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockScryfall, pasteAndFix } from './helpers';

test('a deck can be downloaded as a .txt file or copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockScryfall(page);
  await pasteAndFix(page, 'Edgar export');

  // Copy, Download and Share live together behind one button, so the deck header stays short.
  await page.getByRole('button', { name: 'Share & export' }).click();
  const options = page.getByRole('dialog', { name: 'Share & export' });
  await expect(options.getByRole('button', { name: 'Copy deck' })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), options.getByRole('button', { name: 'Download .txt' }).click()]);
  expect(download.suggestedFilename()).toBe('Edgar-export.txt');
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).toMatch(/^Commander\n1 Edgar Markov\n\nDeck\n/);

  await options.getByRole('button', { name: 'Copy deck' }).click();
  await expect(options.getByText('Deck copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

  await expect(page.locator('.tagline')).toHaveCount(0);
});
