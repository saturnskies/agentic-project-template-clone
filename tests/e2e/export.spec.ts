import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockScryfall, pasteAndFix } from './helpers';

test('a deck can be downloaded as a .txt file or copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockScryfall(page);
  await pasteAndFix(page, 'Edgar export');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .txt' }).click()]);
  expect(download.suggestedFilename()).toBe('Edgar-export.txt');
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).toMatch(/^Commander\n1 Edgar Markov\n\nDeck\n/);

  await page.getByRole('button', { name: 'Copy deck' }).click();
  await expect(page.getByText('Deck copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

  await expect(page.locator('.tagline')).toHaveCount(0);
});
