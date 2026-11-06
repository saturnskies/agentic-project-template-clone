import { expect, test, type Locator, type Page } from '@playwright/test';
import type { FixtureMap } from '../support/fixtures';
import { edgarEdhrec, edgarFull, mockScryfall, seedEdgarDeck, showPane, suggestionsPanel } from './helpers';

// Tap a card in the deck list, see similar cards that fit (swap-from-card spec). The full Edgar Markov deck
// with EDHREC's Edgar pages recorded 2026-11-03 (tests/fixtures/edhrec-edgar.json); the deck runs no Game
// Changers, so the page is bracket 2 (Core).

/**
 * The Edgar recordings predate the recorder keeping `mana_cost` and `cmc`, so the costs the tests look for are added to
 * the recorded replies here (Scryfall's real costs for those cards).
 */
const COSTS: Record<string, [cost: string, cmc: number]> = { 'Arcane Signet': ['{2}', 2], "Commander's Sphere": ['{3}', 3], 'Orzhov Signet': ['{1}', 2], 'Phyrexian Altar': ['{3}', 3] };
const withCosts = (map: FixtureMap): FixtureMap =>
  JSON.parse(JSON.stringify(map), (_key, v) => (v && typeof v === 'object' && 'oracle_id' in v && v.name in COSTS ? { ...v, mana_cost: COSTS[v.name][0], cmc: COSTS[v.name][1] } : v));

/**
 * A copy of EDHREC's Edgar pages with the page cards changed: `decks` sets a card's deck count (of the page's 3409), and
 * `without` takes a card off the page. Inclusion is decks over 3409, so Arcane Signet is at 78%, Orzhov Signet 40%,
 * Commander's Sphere 20% and Phyrexian Altar 7%.
 */
const withPage = (map: FixtureMap, edit: { decks?: Record<string, number>; without?: string[] }): FixtureMap =>
  JSON.parse(JSON.stringify(map), (key, v) => {
    if (key === 'cardviews' && Array.isArray(v)) return v.filter((c) => !edit.without?.includes(c.name));
    if (v && typeof v === 'object' && 'num_decks' in v && v.name in (edit.decks ?? {})) return { ...v, num_decks: edit.decks![v.name] };
    return v;
  });

/**
 * Opens the Edgar deck (without `removed` cards, which then count as candidates), runs Find suggestions, waits for
 * EDHREC's page and the role lookups, and leaves the Cards pane showing.
 */
async function foundEdgar(page: Page, removed: string[] = [], edhrec: FixtureMap = edgarEdhrec) {
  const misses = await mockScryfall(page, withCosts(edgarFull), withCosts(edhrec));
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

// Swap from the dialog: the same swap as the Suggestions tab, so it ends in the same Undo offer. Arcane Signet's options
// are Commander's Sphere, Phyrexian Altar and Orzhov Signet; Orzhov Signet is also an option for Sol Ring.
const swapButton = (dialog: Locator, from: string, to: string) => dialog.getByRole('button', { name: `Swap ${from} for ${to}`, exact: true });
const toast = (page: Page) => page.getByRole('status').filter({ hasText: /^Swapped / });
const rowCount = (page: Page, name: string) => page.locator('table.cards tbody tr').filter({ has: page.getByRole('button', { name, exact: true }) });

test('Swap replaces the tapped card, closes the dialog and offers Undo', async ({ page }) => {
  const misses = await foundEdgar(page);
  const total = await page.getByTestId('deck-total').textContent();
  await nameButton(page, 'Arcane Signet').click();
  const dialog = page.getByRole('dialog', { name: 'Arcane Signet' });
  await swapButton(dialog, 'Arcane Signet', "Commander's Sphere").click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await expect(rowCount(page, "Commander's Sphere")).toHaveCount(1);
  await expect(rowCount(page, 'Arcane Signet')).toHaveCount(0);
  await expect(page.getByTestId('deck-total')).not.toHaveText(total!);

  // Undo is on the Cards pane itself, so a phone (where the Suggestions pane is hidden) can reach it without switching.
  const offer = toast(page);
  await expect(offer).toContainText("Swapped Arcane Signet → Commander's Sphere.");
  await offer.getByRole('button', { name: 'Undo' }).click();
  await expect(rowCount(page, 'Arcane Signet')).toHaveCount(1);
  await expect(rowCount(page, "Commander's Sphere")).toHaveCount(0);
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await expect(page.getByTestId('deck-total')).toHaveText(total!);
  await expect(offer).toHaveCount(0);
  // The panel's own offer is gone too.
  await showPane(page, 'Suggestions');
  await expect(suggestionsPanel(page)).not.toContainText('Swapped ');
  // Pricing the swapped-in card asks for its printings, which the Edgar recordings hold only for cards in the deck; the
  // app prices the card it already has when that fails. Nothing else may go unrecorded.
  expect(misses.filter((m) => !m.includes('unique=prints'))).toEqual([]);
});

test("Undo in the Suggestions panel also ends the Cards pane's offer", async ({ page }) => {
  await foundEdgar(page);
  const total = await page.getByTestId('deck-total').textContent();
  await nameButton(page, 'Arcane Signet').click();
  await swapButton(page.getByRole('dialog', { name: 'Arcane Signet' }), 'Arcane Signet', "Commander's Sphere").click();
  await expect(toast(page)).toBeVisible();
  await showPane(page, 'Suggestions');
  const panel = suggestionsPanel(page);
  await expect(panel).toContainText("Swapped Arcane Signet → Commander's Sphere.");
  await panel.getByRole('button', { name: 'Undo' }).click();
  await expect(toast(page)).toHaveCount(0);
  await showPane(page, 'Cards');
  await expect(rowCount(page, 'Arcane Signet')).toHaveCount(1);
  await expect(page.getByTestId('deck-total')).toHaveText(total!);
});

test('a swap from the Suggestions tab leaves the Cards pane without an offer', async ({ page }) => {
  await foundEdgar(page);
  await showPane(page, 'Suggestions');
  const panel = suggestionsPanel(page);
  await panel.getByRole('button', { name: 'Swaps' }).click();
  await panel.getByRole('list', { name: 'Swap pairs' }).getByRole('button', { name: /^Swap .* for / }).first().click();
  await expect(panel).toContainText('Swapped ');
  await expect(toast(page)).toHaveCount(0);
});

test('a card marked Keep still opens the dialog, lists options and swaps', async ({ page }) => {
  await foundEdgar(page);
  await page.getByRole('button', { name: 'Keep Arcane Signet' }).click();
  await expect(page.getByRole('button', { name: 'Keep Arcane Signet' })).toHaveAttribute('aria-pressed', 'true');
  await nameButton(page, 'Arcane Signet').click();
  const dialog = page.getByRole('dialog', { name: 'Arcane Signet' });
  await expect(dialog.getByRole('list', { name: 'Similar cards' }).getByRole('listitem').first()).toBeVisible();
  await swapButton(dialog, 'Arcane Signet', "Commander's Sphere").click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rowCount(page, "Commander's Sphere")).toHaveCount(1);
  await expect(rowCount(page, 'Arcane Signet')).toHaveCount(0);
});

test('after a swap, another card no longer lists the card that went in', async ({ page }) => {
  await foundEdgar(page);
  await nameButton(page, 'Arcane Signet').click();
  const first = page.getByRole('dialog', { name: 'Arcane Signet' });
  await expect(first.locator('.sugg-name', { hasText: 'Orzhov Signet' })).toBeVisible();
  await page.keyboard.press('Escape');
  await nameButton(page, 'Sol Ring').click();
  const dialog = page.getByRole('dialog', { name: 'Sol Ring' });
  await swapButton(dialog, 'Sol Ring', 'Orzhov Signet').click();
  await expect(rowCount(page, 'Orzhov Signet')).toHaveCount(1);

  await nameButton(page, 'Arcane Signet').click();
  const again = page.getByRole('dialog', { name: 'Arcane Signet' });
  const options = again.getByRole('list', { name: 'Similar cards' }).getByRole('listitem');
  await expect(options.first()).toBeVisible();
  expect(await options.locator('.sugg-name').allTextContents()).not.toContain('Orzhov Signet');
});

test('pressing Swap on two options at once swaps once, and never adds a card twice', async ({ page }) => {
  await foundEdgar(page);
  await nameButton(page, 'Arcane Signet').click();
  const dialog = page.getByRole('dialog', { name: 'Arcane Signet' });
  await expect(swapButton(dialog, 'Arcane Signet', "Commander's Sphere")).toBeVisible();
  // Both clicks land before either swap finishes; the options are Commander's Sphere, then Phyrexian Altar.
  await dialog.evaluate((el) => el.querySelectorAll<HTMLButtonElement>('.swap-option button').forEach((b, i) => i < 2 && b.click()));
  await expect(rowCount(page, "Commander's Sphere")).toHaveCount(1);
  // Let any second swap finish too, so the checks below see the settled deck, not a moment in between.
  await page.waitForTimeout(3000);
  await expect(page.getByTestId('deck-count')).toHaveText('100 / 100 cards');
  await expect(rowCount(page, 'Phyrexian Altar')).toHaveCount(0);
  await expect(rowCount(page, 'Arcane Signet')).toHaveCount(0);
  await expect(rowCount(page, "Commander's Sphere")).toHaveCount(1);
});

// Better fit and the comparison line. Scores are EDHREC's inclusion plus positive synergy: Arcane Signet 0.78, Orzhov
// Signet 0.51, Commander's Sphere 0.28, Phyrexian Altar 0.07. The options for Arcane Signet cost {2}, {1}, {3} and {3}
// (cmc 2, 2, 3 and 3).
const option = (dialog: Locator, name: string) => dialog.getByRole('listitem').filter({ has: dialog.page().getByRole('link', { name, exact: true }) });

test('no option is flagged Better fit when the tapped card is the most played, and the comparison line follows the cost', async ({ page }) => {
  await foundEdgar(page);
  await nameButton(page, 'Arcane Signet').click();
  const dialog = page.getByRole('dialog', { name: 'Arcane Signet' });
  await expect(option(dialog, "Commander's Sphere")).toBeVisible();
  await expect(dialog.getByText('Better fit')).toHaveCount(0);
  await expect(option(dialog, "Commander's Sphere").locator('.swap-diff')).toHaveText('Costs 1 more');
  // Same mana value and nothing else the data states: no line at all, and the option stays in the list.
  await expect(option(dialog, 'Orzhov Signet')).toBeVisible();
  await expect(option(dialog, 'Orzhov Signet').locator('.swap-diff')).toHaveCount(0);
});

test('an option more played than the tapped card by at least 0.1 is flagged Better fit, with a label that says what it means', async ({ page }) => {
  // Commander's Sphere at 97% of decks (score 1.05) against Arcane Signet's 0.78; Orzhov Signet (0.51) is not more played.
  await foundEdgar(page, [], withPage(edgarEdhrec, { decks: { "Commander's Sphere": 3300 } }));
  await nameButton(page, 'Arcane Signet').click();
  const dialog = page.getByRole('dialog', { name: 'Arcane Signet' });
  const sphere = option(dialog, "Commander's Sphere");
  await expect(sphere.getByText('Better fit')).toBeVisible();
  await expect(sphere.locator('.tag')).toHaveAttribute('title', 'More played than Arcane Signet for this commander');
  await expect(sphere.locator('.tag')).toContainText('More played than Arcane Signet for this commander');
  await expect(sphere.locator('.swap-diff')).toHaveText('Costs 1 more');
  await expect(option(dialog, 'Orzhov Signet').getByText('Better fit')).toHaveCount(0);
  await expect(dialog.getByText('Better fit')).toHaveCount(1);
  await expect(dialog.getByText("Not on this commander's page")).toHaveCount(0);
});

test("a tapped card the page doesn't list says so, and every option with a score is flagged", async ({ page }) => {
  await foundEdgar(page, [], withPage(edgarEdhrec, { without: ['Arcane Signet'] }));
  await nameButton(page, 'Arcane Signet').click();
  const dialog = page.getByRole('dialog', { name: 'Arcane Signet' });
  await expect(option(dialog, "Commander's Sphere")).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Your card' })).toContainText("Not on this commander's page");
  await expect(dialog.getByTestId('tapped-popularity')).toHaveCount(0);
  await expect(option(dialog, "Commander's Sphere").getByText('Better fit')).toBeVisible();
  await expect(option(dialog, 'Orzhov Signet').getByText('Better fit')).toBeVisible();
  // Phyrexian Altar's 0.07 is under the margin even against a score of 0.
  await expect(option(dialog, 'Phyrexian Altar').getByText('Better fit')).toHaveCount(0);
});
