import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { requestKey, type FixtureMap } from '../support/fixtures';

const load = (name: string): FixtureMap => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

/** Every recorded Scryfall reply (see tests/unit/record-fixtures.test.ts). */
export const recorded: FixtureMap = { ...load('scryfall-e2e.json'), ...load('scryfall-new-deck.json') };
export const e2eList = readFileSync(new URL('../fixtures/e2e-list.txt', import.meta.url), 'utf8');

// A 1×1 grey PNG standing in for card images, so tests never download from Scryfall's image host.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** Answers Scryfall from recorded replies; returns the requests that had no recording. */
export async function mockScryfall(page: Page): Promise<string[]> {
  const misses: string[] = [];
  await page.route('https://cards.scryfall.io/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  await page.route('https://api.scryfall.com/**', async (route) => {
    const req = route.request();
    const key = requestKey(req.method(), req.url(), req.postData());
    const hit = recorded[key];
    if (!hit) {
      misses.push(key);
      return route.fulfill({ status: 500, json: { object: 'error', details: 'unrecorded' } });
    }
    return route.fulfill({ status: hit.status, json: hit.body });
  });
  return misses;
}

/** Pastes tests/fixtures/e2e-list.txt, fixes its two problem lines, and creates the deck. */
export async function pasteAndFix(page: Page, name = 'Edgar test') {
  await page.goto('./');
  await page.getByRole('link', { name: 'Paste a list' }).click();
  await page.getByLabel('Deck name').fill(name);
  await page.getByLabel('Decklist').fill(e2eList);
  await page.getByRole('button', { name: 'Price this deck' }).click();

  await expect(page.getByText('2 cards need attention')).toBeVisible();
  await page.getByRole('button', { name: 'Use Kalastria Highborn' }).click();
  const emmerstorm = page.getByRole('listitem').filter({ hasText: 'Emmerstorm Predator' });
  await expect(emmerstorm).toContainText('No close match');
  await emmerstorm.getByRole('button', { name: 'Remove' }).click();

  await expect(page.getByText('Commander: Edgar Markov')).toBeVisible();
  await page.getByRole('button', { name: 'Create deck' }).click();
  await expect(page.getByTestId('deck-total')).toHaveText(/\$/);
}
