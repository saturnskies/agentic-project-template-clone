import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Tests never reach the real Scryfall; later slices answer from fixtures.
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
});

test('home page loads with the app name, an empty deck list and the Scryfall credit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');

  await expect(page).toHaveTitle('Swapsmith');
  await expect(page.getByRole('heading', { level: 1, name: 'Swapsmith' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your decks' })).toBeVisible();
  await expect(page.getByText('No decks yet')).toBeVisible();
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: 'Scryfall' })).toHaveAttribute('href', 'https://scryfall.com');
  await expect(footer).toContainText('not affiliated with Wizards of the Coast');
  expect(errors).toEqual([]);
});

test('page does not scroll sideways', async ({ page }) => {
  await page.goto('./');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
