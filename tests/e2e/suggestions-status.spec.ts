import { expect, test, type Page } from '@playwright/test';
import { openEdgarDeck, paneBar, showPane, suggestionsPanel } from './helpers';

// A status badge on the Suggestions tab, so a search started there is visible from the Cards pane
// (docs/superpowers/plans/2026-11-05-suggestions-tab-status.md). The tab only exists on a phone.

test.skip(({ isMobile }) => !isMobile, 'the Cards | Suggestions bar only exists on a phone');

const badge = (page: Page) => paneBar(page).locator('.pane-badge');
const live = (page: Page) => page.locator('.pane-bar .pane-live');

async function startSearchAndLeave(page: Page) {
  await showPane(page, 'Suggestions');
  await suggestionsPanel(page).getByRole('button', { name: 'Find suggestions' }).click();
  await showPane(page, 'Cards');
}

test('the tab shows that a search is running while you look at the list, then that it is ready', async ({ page }) => {
  await openEdgarDeck(page);
  await startSearchAndLeave(page);

  await expect(badge(page)).toHaveText('Searching');
  // The badge is decoration: the tab is still just "Suggestions" to a screen reader, and the bar says it aloud.
  await expect(paneBar(page).getByRole('button', { name: 'Suggestions', exact: true })).toBeVisible();
  await expect(live(page)).toContainText('Searching Scryfall for suggestions');

  await expect(badge(page)).toHaveText('Ready', { timeout: 60_000 });
  await expect(live(page)).toContainText('Suggestions are ready');

  await showPane(page, 'Suggestions');
  await expect(badge(page)).toBeHidden(); // seen, so it goes away
  await expect(suggestionsPanel(page).getByRole('list', { name: 'Budget upgrades' })).toBeVisible();
  await showPane(page, 'Cards');
  await expect(badge(page)).toBeHidden(); // and does not come back
});

test('a search that finishes while you are already on Suggestions shows no badge at all', async ({ page }) => {
  await openEdgarDeck(page);
  await showPane(page, 'Suggestions');
  await suggestionsPanel(page).getByRole('button', { name: 'Find suggestions' }).click();
  await expect(badge(page)).toBeHidden();
  await expect(suggestionsPanel(page).getByRole('list', { name: 'Budget upgrades' }).getByRole('listitem').first()).toBeVisible({ timeout: 60_000 });
  await expect(badge(page)).toBeHidden();
  await showPane(page, 'Cards');
  await expect(badge(page)).toBeHidden();
});

test('a search that cannot reach Scryfall says Failed on the tab, and a retry says Searching again', async ({ page }) => {
  await openEdgarDeck(page);
  await page.route(/api\.scryfall\.com\/cards\/search/, (route) => route.abort());
  await startSearchAndLeave(page);

  await expect(badge(page)).toHaveText('Failed', { timeout: 90_000 });
  await expect(live(page)).toContainText("Couldn't search Scryfall");

  await showPane(page, 'Suggestions');
  await expect(badge(page)).toBeHidden();
  await expect(suggestionsPanel(page)).toContainText("Couldn't reach Scryfall");

  await suggestionsPanel(page).getByRole('button', { name: 'Find suggestions' }).click();
  await showPane(page, 'Cards');
  await expect(badge(page)).toHaveText('Searching');
});

test('the badge fits on one line in the bar on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openEdgarDeck(page);
  await startSearchAndLeave(page);
  await expect(badge(page)).toHaveText('Searching');
  const tab = paneBar(page).getByRole('button', { name: 'Suggestions', exact: true });
  const { overflow, height } = await tab.evaluate((el) => ({ overflow: el.scrollWidth - el.clientWidth, height: el.getBoundingClientRect().height }));
  expect(overflow, 'text spilling out of the tab').toBeLessThanOrEqual(1);
  expect(height, 'tab wrapped onto two lines').toBeLessThanOrEqual(52);
});

test('the searching dot only pulses when motion is allowed', async ({ page }) => {
  await openEdgarDeck(page);
  await startSearchAndLeave(page);
  await expect(badge(page)).toHaveText('Searching');
  const animation = () => badge(page).evaluate((el) => getComputedStyle(el, '::before').animationName);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await animation()).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation()).toBe('none');
});
