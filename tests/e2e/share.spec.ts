import { expect, test } from '@playwright/test';
import { flows, mockScryfall, pasteAndFix } from './helpers';
import { requestKey } from '../support/fixtures';

test('share a deck by link; a friend sees it read-only and can save a copy', async ({ page, browser }) => {
  await mockScryfall(page);
  await pasteAndFix(page, 'Edgar to share');
  // Personal state that must NOT travel: an owned card. A chosen printing should.
  await page.getByRole('checkbox', { name: 'Own Sol Ring' }).check();
  await page.getByRole('button', { name: 'Change printing of Edgar Markov' }).click();
  await page.getByRole('dialog').getByRole('listitem').nth(1).getByRole('button', { name: 'Use this printing' }).click();
  await expect(page.getByTestId('deck-total')).toHaveText('$39.93');

  await page.getByRole('button', { name: 'Share' }).click();
  const link = await page.getByRole('textbox', { name: 'Share link' }).inputValue();
  expect(link).toMatch(/\/swapsmith\/#d=[A-Za-z0-9_-]+$/);
  await expect(page.getByRole('status').filter({ hasText: 'owned cards are not included' })).toBeVisible();

  // A friend: a brand-new browser profile with nothing saved.
  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  // The home page asks for the picked commander printing's art; answer it so no request goes unrecorded.
  const artKey = requestKey('POST', 'https://api.scryfall.com/cards/collection', JSON.stringify({ identifiers: [{ id: '089b6e6f-c178-4612-866f-da9cbc01b442' }] }));
  const artReply = { status: 200, body: { object: 'list', not_found: [], data: [{ object: 'card', id: '089b6e6f-c178-4612-866f-da9cbc01b442', name: 'Edgar Markov', image_uris: { art_crop: 'https://cards.scryfall.io/art_crop/test.jpg' } }] } };
  const misses = await mockScryfall(friend, { ...flows, [artKey]: artReply });
  await friend.goto(link);
  await expect(friend.getByRole('heading', { level: 2, name: 'Edgar to share' })).toBeVisible();
  await expect(friend.getByText('A shared deck.')).toBeVisible();
  await expect(friend.getByTestId('deck-total')).toHaveText('$39.93');
  await expect(friend.getByRole('row').filter({ hasText: 'Edgar Markov' })).toContainText('INR #328');
  // Read-only: no editing controls, and nothing saved yet.
  await expect(friend.getByRole('checkbox')).toHaveCount(0);
  await expect(friend.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  await expect(friend.getByRole('combobox', { name: 'Add a card' })).toHaveCount(0);
  await expect(friend.getByRole('button', { name: 'Delete deck' })).toHaveCount(0);
  await expect(friend.getByRole('button', { name: 'Share' })).toHaveCount(0);
  await expect(friend.getByRole('group', { name: 'Show' })).toHaveCount(0); // no suggestions, so no Cards | Suggestions switch

  await friend.getByRole('button', { name: 'Save to my decks' }).click();
  await expect(friend).toHaveURL(/#\/deck\//);
  await expect(friend.getByRole('checkbox', { name: 'Own Sol Ring' })).not.toBeChecked();
  await expect(friend.getByRole('row').filter({ hasText: 'Edgar Markov' })).toContainText('INR #328');
  await friend.getByRole('link', { name: 'Swapsmith' }).click();
  await expect(friend.getByRole('listitem').filter({ hasText: 'Edgar to share' })).toBeVisible();
  expect(misses).toEqual([]);
  await friendCtx.close();
});

test('a damaged share link explains what went wrong', async ({ page }) => {
  await mockScryfall(page);
  await page.goto('./#d=not-really-a-deck');
  await expect(page.getByRole('heading', { name: "Couldn't open this shared deck" })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('damaged');
  await page.getByRole('link', { name: 'Go to your decks' }).click();
  await expect(page.getByRole('heading', { name: 'Your decks' })).toBeVisible();
});
