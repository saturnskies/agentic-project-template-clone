import { expect, test, type Page } from '@playwright/test';
import type { FixtureMap } from '../support/fixtures';
import { edgarEdhrec, edgarFull, mockScryfall, seedEdgarDeck, showPane } from './helpers';

// Tap a card in the deck list, see similar cards that fit (swap-from-card spec). The full Edgar Markov deck
// with EDHREC's Edgar pages recorded 2026-11-03 (tests/fixtures/edhrec-edgar.json); the deck runs no Game
// Changers, so the page is bracket 2 (Core).

/**
 * The Edgar recordings predate the recorder keeping `mana_cost`, so the costs the tests look for are added to the
 * recorded replies here (Scryfall's real costs for those cards).
 */
const COSTS: Record<string, string> = { 'Arcane Signet': '{2}', "Commander's Sphere": '{3}' };
const withCosts = (map: FixtureMap): FixtureMap =>
  JSON.parse(JSON.stringify(map), (_key, v) => (v && typeof v === 'object' && 'oracle_id' in v && v.name in COSTS ? { ...v, mana_cost: COSTS[v.name] } : v));

/**
 * Opens the Edgar deck (without `removed` cards, which then count as candidates), runs Find suggestions, waits for
 * EDHREC's page and the role lookups, and leaves the Cards pane showing.
 */
async function foundEdgar(page: Page, removed: string[] = []) {
  const misses = await mockScryfall(page, withCosts(edgarFull), withCosts(edgarEdhrec));
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  for (const name of removed) await page.getByRole('button', { name: `Remove ${name}` }).click();
  await showPane(page, 'Suggestions');
  await page.getByRole('button', { name: 'Find suggestions' }).click();
  await expect(page.getByTestId('edhrec-source')).toBeVisible({ timeout: 15_000 });
  await showPane(page, 'Cards');
  return misses;
}
const nameButton = (page: Page, name: string) => page.locator('table.cards').getByRole('button', { name, exact: true });
const TCGPLAYER = /^https:\/\/www\.tcgplayer\.com\/product\/\d+$/;

test('tapping a card name opens a dialog with the card and similar cards that fit', async ({ page }) => {
  const misses = await foundEdgar(page);
  await nameButton(page, 'Arcane Signet').click();

  const dialog = page.getByRole('dialog', { name: 'Arcane Signet' });
  await expect(dialog).toBeVisible();
  const mine = dialog.getByRole('region', { name: 'Your card' });
  await expect(mine).toContainText("{T}: Add one mana of any color in your commander's color identity.");
  await expect(mine.locator('.mana-cost')).toHaveText('{2}');
  await expect(mine).toContainText(/\$\d+\.\d\d/);
  await expect(mine.getByTestId('tapped-popularity')).toHaveText(/^In \d+% of Edgar Markov decks$/);
  await expect(mine.getByRole('link', { name: 'Buy on TCGplayer' })).toHaveAttribute('href', TCGPLAYER);

  // Other mana rocks, from the deck-mates' page: each with name, price, popularity and text. Sol Ring and Skullclamp are
  // in the deck already, and the rest of the page's artifacts don't read like a mana rock.
  const options = dialog.getByRole('list', { name: 'Similar cards' }).getByRole('listitem');
  await expect(options.first()).toBeVisible();
  const names = await options.locator('.sugg-name').allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(1);
  expect(names.length).toBeLessThanOrEqual(10);
  expect(names).toContain("Commander's Sphere");
  expect(names).not.toContain('Arcane Signet');
  expect(names).not.toContain('Sol Ring');
  expect(names).not.toContain('Skullclamp');
  for (const option of await options.all()) {
    await expect(option.getByRole('link').first()).toHaveAttribute('href', TCGPLAYER);
    await expect(option).toContainText(/\$\d+\.\d\d/);
    await expect(option).toContainText(/In \d+% of Edgar Markov decks/);
    await expect(option.locator('.swap-type')).toContainText('Artifact');
    await expect(option.locator('.swap-text')).not.toBeEmpty();
  }
  await expect(options.filter({ hasText: "Commander's Sphere" }).locator('.mana-cost')).toHaveText('{3}');
  expect(misses).toEqual([]);
});

test('a land gets only lands, 10 at most, with Show more for the rest', async ({ page }) => {
  // Four of the deck's lands go back into the pool, so more than ten dual lands read like Haunted Ridge.
  await foundEdgar(page, ['Shattered Sanctum', 'Smoldering Marsh', 'Sundown Pass', 'Thriving Bluff']);
  await nameButton(page, 'Haunted Ridge').click();
  const dialog = page.getByRole('dialog', { name: 'Haunted Ridge' });
  const options = dialog.getByRole('list', { name: 'Similar cards' }).getByRole('listitem');
  await expect(options).toHaveCount(10);
  await dialog.getByRole('button', { name: 'Show more' }).click();
  expect(await options.count()).toBeGreaterThan(10);
  expect(await options.count()).toBeLessThanOrEqual(20);
  for (const type of await options.locator('.swap-type').allTextContents()) expect(type).toContain('Land');
  // A page of ten at most, so the button goes once everything is shown (or stays for a further page).
  if ((await options.count()) < 20) await expect(dialog.getByRole('button', { name: 'Show more' })).toHaveCount(0);
});

test('a card with no similar cards that fit says so', async ({ page }) => {
  await foundEdgar(page);
  await nameButton(page, 'Blasphemous Act').click();
  const dialog = page.getByRole('dialog', { name: 'Blasphemous Act' });
  await expect(dialog.getByTestId('tapped-popularity')).toHaveText(/^In \d+% of Edgar Markov decks$/);
  await expect(dialog).toContainText('No similar cards found for this deck yet.');
  await expect(dialog.getByRole('button', { name: 'Show more' })).toHaveCount(0);
});

test('the commander and basic lands keep their TCGplayer link instead of opening the dialog', async ({ page }) => {
  await foundEdgar(page);
  await expect(page.locator('table.cards').getByRole('link', { name: 'Edgar Markov', exact: true })).toHaveAttribute('href', TCGPLAYER);
  await expect(page.locator('table.cards').getByRole('link', { name: 'Swamp', exact: true })).toHaveAttribute('href', TCGPLAYER);
  await expect(nameButton(page, 'Swamp')).toHaveCount(0);
});

test('Escape closes the dialog', async ({ page }) => {
  await foundEdgar(page);
  await nameButton(page, 'Skullclamp').click();
  await expect(page.getByRole('dialog', { name: 'Skullclamp' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('on a phone the dialog buttons and links are at least 44px tall', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only');
  await foundEdgar(page);
  await nameButton(page, 'Arcane Signet').click();
  const dialog = page.getByRole('dialog', { name: 'Arcane Signet' });
  await expect(dialog.getByRole('listitem').first()).toBeVisible();
  for (const target of [dialog.getByRole('button', { name: 'Close' }), dialog.getByRole('link', { name: 'Buy on TCGplayer' }), dialog.getByRole('listitem').first().getByRole('link').first()]) {
    const box = await target.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
