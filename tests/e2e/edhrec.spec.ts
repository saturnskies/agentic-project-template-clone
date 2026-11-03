import { expect, test } from '@playwright/test';
import { edgarEdhrec, edgarFull, mockScryfall, seedEdgarDeck } from './helpers';

// The full Edgar Markov deck, with EDHREC's Edgar page and its Scryfall lookups recorded 2026-11-03
// (tests/fixtures/edhrec-edgar.json). Prices are that recording's.

test('upgrades come from what Edgar Markov decks play, grouped by category, including off-tribe artifacts and enchantments', async ({ page }) => {
  const misses = await mockScryfall(page, edgarFull, edgarEdhrec);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await page.getByRole('button', { name: 'Find suggestions' }).click();

  const panel = page.getByRole('complementary', { name: 'Suggestions' });
  const source = panel.getByTestId('edhrec-source');
  await expect(source).toContainText(/From [\d,]+ Edgar Markov decks on EDHREC/);
  await expect(source.getByRole('link')).toHaveAttribute('href', 'https://edhrec.com/commanders/edgar-markov');

  const groups = await panel.getByRole('region').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(groups.slice(0, 3)).toEqual(['Creatures', 'Instants', 'Sorceries']);
  expect(groups).toEqual(expect.arrayContaining(['Utility Artifacts', 'Enchantments', 'Lands']));

  const artifacts = panel.getByRole('list', { name: 'Utility Artifacts upgrades' });
  await expect(artifacts.getByRole('listitem')).toHaveCount(5);
  await expect(artifacts.getByRole('listitem').first()).toContainText("Herald's Horn");
  await expect(artifacts.getByRole('listitem').first()).toContainText(/In \d+% of Edgar Markov decks · \+\d+% synergy/);
  await expect(artifacts.getByRole('link', { name: "Herald's Horn" })).toHaveAttribute('href', /^https:\/\/www\.tcgplayer\.com\/product\/\d+$/);
  await expect(panel.getByRole('list', { name: 'Enchantments upgrades' })).toContainText('Exquisite Blood');
  // The deck already runs Skullclamp, EDHREC's top utility artifact for Edgar.
  await expect(panel.getByRole('button', { name: 'Add Skullclamp' })).toHaveCount(0);

  // Show more adds five at a time.
  await panel.getByRole('button', { name: 'Show more Utility Artifacts' }).click();
  await expect(artifacts.getByRole('listitem')).toHaveCount(10);

  // Nothing suggested is already in the deck, and no basic lands.
  const names = await panel.locator('.sugg-name').allTextContents();
  expect(names).not.toContain('Swamp');
  for (const name of names) {
    await expect(page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })).toHaveCount(0);
  }
  expect(misses).toEqual([]);
});

test('adding an EDHREC suggestion puts it in the deck and takes it off the list', async ({ page }) => {
  const misses = await mockScryfall(page, edgarFull, edgarEdhrec);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await page.getByRole('button', { name: 'Find suggestions' }).click();

  await page.getByRole('button', { name: "Add Herald's Horn" }).click();
  await expect(page.getByTestId('deck-count')).toHaveText('101 / 100 cards');
  await expect(page.getByRole('row').filter({ hasText: "Herald's Horn" })).toBeVisible();
  await expect(page.getByRole('button', { name: "Add Herald's Horn" })).toHaveCount(0);
  // The list refills from the rest of the page without new requests.
  await expect(page.getByRole('list', { name: 'Utility Artifacts upgrades' }).getByRole('listitem')).toHaveCount(5);
  expect(misses).toEqual([]);
});

test('when EDHREC has no page for the commander, upgrades fall back to card rules and say so', async ({ page }) => {
  const misses = await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await page.getByRole('button', { name: 'Find suggestions' }).click();

  const panel = page.getByRole('complementary', { name: 'Suggestions' });
  await expect(panel).toContainText('EDHREC has no decks for Edgar Markov, so these come from card rules, not real decks.');
  await expect(panel.getByRole('list', { name: 'Budget upgrades' }).getByRole('listitem').first()).toContainText('Indulgent Aristocrat');
  expect(misses).toEqual([]);
});

test("when EDHREC doesn't answer, upgrades fall back to card rules and say so", async ({ page }) => {
  await mockScryfall(page, edgarFull, edgarEdhrec);
  await page.route('https://json.edhrec.com/**', (route) => route.abort());
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await page.getByRole('button', { name: 'Find suggestions' }).click();

  const panel = page.getByRole('complementary', { name: 'Suggestions' });
  await expect(panel).toContainText("EDHREC didn't answer, so these come from card rules", { timeout: 30_000 });
  await expect(panel.getByRole('list', { name: 'Budget upgrades' }).getByRole('listitem').first()).toContainText('Indulgent Aristocrat');
});
