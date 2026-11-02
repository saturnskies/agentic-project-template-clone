import { expect, test } from '@playwright/test';
import { edgarFull, mockScryfall, seedEdgarDeck } from './helpers';

// The full Edgar Markov deck with Scryfall replies recorded 2026-11-02 (tests/fixtures/scryfall-edgar-full.json).

test('find upgrades by price tier that fit the deck', async ({ page }) => {
  const misses = await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await expect(page.getByTestId('deck-total')).toHaveText('$119.65');

  await page.getByRole('button', { name: 'Find upgrades' }).click();
  const profile = page.getByTestId('deck-profile');
  await expect(profile).toContainText('Colors: black, red, white');
  await expect(profile).toContainText('Tribe: Vampire');
  await expect(profile).toContainText('Themes: sacrifice, lifegain, +1/+1 counters, graveyard');

  const panel = page.getByRole('complementary', { name: 'Upgrades' });
  await expect(panel.getByRole('button', { name: 'Budget (10)' })).toHaveAttribute('aria-pressed', 'true');
  const budget = panel.getByRole('list', { name: 'Budget upgrades' }).getByRole('listitem');
  await expect(budget).toHaveCount(10);
  await expect(budget.first()).toContainText('Indulgent Aristocrat');
  await expect(budget.first()).toContainText('$0.21');
  await expect(budget.first()).toContainText('Vampire · sacrifice · lifegain · +1/+1 counters · EDHREC #2588');
  await expect(budget.first().getByRole('link', { name: 'Indulgent Aristocrat' })).toHaveAttribute('href', /^https:\/\/www\.tcgplayer\.com\/product\/\d+$/);

  // Nothing suggested is already in the deck.
  for (const name of await panel.locator('.sugg-name').allTextContents()) {
    await expect(page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })).toHaveCount(0);
  }

  await panel.getByRole('button', { name: /^Mid/ }).click();
  await expect(panel.getByRole('list', { name: 'Mid upgrades' }).getByRole('listitem').first()).toContainText('Carmen, Cruel Skymarcher');
  await panel.getByRole('button', { name: /^Premium/ }).click();
  await expect(panel.getByRole('list', { name: 'Premium upgrades' }).getByRole('listitem')).toHaveCount(10);
  expect(misses).toEqual([]);
});

test('add a suggested card to the deck', async ({ page }) => {
  const misses = await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await page.getByRole('button', { name: 'Find upgrades' }).click();

  await page.getByRole('button', { name: 'Add Indulgent Aristocrat' }).click();
  await expect(page.getByRole('button', { name: 'Add Indulgent Aristocrat' })).toHaveText('Added');
  await expect(page.getByTestId('deck-count')).toHaveText('101 / 100 cards');
  await expect(page.getByRole('row').filter({ hasText: 'Indulgent Aristocrat' })).toContainText('$0.21');
  expect(misses).toEqual([]);
});
