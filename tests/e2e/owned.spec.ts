import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { edgarFull, mockScryfall, pasteAndFix, showPane } from './helpers';

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

test('owned cards are remembered across reloads, and belong to one deck only', async ({ page }) => {
  await mockScryfall(page);
  await pasteAndFix(page, 'First');
  await page.getByRole('checkbox', { name: 'Own Sol Ring' }).check();
  await expect(page.getByTestId('deck-to-buy')).toHaveText('$34.37');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Own Sol Ring' })).toBeChecked();

  // A physical card is in one deck at a time: owning Sol Ring for First says nothing about Second.
  await pasteAndFix(page, 'Second');
  await expect(page.getByRole('checkbox', { name: 'Own Sol Ring' })).not.toBeChecked();
  await expect(page.getByTestId('deck-to-buy')).toHaveText('$35.47');

  await page.getByRole('link', { name: 'Swapsmith' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'First' })).toContainText('$34.37 to buy');
  await expect(page.getByRole('listitem').filter({ hasText: 'Second' })).toContainText('$35.47 to buy');
});

// Two copies of the full Edgar deck, so the same card is in both. Minas Tirith is $6.08, so it has cheaper replacements
// unless it is owned.
const MINAS = '7b0d7e62-0287-454a-8702-b0bfa7b41245';
async function seedTwoDecks(page: import('@playwright/test').Page, store: (a: object, b: object) => object) {
  const edgar = JSON.parse(readFileSync(new URL('../fixtures/edgar-deck.json', import.meta.url), 'utf8'));
  const a = { ...edgar, id: 'deck-a', name: 'Deck A' };
  const b = { ...edgar, id: 'deck-b', name: 'Deck B' };
  await page.addInitScript(
    ([payload]) => {
      if (!localStorage.getItem('swapsmith:v1')) localStorage.setItem('swapsmith:v1', payload);
    },
    [JSON.stringify(store(a, b))],
  );
}

test('ticking a card in one deck leaves it unticked in another deck that has it', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  await seedTwoDecks(page, (a, b) => ({ version: 2, decks: [a, b], prefs: { view: 'list' } }));

  await page.goto('./#/deck/deck-a');
  await expect(page.getByTestId('deck-total')).toHaveText(/\$/);
  const beforeA = await page.getByTestId('deck-to-buy').textContent();
  await page.getByRole('checkbox', { name: 'Own Minas Tirith' }).check();
  await expect(page.getByTestId('deck-to-buy')).not.toHaveText(beforeA!);

  await page.goto('./#/deck/deck-b');
  await expect(page.getByTestId('deck-total')).toHaveText(/\$/);
  await expect(page.getByRole('checkbox', { name: 'Own Minas Tirith' })).not.toBeChecked();
  await expect(page.getByTestId('deck-to-buy')).toHaveText(beforeA!); // Deck B is untouched by what Deck A owns
});

test("suggestions in a deck ignore what you own in another deck", async ({ page }) => {
  await mockScryfall(page, edgarFull);
  // Minas Tirith is owned for Deck A only.
  await seedTwoDecks(page, (a, b) => ({ version: 2, decks: [{ ...a, owned: [MINAS], unownedBasics: [] }, b], prefs: { view: 'list' } }));

  await page.goto('./#/deck/deck-b');
  await expect(page.getByTestId('deck-total')).toHaveText(/\$/);
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();
  const panel = page.getByRole('complementary', { name: 'Suggestions' });
  await panel.getByRole('button', { name: 'Cheaper' }).click();
  await expect(panel.getByRole('region', { name: 'Cheaper than Minas Tirith' })).toBeVisible();

  // The same card IS owned in Deck A, so there it has no cheaper replacements: ownership is read per deck, in both directions.
  await page.goto('./#/deck/deck-a');
  await expect(page.getByTestId('deck-total')).toHaveText(/\$/);
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();
  const panelA = page.getByRole('complementary', { name: 'Suggestions' });
  await panelA.getByRole('button', { name: 'Cheaper' }).click();
  await expect(panelA).toContainText('Cheaper cards that do the same job'); // the Cheaper view has drawn
  await expect(panelA.getByRole('region', { name: 'Cheaper than Minas Tirith' })).toHaveCount(0);
});

test('data saved before ownership moved into each deck opens with every deck looking the same', async ({ page }) => {
  await mockScryfall(page, edgarFull);
  // The old shape: one owned list for the whole app.
  await seedTwoDecks(page, (a, b) => ({ version: 1, decks: [a, b], owned: [MINAS], unownedBasics: [], prefs: { view: 'list' } }));

  await page.goto('./#/deck/deck-a');
  await expect(page.getByRole('checkbox', { name: 'Own Minas Tirith' })).toBeChecked();
  await page.goto('./#/deck/deck-b');
  await expect(page.getByRole('checkbox', { name: 'Own Minas Tirith' })).toBeChecked();

  // From now on they are separate: unticking in B leaves A alone, and nothing shared is saved any more.
  await page.getByRole('checkbox', { name: 'Own Minas Tirith' }).uncheck();
  await page.goto('./#/deck/deck-a');
  await expect(page.getByRole('checkbox', { name: 'Own Minas Tirith' })).toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('swapsmith:v1')!));
  expect(saved.version).toBe(2);
  expect(saved).not.toHaveProperty('owned');
  expect(saved.decks.find((d: { id: string }) => d.id === 'deck-b').owned).toEqual([]);
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
