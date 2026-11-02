import { expect, test } from '@playwright/test';
import { seedEdgarDeck } from './helpers';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const ART = 'https://cards.scryfall.io/art_crop/front/test/edgar.jpg';
const edgar = { object: 'card', id: 'p1', oracle_id: '41e2790d-49f5-4e98-b8d9-04179f47f13a', name: 'Edgar Markov', image_uris: { art_crop: ART } };

test('each deck on the home page shows its commander art', async ({ page }) => {
  await page.route('https://cards.scryfall.io/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  await page.route('https://api.scryfall.com/cards/collection', (route) => route.fulfill({ status: 200, json: { object: 'list', data: [edgar], not_found: [] } }));
  await seedEdgarDeck(page);
  await page.goto('./');
  const art = page.locator('.deck-card-art');
  await expect(art).toHaveAttribute('src', ART);
  await expect(art).toHaveClass(/loaded/);
});

test('decks still list normally when the art lookup fails', async ({ page }) => {
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
  await seedEdgarDeck(page);
  await page.goto('./');
  await expect(page.getByRole('link', { name: /Edgar Markov/ })).toBeVisible();
  await expect(page.locator('.deck-card-art')).not.toHaveAttribute('src', /.+/);
});
