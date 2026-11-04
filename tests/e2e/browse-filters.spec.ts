import { expect, test, type Page } from '@playwright/test';
import { SAMPLES } from '../support/browse-samples';
import { browseSearches, mockScryfall } from './helpers';

const CRYPT = 'legal:commander name:"crypt"';
type Card = { name: string; mana_cost?: string; type_line?: string; rarity?: string; oracle_id: string };
const reply = (q: string) => browseSearches[`GET /cards/search?${new URLSearchParams({ q, order: 'edhrec', dir: 'asc', unique: 'cards', page: '1' })}`];
const cardsFor = (q: string) => ((reply(q).body as { data?: Card[] }).data ?? []);

let misses: string[];
let searches: string[];

test.beforeEach(async ({ page }) => {
  misses = await mockScryfall(page, browseSearches);
  searches = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname === 'api.scryfall.com' && u.pathname === '/cards/search') searches.push(u.searchParams.get('q') ?? '');
  });
});

const exact = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const openFilters = (page: Page) => page.getByText('More filters', { exact: true }).click();
const searchButton = (page: Page) => page.getByRole('button', { name: 'Search', exact: true }).click();
const alert = (page: Page) => page.getByRole('alert');

/** How a person fills each sample in the form. */
const fill: Record<string, (page: Page) => Promise<unknown>> = {
  set: (p) => exact(p, 'Set code').fill('rtr'),
  type: (p) => exact(p, 'Type').fill('legendary creature'),
  tribe: (p) => exact(p, 'Tribe (creature type)').fill('elemental'),
  keyword: (p) => exact(p, 'Keyword').fill('flying'),
  'keyword-two-words': (p) => exact(p, 'Keyword').fill('first strike'),
  role: (p) => exact(p, 'Role').selectOption({ label: 'Ramp' }),
  tokens: (p) => exact(p, 'Role').selectOption({ label: 'Token maker' }),
  'colors-within': (p) => exact(p, 'Black').check(),
  colorless: (p) => exact(p, 'Colorless').check(),
  'colors-includes': async (p) => {
    await exact(p, 'Red').check();
    await exact(p, 'Black').check();
    await p.getByRole('button', { name: 'Includes', exact: true }).click();
  },
  'mana-value': async (p) => {
    await exact(p, 'Mana value min').fill('3');
    await exact(p, 'Mana value max').fill('4');
  },
  rarity: async (p) => {
    await exact(p, 'Rare').check();
    await exact(p, 'Mythic').check();
  },
  price: async (p) => {
    await exact(p, 'Price min (USD)').fill('1');
    await exact(p, 'Price max (USD)').fill('5');
  },
};

test.describe('every filter reaches Scryfall', () => {
  for (const sample of SAMPLES) {
    test(`${sample.id}`, async ({ page }) => {
      await page.goto('./#/browse');
      await openFilters(page);
      await fill[sample.id](page);
      await page.getByLabel('Card name').fill(sample.filters.name ?? '');
      await searchButton(page);
      await expect(page.getByTestId('query')).toHaveText(sample.q);
      const want = cardsFor(sample.q);
      expect(want.length).toBeGreaterThan(0);
      await expect(page.locator('.card-tile')).toHaveCount(want.length);
      expect(await page.locator('.card-tile-name').allTextContents()).toEqual(want.map((c) => c.name));
      expect(searches).toEqual([sample.q]);
      expect(misses).toEqual([]);
    });
  }
});

test('colorless and the colors exclude each other', async ({ page }) => {
  await page.goto('./#/browse');
  await openFilters(page);
  await exact(page, 'Red').check();
  await exact(page, 'Green').check();
  await exact(page, 'Colorless').check();
  await expect(exact(page, 'Red')).not.toBeChecked();
  await expect(exact(page, 'Green')).not.toBeChecked();
  await exact(page, 'White').check();
  await expect(exact(page, 'Colorless')).not.toBeChecked();
  await expect(exact(page, 'White')).toBeChecked();
});

test.describe('bad input stops the search and says where', () => {
  const cases: Array<[string, string, string, RegExp]> = [
    ['Set code', 'toolong7', 'set', /set code/i],
    ['Type', 'a:b', 'type', /type words/i],
    ['Tribe (creature type)', 'elf or goblin', 'tribe', /creature type/i],
    ['Keyword', 'fly1', 'keyword', /keyword/i],
    ['Mana value min', 'abc', 'mv', /whole number/i],
    ['Mana value max', '100', 'mv', /0 to 99/i],
    ['Price min (USD)', '1.234', 'price', /two decimals/i],
    ['Price max (USD)', '$5', 'price', /two decimals/i],
  ];
  for (const [label, value, , message] of cases) {
    test(`${label}: ${value}`, async ({ page }) => {
      await page.goto('./#/browse');
      await openFilters(page);
      await exact(page, label).fill(value);
      // Close the filters first: the error must bring them back.
      await page.getByText('More filters', { exact: true }).click();
      await page.getByLabel('Card name').press('Enter');
      await expect(alert(page)).toContainText(message);
      await expect(exact(page, label)).toBeVisible();
      await page.waitForTimeout(800);
      expect(searches).toEqual([]);
    });
  }

  test('a minimum above the maximum, for mana value and for price', async ({ page }) => {
    await page.goto('./#/browse');
    await openFilters(page);
    await exact(page, 'Mana value min').fill('5');
    await exact(page, 'Mana value max').fill('4');
    await searchButton(page);
    await expect(alert(page)).toContainText('minimum is above the maximum');
    await exact(page, 'Mana value min').fill('');
    await exact(page, 'Mana value max').fill('');
    await exact(page, 'Price min (USD)').fill('5.01');
    await exact(page, 'Price max (USD)').fill('5');
    await searchButton(page);
    await expect(alert(page)).toContainText('minimum is above the maximum');
    await page.waitForTimeout(800);
    expect(searches).toEqual([]);
  });

  test('filters and the advanced box together over the limit send nothing', async ({ page }) => {
    await page.goto('./#/browse');
    await openFilters(page);
    await exact(page, 'Type').fill(Array(110).fill('artifact').join(' '));
    await page.getByLabel('Advanced search').fill('t:elf');
    await searchButton(page);
    await expect(alert(page)).toContainText('too long');
    await page.waitForTimeout(800);
    expect(searches).toEqual([]);
  });

  test('fixing the input clears the message and searches', async ({ page }) => {
    await page.goto('./#/browse');
    await openFilters(page);
    await exact(page, 'Set code').fill('toolong7');
    await searchButton(page);
    await expect(alert(page)).toBeVisible();
    await exact(page, 'Set code').fill('rtr');
    await page.getByLabel('Card name').fill('crypt');
    await searchButton(page);
    await expect(alert(page)).toBeHidden();
    await expect(page.getByTestId('query')).toHaveText(`${CRYPT} set:rtr`);
  });
});

test('the price filter says it leaves out cards with no USD price', async ({ page }) => {
  await page.goto('./#/browse');
  await openFilters(page);
  await expect(page.getByText(/no USD price are left out/i)).toBeVisible();
});

test('Reset filters clears the filters but keeps the view, sort and Commander-legal choice', async ({ page }) => {
  await page.goto('./#/browse');
  await page.getByLabel('Commander-legal').uncheck();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByLabel('Sort by').selectOption('name');
  await openFilters(page);
  await page.getByLabel('Card name').fill('crypt');
  await exact(page, 'Set code').fill('rtr');
  await exact(page, 'Black').check();
  await page.getByLabel('Advanced search').fill('t:land');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByLabel('Card name')).toHaveValue('');
  await expect(exact(page, 'Set code')).toHaveValue('');
  await expect(exact(page, 'Black')).not.toBeChecked();
  await expect(page.getByLabel('Advanced search')).toHaveValue('');
  await expect(page.getByLabel('Commander-legal')).not.toBeChecked();
  await expect(page.getByLabel('Sort by')).toHaveValue('name');
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test.describe('list view', () => {
  test('shows each card as a row with its mana cost, type line, rarity and price', async ({ page }) => {
    await page.goto('./#/browse');
    await page.getByLabel('Card name').fill('crypt');
    await searchButton(page);
    await expect(page.locator('.card-tile')).toHaveCount(49);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    const cards = cardsFor(CRYPT);
    await expect(page.locator('.card-row')).toHaveCount(49);
    await expect(page.locator('.card-tile')).toHaveCount(0);
    expect(await page.locator('.card-row-name').allTextContents()).toEqual(cards.map((c) => c.name));
    // A spell has a mana cost; check its whole row against the recorded card.
    const i = cards.findIndex((c) => c.mana_cost);
    const spell = cards[i];
    const row = page.locator('.card-row').nth(i);
    await expect(row).toContainText(spell.name);
    await expect(row).toContainText(spell.mana_cost!);
    await expect(row).toContainText(spell.type_line!);
    await expect(row).toContainText(spell.rarity![0].toUpperCase() + spell.rarity!.slice(1));
    await expect(row.locator('.card-row-price')).toHaveText(/^(\$\d|No price)/);
    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await expect(page.locator('.card-tile')).toHaveCount(49);
  });

  test('Load more keeps the view it is in', async ({ page }) => {
    await page.goto('./#/browse');
    await page.getByLabel('Card name').fill('sol');
    await searchButton(page);
    await expect(page.locator('.card-tile')).toHaveCount(175);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(page.locator('.card-row')).toHaveCount(187);
    await expect(page.locator('.card-tile')).toHaveCount(0);
  });

  test('the owned badge shows in rows too', async ({ page }) => {
    const first = cardsFor(CRYPT)[0];
    await page.addInitScript((id) => localStorage.setItem('swapsmith:v1', JSON.stringify({ version: 1, decks: [], owned: [id], unownedBasics: [], prefs: { view: 'list' } })), first.oracle_id);
    await page.goto('./#/browse');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.getByLabel('Card name').fill('crypt');
    await searchButton(page);
    await expect(page.locator('.card-row').first().getByText('Owned')).toBeVisible();
    await expect(page.locator('.card-row').nth(1).getByText('Owned')).toHaveCount(0);
  });
});

test.describe('saved preferences', () => {
  const V1 = JSON.stringify({ version: 1, decks: [], owned: ['keep-me'], unownedBasics: [], prefs: { view: 'list' } });
  const seed = (page: Page, extra: Record<string, string> = {}) =>
    page.addInitScript(([v1, more]) => {
      if (localStorage.getItem('swapsmith:seeded')) return;
      localStorage.setItem('swapsmith:seeded', '1');
      localStorage.setItem('swapsmith:v1', v1);
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
    }, [V1, extra] as const);
  const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

  test('view, sort, direction and Commander-legal survive a reload, in their own key, with nothing fetched', async ({ page }) => {
    await seed(page);
    await page.goto('./#/browse');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.getByLabel('Sort by').selectOption('price');
    await page.getByRole('button', { name: 'Ascending', exact: true }).click();
    await page.getByLabel('Commander-legal').uncheck();
    expect(JSON.parse((await stored(page, 'swapsmith:browse'))!)).toEqual({ version: 1, view: 'list', sort: 'price', descending: false, commanderLegal: false });
    expect(await stored(page, 'swapsmith:v1')).toBe(V1);

    await page.reload();
    await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Sort by')).toHaveValue('price');
    await expect(page.getByRole('button', { name: 'Ascending', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Commander-legal')).not.toBeChecked();
    await page.waitForTimeout(800);
    expect(searches).toEqual([]);
    expect(await stored(page, 'swapsmith:v1')).toBe(V1);
  });

  test('unreadable saved preferences give the defaults, and the app works', async ({ page }) => {
    await seed(page, { 'swapsmith:browse': '{oops' });
    await page.goto('./#/browse');
    await expect(page.getByLabel('Sort by')).toHaveValue('popularity');
    await expect(page.getByLabel('Commander-legal')).toBeChecked();
    await expect(page.getByRole('button', { name: 'Grid', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Card name').fill('crypt');
    await searchButton(page);
    await expect(page.locator('.card-tile')).toHaveCount(49);
    expect(await stored(page, 'swapsmith:v1')).toBe(V1);
  });

  test('a save from a newer version is left alone', async ({ page }) => {
    const future = JSON.stringify({ version: 2, view: 'list', anything: true });
    await seed(page, { 'swapsmith:browse': future });
    await page.goto('./#/browse');
    await expect(page.getByRole('button', { name: 'Grid', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.getByLabel('Sort by').selectOption('name');
    await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await stored(page, 'swapsmith:browse')).toBe(future);
  });

  test('blocked or full storage: the choices still work, they are just not kept', async ({ page }) => {
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === 'swapsmith:browse') throw new Error('full');
        return set.call(this, k, v);
      };
    });
    await page.goto('./#/browse');
    await page.getByLabel('Card name').fill('crypt');
    await searchButton(page);
    await expect(page.locator('.card-tile')).toHaveCount(49);
    // Each choice still takes effect, including the new search a sort change starts.
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.locator('.card-row')).toHaveCount(49);
    await page.getByLabel('Sort by').selectOption('name');
    const byName = (browseSearches[`GET /cards/search?${new URLSearchParams({ q: CRYPT, order: 'name', dir: 'asc', unique: 'cards', page: '1' })}`].body as { data: Card[] }).data;
    await expect.poll(async () => (await page.locator('.card-row-name').allTextContents())[0]).toBe(byName[0].name);
    expect(await stored(page, 'swapsmith:browse')).toBeNull();
  });
});

test('the filters fit a phone, open and closed', async ({ page }) => {
  await page.goto('./#/browse');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await openFilters(page);
  await expect(exact(page, 'Price max (USD)')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath(`filters-${test.info().project.name}.png`), fullPage: true });
});
