import { expect, test } from '@playwright/test';
import { edgarFull, mockScryfall, seedEdgarDeck, showPane, suggestionsPanel } from './helpers';

// The full Edgar Markov deck with Scryfall replies recorded 2026-11-02 (tests/fixtures/scryfall-edgar-full.json).
// Prices are that recording's: re-recording moves them, so update the totals below with it.

test('find upgrades by price tier that fit the deck', async ({ page }) => {
  const misses = await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await expect(page.getByTestId('deck-total')).toHaveText('$119.73');

  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();
  const profile = page.getByTestId('deck-profile');
  await expect(profile).toContainText('Colors: black, red, white');
  await expect(profile).toContainText('Tribe: Vampire');
  await expect(profile).toContainText('Themes: sacrifice, lifegain, +1/+1 counters, graveyard');

  const panel = suggestionsPanel(page);
  await expect(panel.getByRole('button', { name: 'Budget (10)' })).toHaveAttribute('aria-pressed', 'true');
  const budget = panel.getByRole('list', { name: 'Budget upgrades' }).getByRole('listitem');
  await expect(budget).toHaveCount(10);
  await expect(budget.first()).toContainText('Indulgent Aristocrat');
  await expect(budget.first()).toContainText('$0.21');
  await expect(budget.first()).toContainText('Vampire · sacrifice · lifegain · +1/+1 counters · EDHREC #2588');
  await expect(budget.first().getByRole('link', { name: 'Indulgent Aristocrat' })).toHaveAttribute('href', /^https:\/\/www\.tcgplayer\.com\/product\/\d+$/);

  // Nothing suggested is already in the deck. Look at the list itself: on a phone it is the other pane.
  const suggested = await panel.locator('.sugg-name').allTextContents();
  await showPane(page, 'Cards');
  await expect(page.getByRole('row').first()).toBeVisible();
  for (const name of suggested) {
    await expect(page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })).toHaveCount(0);
  }
  await showPane(page, 'Suggestions');

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
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();

  await page.getByRole('button', { name: 'Add Indulgent Aristocrat' }).click();
  await expect(page.getByTestId('deck-count')).toHaveText('101 / 100 cards');
  // Now in the deck, so it drops out of the suggestions; the list refills without new searches.
  await expect(page.getByRole('button', { name: 'Add Indulgent Aristocrat' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Budget upgrades' }).getByRole('listitem')).toHaveCount(10);
  await showPane(page, 'Cards');
  await expect(page.getByRole('row').filter({ hasText: 'Indulgent Aristocrat' })).toContainText('$0.21');
  expect(misses).toEqual([]);
});

test('swap a weak card for a suggestion, then undo it', async ({ page }) => {
  const misses = await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();
  const panel = suggestionsPanel(page);
  await panel.getByRole('button', { name: 'Swaps' }).click();

  const first = panel.getByRole('list', { name: 'Swap pairs' }).getByRole('listitem').first();
  await expect(first).toContainText('Cut Purify');
  await expect(first).toContainText('Add Indulgent Aristocrat');
  await first.getByRole('button', { name: 'Swap Purify for Indulgent Aristocrat' }).click();

  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await showPane(page, 'Cards');
  await expect(page.getByRole('row').filter({ hasText: 'Indulgent Aristocrat' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Purify' })).toHaveCount(0);
  await showPane(page, 'Suggestions');
  // The list updates without new searches: the next pair moves up.
  await expect(panel.getByRole('list', { name: 'Swap pairs' }).getByRole('listitem').first()).not.toContainText('Purify');

  await expect(panel).toContainText('Swapped Purify → Indulgent Aristocrat.');
  await panel.getByRole('button', { name: 'Undo' }).click();
  await showPane(page, 'Cards');
  await expect(page.getByRole('row').filter({ hasText: 'Purify' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Indulgent Aristocrat' })).toHaveCount(0);
  await expect(page.getByTestId('deck-total')).toHaveText('$119.73');
  expect(misses).toEqual([]);
});

test('cards marked Keep are never offered as cuts', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await page.getByRole('button', { name: 'Keep Purify' }).click();
  await expect(page.getByRole('button', { name: 'Keep Purify' })).toHaveAttribute('aria-pressed', 'true');

  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();
  const panel = suggestionsPanel(page);
  await panel.getByRole('button', { name: 'Swaps' }).click();
  await expect(panel.getByRole('list', { name: 'Swap pairs' })).not.toContainText('Cut Purify');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Keep Purify' })).toHaveAttribute('aria-pressed', 'true');
});

test('replace an expensive card with a cheaper one that does the same job', async ({ page }) => {
  const misses = await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();
  const panel = suggestionsPanel(page);
  await panel.getByRole('button', { name: 'Cheaper' }).click();

  const group = panel.getByRole('region', { name: 'Cheaper than Minas Tirith' });
  await expect(group).toContainText('Minas Tirith · $6.08');
  await expect(group.getByRole('listitem').first()).toContainText('Buried Ruin');
  await expect(group.getByRole('listitem').first()).toContainText('Save $5.81');
  await group.getByRole('button', { name: 'Swap Minas Tirith for Buried Ruin' }).click();

  await expect(page.getByTestId('deck-total')).toHaveText('$113.92');
  await showPane(page, 'Cards');
  await expect(page.getByRole('row').filter({ hasText: 'Buried Ruin' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Minas Tirith' })).toHaveCount(0);
  await showPane(page, 'Suggestions');
  await expect(panel.getByRole('region', { name: 'Cheaper than Minas Tirith' })).toHaveCount(0);
  expect(misses).toEqual([]);
});

test('if the role lookup fails, upgrades still show and swaps say matching is approximate', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  // Role lookups are searches over the deck's own names (`!"Name"`); make them all fail.
  await page.route(/api\.scryfall\.com\/cards\/search\?q=otag%3A[^&]*%21%22/, (route) => route.abort());
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();

  const panel = suggestionsPanel(page);
  await expect(panel.getByRole('list', { name: 'Budget upgrades' }).getByRole('listitem').first()).toContainText('Indulgent Aristocrat');
  await panel.getByRole('button', { name: 'Swaps' }).click();
  await expect(panel).toContainText("Couldn't check what every card in your deck does", { timeout: 30_000 });
  await expect(panel.getByRole('list', { name: 'Swap pairs' }).getByRole('listitem').first()).toBeVisible();
});

test('if one search fails, the rest still give suggestions and a note says what is missing', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  await page.route(/api\.scryfall\.com\/cards\/search\?q=f%3Acommander[^&]*otag%3Aramp/, (route) => route.abort());
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();

  const panel = suggestionsPanel(page);
  await expect(panel).toContainText("Scryfall didn't answer every search (ramp)", { timeout: 30_000 });
  await expect(panel.getByRole('list', { name: 'Budget upgrades' }).getByRole('listitem').first()).toContainText('Indulgent Aristocrat');
});

async function openSuggestions(page: import('@playwright/test').Page, view: 'Swaps' | 'Cheaper') {
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();
  const panel = suggestionsPanel(page);
  await panel.getByRole('button', { name: view }).click();
  return panel;
}

test('clicking two swaps for the same card at once swaps it only once', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  const panel = await openSuggestions(page, 'Cheaper');
  const group = panel.getByRole('region', { name: 'Cheaper than Minas Tirith' });
  await expect(group.getByRole('button', { name: /^Swap Minas Tirith for / })).toHaveCount(3);
  // Both clicks land before either swap finishes.
  await group.evaluate((el) => el.querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => i < 2 && b.click()));
  await showPane(page, 'Cards');
  await expect(page.getByRole('row').filter({ hasText: 'Buried Ruin' })).toBeVisible();
  // Let any second swap finish too, so the checks below see the settled deck, not a moment in between.
  await page.waitForTimeout(5000);

  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await expect(page.getByRole('row').filter({ hasText: 'Haven of the Spirit Dragon' })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Minas Tirith' })).toHaveCount(0);
});

test('ticking a card as owned removes its cheaper replacements', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  const panel = await openSuggestions(page, 'Cheaper');
  await expect(panel.getByRole('region', { name: 'Cheaper than Minas Tirith' })).toBeVisible();
  await showPane(page, 'Cards');
  await page.getByRole('checkbox', { name: 'Own Minas Tirith' }).check();
  await showPane(page, 'Suggestions');
  await expect(panel.getByRole('region', { name: 'Cheaper than Minas Tirith' })).toHaveCount(0);
});

test('the Undo offer goes away once the deck is changed another way', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  const panel = await openSuggestions(page, 'Swaps');
  await panel.getByRole('button', { name: 'Swap Purify for Indulgent Aristocrat' }).click();
  await expect(panel.getByRole('button', { name: 'Undo' })).toBeVisible();
  await showPane(page, 'Cards');
  await page.getByRole('button', { name: 'Keep Mortify' }).click();
  await showPane(page, 'Suggestions');
  await expect(panel.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});

test('removing a card while an added one is still being priced keeps both changes', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();
  await expect(page.getByRole('list', { name: 'Budget upgrades' }).getByRole('listitem').first()).toBeVisible();

  // From here on every Scryfall answer is held, so pricing the added card takes a while.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('https://api.scryfall.com/**', async (route) => {
    await gate;
    await route.fallback();
  });

  await page.getByRole('button', { name: 'Add Indulgent Aristocrat' }).click();
  await showPane(page, 'Cards');
  await page.getByRole('button', { name: 'Remove Cordial Vampire' }).click(); // while the add is still pricing
  await expect(page.getByTestId('deck-count')).toHaveText('99 / 100 cards');
  release();

  // Both changes stand: +1 for the added card, -1 for the removed one. (It used to rebuild the list from before the wait.)
  await expect(page.getByRole('row').filter({ hasText: 'Indulgent Aristocrat' })).toBeVisible();
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await expect(page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Cordial Vampire', exact: true }) })).toHaveCount(0);
});
