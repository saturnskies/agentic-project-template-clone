import { expect, test } from '@playwright/test';
import { begin, life, minus, plus, start } from './life-helpers';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
});

test('starts a game from the setup: players, starting life, and a full-screen table', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('group', { name: 'Players' }).getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Starting life' }).getByRole('button', { name: '40', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('group', { name: 'Players' }).getByRole('button', { name: '3', exact: true }).click();
  await page.getByRole('group', { name: 'Starting life' }).getByRole('button', { name: '30', exact: true }).click();
  await begin(page);

  await expect(page).toHaveURL(/#\/life\/game$/);
  await expect(page.locator('.tile')).toHaveCount(3);
  for (const seat of [0, 1, 2]) await expect(life(page, seat)).toHaveText('30');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.locator('.site-header')).toBeHidden();
});

test('a custom starting life takes whole numbers from 1 to 999 only', async ({ page }) => {
  await start(page, { players: 2, life: 'custom' });
  const field = page.getByLabel('Custom starting life');
  const go = page.getByRole('button', { name: 'Start game' });
  for (const bad of ['0', '1000', '12.5', 'abc']) {
    await field.fill(bad);
    await expect(go).toBeDisabled();
    await expect(page.getByText('Enter a whole number from 1 to 999.')).toBeVisible();
  }
  await field.fill('25');
  await expect(go).toBeEnabled();
  await go.click();
  await expect(life(page, 0)).toHaveText('25');
  await expect(life(page, 1)).toHaveText('25');
});

test('tap changes life by one, from the player\'s own buttons', async ({ page }) => {
  await start(page, { players: 2 });
  await begin(page);
  await minus(page, 'Player 1').click();
  await minus(page, 'Player 1').click();
  await plus(page, 'Player 2').click();
  await expect(life(page, 0)).toHaveText('38');
  await expect(life(page, 1)).toHaveText('41');
});

test('keyboard: Enter changes by one, Shift+Enter by ten', async ({ page }) => {
  await start(page, { players: 1 });
  await begin(page);
  await minus(page, 'Player 1').focus();
  await page.keyboard.press('Enter');
  await expect(life(page, 0)).toHaveText('39');
  await page.keyboard.press('Shift+Enter');
  await expect(life(page, 0)).toHaveText('29');
});

test('hold changes life by ten, once, and the release does not also tap', async ({ page }) => {
  await start(page, { players: 2 });
  await begin(page);
  const btn = minus(page, 'Player 1');
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(life(page, 0)).toHaveText('30');

  const up = plus(page, 'Player 1');
  const ub = (await up.boundingBox())!;
  await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(life(page, 0)).toHaveText('40');
});

test('a press that leaves the button before the hold registers changes nothing', async ({ page }) => {
  await start(page, { players: 2 });
  await begin(page);
  const box = (await minus(page, 'Player 1').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 200);
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(life(page, 0)).toHaveText('40');
});

test('two players holding at once each change only their own total', async ({ page }) => {
  await start(page, { players: 2 });
  await begin(page);
  const a = minus(page, 'Player 1');
  const b = plus(page, 'Player 2');
  await a.dispatchEvent('pointerdown', { pointerId: 1, button: 0 });
  await b.dispatchEvent('pointerdown', { pointerId: 2, button: 0 });
  await page.waitForTimeout(700);
  await a.dispatchEvent('pointerup', { pointerId: 1, button: 0 });
  await b.dispatchEvent('pointerup', { pointerId: 2, button: 0 });
  await expect(life(page, 0)).toHaveText('30');
  await expect(life(page, 1)).toHaveText('50');
});

test.describe('seating', () => {
  const layouts: Array<[number, number[], number[]]> = [
    [1, [], [0]],
    [2, [1], [0]],
    [3, [1], [0, 2]],
    [4, [1, 2], [0, 3]],
    [5, [1, 2], [0, 4, 3]],
    [6, [1, 2, 3], [0, 5, 4]],
  ];
  for (const [n, top, bottom] of layouts) {
    test(`${n} player${n > 1 ? 's' : ''}: top row ${JSON.stringify(top)}, bottom row ${JSON.stringify(bottom)}`, async ({ page }) => {
      await start(page, { players: n });
      await begin(page);
      const seats = (row: string) => page.locator(`.table-row.${row} .tile`).evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.player)));
      expect(await seats('top')).toEqual(top);
      expect(await seats('bottom')).toEqual(bottom);
      // Top-row tiles are turned upside down for the people sitting opposite; bottom-row tiles are upright.
      const flipped = (row: string) =>
        page.locator(`.table-row.${row} .tile-inner`).evaluateAll((els) =>
          els.map((e) => {
            const m = new DOMMatrixReadOnly(getComputedStyle(e).transform);
            return m.a < -0.99 && m.d < -0.99;
          }),
        );
      expect(await flipped('top')).toEqual(top.map(() => true));
      expect(await flipped('bottom')).toEqual(bottom.map(() => false));
    });
  }
});

test('the game is saved: a reload resumes it, and leaving it keeps it', async ({ page }) => {
  await start(page, { players: 3 });
  await begin(page);
  await minus(page, 'Player 2').click();
  await plus(page, 'Player 3').click();
  await expect(life(page, 1)).toHaveText('39');

  await page.reload();
  await expect(page).toHaveURL(/#\/life\/game$/);
  await expect(life(page, 0)).toHaveText('40');
  await expect(life(page, 1)).toHaveText('39');
  await expect(life(page, 2)).toHaveText('41');

  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('link', { name: 'Leave game' }).click();
  await expect(page).toHaveURL(/#\/life$/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.getByRole('link', { name: 'Resume game' }).click();
  await expect(page).toHaveURL(/#\/life\/game$/);
  await expect(life(page, 1)).toHaveText('39');
});

test('a new game replaces the saved one only after confirming', async ({ page }) => {
  await start(page, { players: 2 });
  await begin(page);
  await minus(page, 'Player 1').click();
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('link', { name: 'Leave game' }).click();

  await page.getByRole('button', { name: 'New game' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep current game' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/#\/life$/);
  await page.getByRole('link', { name: 'Resume game' }).click();
  await expect(life(page, 0)).toHaveText('39');

  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('link', { name: 'Leave game' }).click();
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace it' }).click();
  await expect(page).toHaveURL(/#\/life\/game$/);
  await expect(life(page, 0)).toHaveText('40');
});

test('blocked or full storage: the game still works and says it will not be saved', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'swapsmith:life') throw new Error('full');
      return set.call(this, k, v);
    };
  });
  await start(page, { players: 2 });
  await begin(page);
  await minus(page, 'Player 1').click();
  await expect(life(page, 0)).toHaveText('39');
  await page.getByRole('button', { name: 'Game menu' }).click();
  await expect(page.getByRole('dialog').getByText(/won't be saved/)).toBeVisible();
});

test('a damaged saved game is set aside and the setup still opens', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('swapsmith:life')) localStorage.setItem('swapsmith:life', '{oops');
  });
  await page.goto('./#/life');
  await expect(page.getByRole('heading', { name: 'Life Counter' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Resume game' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('swapsmith:life:backup'))).toBe('{oops');
});

test('a game saved by a newer version is ignored and left untouched until a new game starts', async ({ page }) => {
  const raw = JSON.stringify({ version: 2, game: { future: true } });
  await page.addInitScript((r) => {
    if (!localStorage.getItem('swapsmith:life')) localStorage.setItem('swapsmith:life', r);
  }, raw);
  await page.goto('./#/life');
  await expect(page.getByRole('link', { name: 'Resume game' })).toHaveCount(0);
  await page.getByRole('group', { name: 'Players' }).getByRole('button', { name: '2', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('swapsmith:life'))).toBe(raw);
  await begin(page);
  await minus(page, 'Player 1').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('swapsmith:life')!).version)).toBe(1);
});

test('the setup remembers players and starting life for the next game', async ({ page }) => {
  await start(page, { players: 5, life: 20 });
  await begin(page);
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('link', { name: 'Leave game' }).click();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Players' }).getByRole('button', { name: '5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Starting life' }).getByRole('button', { name: '20', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
