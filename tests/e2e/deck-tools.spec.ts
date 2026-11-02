import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { mockScryfall, pasteAndFix } from './helpers';

test('rename a deck: saved, shown on the home screen, and kept after a reload', async ({ page }) => {
  await mockScryfall(page);
  await pasteAndFix(page, 'Edgar test');
  await page.getByRole('button', { name: 'Rename' }).click();
  const input = page.getByRole('textbox', { name: 'Deck name' });
  await expect(input).toHaveValue('Edgar test');
  await input.fill('  Bloodline   Vampires ');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Bloodline Vampires' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Bloodline Vampires' })).toBeVisible();
  await page.getByRole('link', { name: '← Your decks' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Bloodline Vampires' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Edgar test' })).toHaveCount(0);
});

test('rename refuses an empty name, and Cancel and Escape keep the old one', async ({ page }) => {
  await mockScryfall(page);
  await pasteAndFix(page, 'Keep me');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Deck name' }).fill('   ');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Give the deck a name.' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Keep me' })).toBeVisible();

  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Deck name' }).fill('Something else');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 2, name: 'Keep me' })).toBeVisible();
});

test('back from a new deck goes to Your decks, not to the paste screen', async ({ page }) => {
  await mockScryfall(page);
  await pasteAndFix(page, 'Back test');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Your decks' })).toBeVisible();
});

test('back up the decks, lose them, and restore from the file', async ({ page }, testInfo) => {
  await mockScryfall(page);
  await pasteAndFix(page, 'Precious deck');
  await page.getByRole('checkbox', { name: 'Own Sol Ring' }).check();
  await page.getByRole('link', { name: '← Your decks' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up my decks' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^swapsmith-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = testInfo.outputPath('backup.json');
  await file.saveAs(path);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ app: 'swapsmith', backup: 1 });

  // A reinstall: everything the browser kept is gone.
  await page.evaluate(() => localStorage.clear());
  await page.goto('./');
  await page.reload();
  await expect(page.getByText('No decks yet')).toBeVisible();

  await page.getByLabel('Backup file').setInputFiles(path);
  await expect(page.getByRole('listitem').filter({ hasText: 'Precious deck' })).toBeVisible();
  await expect(page.getByText('Restored: 1 deck added, 0 updated. Nothing was deleted.')).toBeVisible();

  // Restoring again is harmless.
  await page.getByLabel('Backup file').setInputFiles(path);
  await expect(page.getByText('Restored: 0 decks added, 0 updated.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Precious deck' })).toHaveCount(1);

  await page.getByRole('listitem').filter({ hasText: 'Precious deck' }).getByRole('link').click();
  await expect(page.getByRole('checkbox', { name: 'Own Sol Ring' })).toBeChecked();
});

test('restoring a file that is not a backup changes nothing and says so', async ({ page }, testInfo) => {
  await mockScryfall(page);
  await pasteAndFix(page, 'Untouched');
  await page.getByRole('link', { name: '← Your decks' }).click();
  const bad = testInfo.outputPath('bad.json');
  (await import('node:fs')).writeFileSync(bad, '{"hello": "world"}');
  await page.getByLabel('Backup file').setInputFiles(bad);
  await expect(page.getByRole('alert').filter({ hasText: "isn't a Swapsmith backup" })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Untouched' })).toHaveCount(1);
});
