import { expect, test, type Page } from '@playwright/test';
import { BASIC_SWAMP_QUERY, COMMANDER_TYPED, SOLPHIM_TYPED } from '../support/browse-samples';
import { browseSearches, flows, mockScryfall } from './helpers';

type Rec = { data: Array<{ name: string; oracle_id: string }> };
const search = (q: string, order = 'edhrec', extra: Record<string, string> = { dir: 'asc', unique: 'cards', page: '1' }) => browseSearches[`GET /cards/search?${new URLSearchParams({ q, order, ...extra })}`].body as Rec;
const commanderSearch = (typed: string) => search(`is:commander game:paper "${typed}"`, 'edhrec', {});
const oracle = (rec: Rec, name: string) => rec.data.find((c) => c.name === name)!.oracle_id;
const SELVALA = { oracleId: oracle(commanderSearch(COMMANDER_TYPED.green), 'Selvala, Heart of the Wilds'), name: 'Selvala, Heart of the Wilds' };
const EDGAR = { oracleId: oracle(commanderSearch(COMMANDER_TYPED.black), 'Edgar Markov'), name: 'Edgar Markov' };
const CRYPT = 'legal:commander name:"crypt"';
const GHAST = oracle(search(CRYPT), 'Crypt Ghast');

const deck = (id: string, name: string, commander: { oracleId: string; name: string }, updatedAt: string, extra: object = {}) => ({ id, name, format: 'commander', commander, cards: [], updatedAt, ...extra });
const GREEN = deck('g1', 'Green deck', SELVALA, '2026-02-01T00:00:00.000Z', { summary: { total: 50, unpriced: 0, count: 40, toBuy: 30 } });
const BLACK = deck('b1', 'Black deck', EDGAR, '2026-03-01T00:00:00.000Z');

const seed = (page: Page, decks: object[]) =>
  page.addInitScript((d) => {
    if (!localStorage.getItem('swapsmith:seeded')) {
      localStorage.setItem('swapsmith:seeded', '1');
      localStorage.setItem('swapsmith:v1', JSON.stringify({ version: 1, decks: d, owned: [], unownedBasics: [], prefs: { view: 'list' } }));
    }
  }, decks);
const savedDecks = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('swapsmith:v1') ?? '{"decks":[]}').decks as Array<{ id: string; name: string; commander: { name: string }; cards: Array<{ card: { oracleId: string }; qty: number }>; summary?: unknown }>);

test.beforeEach(async ({ page }) => {
  await mockScryfall(page, { ...flows, ...browseSearches });
});

/** Opens a card's detail in Browse and the Add to deck panel inside it. */
async function openAdd(page: Page, name: string, query = 'crypt', typeFilter = '') {
  if (!page.url().includes('#/browse')) await page.goto('./#/browse');
  await page.getByLabel('Card name').fill(query);
  if (typeFilter) {
    await page.getByText('More filters', { exact: true }).click();
    await page.getByLabel('Type', { exact: true }).fill(typeFilter);
  }
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  const dialog = page.getByRole('dialog', { name });
  await dialog.getByRole('button', { name: 'Add to deck…' }).click();
  return dialog;
}
const choose = (dialog: ReturnType<Page['getByRole']>, value: string) => dialog.getByLabel('Deck', { exact: true }).selectOption(value);
const addButton = (dialog: ReturnType<Page['getByRole']>) => dialog.getByRole('button', { name: 'Add', exact: true });

test.describe('Add to an existing deck', () => {
  test('asks which deck every time, newest first, with New deck… last, and Add waits for a choice', async ({ page }) => {
    await seed(page, [GREEN, BLACK]);
    const dialog = await openAdd(page, 'Crypt Ghast');
    const select = dialog.getByLabel('Deck', { exact: true });
    await expect(select).toHaveValue('');
    expect((await select.locator('option').allTextContents()).map((t) => t.replace(/\s+/g, ' '))).toEqual(['Choose a deck…', 'Black deck (Edgar Markov)', 'Green deck (Selvala, Heart of the Wilds)', 'New deck…']);
    await expect(addButton(dialog)).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath(`add-${test.info().project.name}.png`) });
  });

  test('adds the card, stays in Browse, and Decks shows the deck as changed when you go there', async ({ page }) => {
    await seed(page, [GREEN, BLACK]);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await choose(dialog, 'b1');
    await expect(addButton(dialog)).toBeEnabled();
    await addButton(dialog).click();
    await expect(dialog.getByText('Added to Black deck.')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Open deck' })).toHaveAttribute('href', '#/deck/b1');
    await expect(page).toHaveURL(/#\/browse$/);
    const black = (await savedDecks(page)).find((d) => d.id === 'b1')!;
    expect(black.cards).toEqual([{ card: { oracleId: GHAST, name: 'Crypt Ghast' }, qty: 1 }]);
    expect((await savedDecks(page)).find((d) => d.id === 'g1')!.cards).toEqual([]);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Decks' }).click();
    // Its saved price no longer matches, so the list is honest until the deck is opened.
    await expect(page.getByRole('listitem').filter({ hasText: 'Black deck' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Black deck' })).toContainText('Not priced yet');
  });

  test('a deck priced before shows "Not priced yet" after a card is added from Browse', async ({ page }) => {
    await seed(page, [GREEN]);
    await page.goto('./');
    await expect(page.getByRole('listitem').filter({ hasText: 'Green deck' })).toContainText('$50.00');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Browse' }).click();
    const dialog = await openAdd(page, 'Crypt Ghast');
    await choose(dialog, 'g1');
    await addButton(dialog).click();
    await expect(dialog.getByText('Added to Green deck.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Decks' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Green deck' })).toContainText('Not priced yet');
    expect((await savedDecks(page)).find((d) => d.id === 'g1')!.summary).toBeUndefined();
  });

  test('does not follow the deck that is open on the Decks tab', async ({ page }) => {
    await seed(page, [GREEN, BLACK]);
    await page.goto('./#/deck/g1');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Browse' }).click();
    const dialog = await openAdd(page, 'Crypt Ghast');
    await expect(dialog.getByLabel('Deck', { exact: true })).toHaveValue('');
  });

  test('a card outside the commander\'s colors warns, and can still be added', async ({ page }) => {
    await seed(page, [GREEN, BLACK]);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await choose(dialog, 'g1');
    await expect(dialog.getByText("Crypt Ghast is outside Selvala, Heart of the Wilds's colors.")).toBeVisible();
    await expect(addButton(dialog)).toBeEnabled();
    await addButton(dialog).click();
    await expect(dialog.getByText('Added to Green deck.')).toBeVisible();
    expect((await savedDecks(page)).find((d) => d.id === 'g1')!.cards).toHaveLength(1);
  });

  test('a card in the commander\'s colors has no warning', async ({ page }) => {
    await seed(page, [GREEN, BLACK]);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await choose(dialog, 'b1');
    await expect(addButton(dialog)).toBeEnabled();
    await expect(dialog.getByText(/outside/)).toHaveCount(0);
    await expect(dialog.getByText(/Couldn't check/)).toHaveCount(0);
  });

  test('when the commander\'s colors cannot be looked up, it says so and still adds', async ({ page }) => {
    await page.route((u) => u.hostname === 'api.scryfall.com' && u.pathname === '/cards/collection', (route) => route.fulfill({ status: 503, json: { object: 'error', details: 'Service Unavailable' } }));
    await seed(page, [GREEN, BLACK]);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await choose(dialog, 'g1');
    await expect(dialog.getByText("Couldn't check Selvala, Heart of the Wilds's colors.")).toBeVisible();
    await expect(dialog.getByText(/outside/)).toHaveCount(0);
    await addButton(dialog).click();
    await expect(dialog.getByText('Added to Green deck.')).toBeVisible();
    expect((await savedDecks(page)).find((d) => d.id === 'g1')!.cards).toHaveLength(1);
  });

  test('Add waits for the colors check, and an old answer for another deck does not apply', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route((u) => u.hostname === 'api.scryfall.com' && u.pathname === '/cards/collection', async (route) => {
      if ((route.request().postData() ?? '').includes(SELVALA.oracleId)) await held;
      await route.fallback();
    });
    await seed(page, [GREEN, BLACK]);
    const dialog = await openAdd(page, 'Crypt Ghast');
    // A settled choice first, so Add is on; then one whose check is still out.
    await choose(dialog, 'b1');
    await expect(addButton(dialog)).toBeEnabled();
    await choose(dialog, 'g1');
    await expect(addButton(dialog)).toBeDisabled();
    await choose(dialog, 'b1');
    await expect(addButton(dialog)).toBeEnabled();
    release();
    await page.waitForTimeout(600);
    // The late answer for the green deck must not put its warning on the black one.
    await expect(dialog.getByText(/outside/)).toHaveCount(0);
    await expect(addButton(dialog)).toBeEnabled();
  });

  test('a second copy is refused with the reason, and the deck stays as it was', async ({ page }) => {
    await seed(page, [{ ...BLACK, cards: [{ card: { oracleId: GHAST, name: 'Crypt Ghast' }, qty: 1 }] }]);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await choose(dialog, 'b1');
    await expect(dialog.getByText('Crypt Ghast is already in this deck.', { exact: false })).toBeVisible();
    await expect(addButton(dialog)).toBeDisabled();
    await addButton(dialog).click({ force: true });
    await page.waitForTimeout(300);
    expect((await savedDecks(page))[0].cards).toEqual([{ card: { oracleId: GHAST, name: 'Crypt Ghast' }, qty: 1 }]);
  });

  test('pressing Add twice adds one card', async ({ page }) => {
    await seed(page, [BLACK]);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await choose(dialog, 'b1');
    await expect(addButton(dialog)).toBeEnabled();
    await addButton(dialog).dblclick();
    await expect(dialog.getByText('Added to Black deck.')).toBeVisible();
    await page.waitForTimeout(300);
    expect((await savedDecks(page))[0].cards).toEqual([{ card: { oracleId: GHAST, name: 'Crypt Ghast' }, qty: 1 }]);
  });

  test('a basic land can be added again after it is in the deck, one copy per press', async ({ page }) => {
    const swampId = oracle(search(BASIC_SWAMP_QUERY), 'Swamp');
    await seed(page, [{ ...BLACK, cards: [{ card: { oracleId: swampId, name: 'Swamp' }, qty: 5 }] }]);
    await page.goto('./#/browse');
    const dialog = await openAdd(page, 'Swamp', 'swamp', 'basic');
    await choose(dialog, 'b1');
    await expect(dialog.getByText(/already in this deck/)).toHaveCount(0);
    await addButton(dialog).dblclick();
    await expect(dialog.getByText('Added to Black deck.')).toBeVisible();
    await page.waitForTimeout(300);
    expect((await savedDecks(page))[0].cards).toEqual([{ card: { oracleId: swampId, name: 'Swamp' }, qty: 6 }]);
  });
});

test('a pricing run still going on the Decks tab does not overwrite a card added from Browse', async ({ page }) => {
  // The deck is opened on Decks (its pricing starts and is held), then Browse adds a card to it, then pricing finishes.
  let holding = true;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(
    (u) => u.hostname === 'api.scryfall.com' && (u.pathname === '/cards/collection' || (u.searchParams.get('q') ?? '').includes('oracleid:')),
    async (route) => {
      if (holding) await held;
      await route.fallback();
    },
  );
  await seed(page, [BLACK]);
  await page.goto('./#/deck/b1');
  await expect(page.getByLabel('Pricing progress')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Browse' }).click();
  holding = false;
  const dialog = await openAdd(page, 'Crypt Ghast');
  await choose(dialog, 'b1');
  await addButton(dialog).click();
  await expect(dialog.getByText('Added to Black deck.')).toBeVisible();
  expect((await savedDecks(page))[0].cards).toHaveLength(1);

  release();
  await page.waitForTimeout(800);
  // Pricing for the old copy of the deck finished; it must not have put that copy back.
  expect((await savedDecks(page))[0].cards).toEqual([{ card: { oracleId: GHAST, name: 'Crypt Ghast' }, qty: 1 }]);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Decks' }).click();
  await expect(page.getByRole('heading', { name: 'Black deck' })).toBeVisible();
  // Coming back redraws the deck from the store and prices it again; that must not drop the card either.
  await page.waitForTimeout(800);
  expect((await savedDecks(page))[0].cards).toHaveLength(1);
});

test.describe('New deck from Browse', () => {
  const pickCommander = async (dialog: ReturnType<Page['getByRole']>, page: Page, typed: string, option: string) => {
    await dialog.getByRole('combobox', { name: 'Commander' }).fill(typed);
    await page.getByRole('option', { name: option, exact: true }).click();
  };

  test('makes a deck with the chosen commander and the card, without leaving Browse', async ({ page }) => {
    await seed(page, [GREEN]);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await choose(dialog, '__new');
    const create = dialog.getByRole('button', { name: 'Create deck and add' });
    await expect(create).toBeDisabled();
    await dialog.getByLabel('Deck name (optional)').fill('Ghast pile');
    await pickCommander(dialog, page, COMMANDER_TYPED.black, 'Edgar Markov');
    await expect(create).toBeEnabled();
    await create.click();
    await expect(dialog.getByText('Added to Ghast pile.')).toBeVisible();
    await expect(page).toHaveURL(/#\/browse$/);
    const made = (await savedDecks(page)).find((d) => d.name === 'Ghast pile')!;
    expect(made.commander.name).toBe('Edgar Markov');
    expect(made.cards).toEqual([{ card: { oracleId: GHAST, name: 'Crypt Ghast' }, qty: 1 }]);
    const link = dialog.getByRole('link', { name: 'Open deck' });
    await expect(link).toHaveAttribute('href', `#/deck/${made.id}`);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Decks' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Ghast pile' })).toContainText('Edgar Markov');
  });

  test('says when the card is outside the new deck\'s commander colors, and still makes the deck', async ({ page }) => {
    await seed(page, []);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await pickCommander(dialog, page, COMMANDER_TYPED.green, 'Selvala, Heart of the Wilds');
    await dialog.getByRole('button', { name: 'Create deck and add' }).click();
    await expect(dialog.getByText('Added to Selvala, Heart of the Wilds deck.')).toBeVisible();
    await expect(dialog.getByText("Crypt Ghast is outside Selvala, Heart of the Wilds's colors.")).toBeVisible();
    expect((await savedDecks(page))[0].cards).toHaveLength(1);
  });

  test('a name is optional', async ({ page }) => {
    await seed(page, []);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await pickCommander(dialog, page, COMMANDER_TYPED.black, 'Edgar Markov');
    await dialog.getByRole('button', { name: 'Create deck and add' }).click();
    await expect(dialog.getByText('Added to Edgar Markov deck.')).toBeVisible();
  });

  test('with no decks yet, the choice starts on New deck…', async ({ page }) => {
    await seed(page, []);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await expect(dialog.getByLabel('Deck', { exact: true })).toHaveValue('__new');
    await expect(dialog.getByRole('combobox', { name: 'Commander' })).toBeVisible();
  });

  test('a legendary creature can be the commander of the new deck, and is not also put in the main deck', async ({ page }) => {
    await seed(page, [GREEN]);
    const dialog = await openAdd(page, 'Solphim, Mayhem Dominus', 'sol', 'legendary creature');
    await choose(dialog, '__new');
    await dialog.getByRole('button', { name: 'Use this card as commander' }).click();
    await dialog.getByRole('button', { name: 'Create deck and add' }).click();
    await expect(dialog.getByText('Added to Solphim, Mayhem Dominus deck.')).toBeVisible();
    const made = (await savedDecks(page)).find((d) => d.commander.name === 'Solphim, Mayhem Dominus')!;
    expect(made.cards).toEqual([]);
  });

  test('a card that cannot be a commander has no shortcut', async ({ page }) => {
    await seed(page, []);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await expect(dialog.getByRole('button', { name: 'Use this card as commander' })).toHaveCount(0);
  });

  test('picking the card itself as commander does not add it a second time', async ({ page }) => {
    await seed(page, []);
    const dialog = await openAdd(page, 'Solphim, Mayhem Dominus', 'sol', 'legendary creature');
    await pickCommander(dialog, page, SOLPHIM_TYPED, 'Solphim, Mayhem Dominus');
    await dialog.getByRole('button', { name: 'Create deck and add' }).click();
    await expect(dialog.getByText(/^Added to /)).toBeVisible();
    expect((await savedDecks(page))[0].cards).toEqual([]);
  });

  test('a commander search that finds nothing creates nothing', async ({ page }) => {
    await seed(page, []);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await page.route((u) => u.hostname === 'api.scryfall.com' && (u.searchParams.get('q') ?? '').includes('zzzzqq'), (route) => route.fulfill({ status: 404, json: { object: 'error', code: 'not_found', details: 'No cards found' } }));
    await dialog.getByRole('combobox', { name: 'Commander' }).fill('zzzzqq');
    await expect(dialog.getByText('No matching cards.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create deck and add' })).toBeDisabled();
    expect(await savedDecks(page)).toEqual([]);
  });

  test('pressing Create twice makes one deck', async ({ page }) => {
    await seed(page, []);
    const dialog = await openAdd(page, 'Crypt Ghast');
    await pickCommander(dialog, page, COMMANDER_TYPED.black, 'Edgar Markov');
    await dialog.getByRole('button', { name: 'Create deck and add' }).dblclick();
    await expect(dialog.getByText(/^Added to /)).toBeVisible();
    await page.waitForTimeout(300);
    expect(await savedDecks(page)).toHaveLength(1);
  });

  test('works with storage blocked: the deck exists for this visit, under the storage banner', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error('blocked');
      };
      Storage.prototype.setItem = () => {
        throw new Error('blocked');
      };
    });
    await page.goto('./#/browse');
    await expect(page.getByText(/blocking storage/)).toBeVisible();
    const dialog = await openAdd(page, 'Crypt Ghast');
    await pickCommander(dialog, page, COMMANDER_TYPED.black, 'Edgar Markov');
    await dialog.getByRole('button', { name: 'Create deck and add' }).click();
    await expect(dialog.getByText('Added to Edgar Markov deck.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Decks' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Edgar Markov deck' })).toBeVisible();
  });
});
