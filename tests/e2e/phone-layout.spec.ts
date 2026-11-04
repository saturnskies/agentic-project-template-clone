import { expect, test, type Locator, type Page } from '@playwright/test';
import { composite, contrastRatio, effectiveBackground, parseColor } from '../support/contrast';
import { edgarFull, mockScryfall, seedEdgarDeck } from './helpers';

// Phone layout fixes (docs/superpowers/plans/2026-11-04-phone-layout.md). These check what the page
// really renders, in both colour schemes. They never assert prices: re-recording fixtures moves them.

test.skip(({ isMobile }) => !isMobile, 'phone layout checks run on the phone project only');

interface Sample {
  color: string;
  outlineColor: string;
  outlineStyle: string;
  borderColor: string;
  opacity: string;
  bgs: string[];
  parentBgs: string[];
}

/** The computed colours of an element and the backgrounds behind it, nearest first. */
const sample = (loc: Locator): Promise<Sample> =>
  loc.evaluate((el) => {
    const chain = (start: Element | null) => {
      const out: string[] = [];
      for (let n = start; n; n = n.parentElement) out.push(getComputedStyle(n).backgroundColor);
      return out;
    };
    const cs = getComputedStyle(el);
    return { color: cs.color, outlineColor: cs.outlineColor, outlineStyle: cs.outlineStyle, borderColor: cs.borderTopColor, opacity: cs.opacity, bgs: chain(el), parentBgs: chain(el.parentElement) };
  });

const ratio = (fg: string, bgs: string[]) => contrastRatio(parseColor(fg), effectiveBackground(bgs));

/** Text contrast as seen, with the element's own `opacity` mixed in: dimming a whole control dims its label too. */
function seenRatio(s: Sample): number {
  const op = Number(s.opacity);
  const base = effectiveBackground(s.parentBgs);
  const own = parseColor(s.bgs[0]);
  const fg = parseColor(s.color);
  const seenBg = composite({ ...own, a: own.a * op }, base);
  const seenFg = composite({ ...fg, a: fg.a * op }, base);
  return contrastRatio(seenFg, seenBg);
}

async function openDeck(page: Page) {
  await mockScryfall(page, edgarFull);
  const deck = await seedEdgarDeck(page);
  await page.goto(`./#/deck/${deck.id}`);
  await expect(page.getByTestId('deck-total')).toHaveText(/\$/);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test('links and the logo name are readable', async ({ page }) => {
      await openDeck(page);
      const back = await sample(page.getByRole('link', { name: '← Your decks' }));
      expect(ratio(back.color, back.bgs), 'text link').toBeGreaterThanOrEqual(4.5);
      const logo = await sample(page.getByRole('heading', { level: 1 }).locator('span'));
      expect(ratio(logo.color, logo.bgs), 'logo, large text').toBeGreaterThanOrEqual(3);
    });

    test('a pressed Keep chip is readable', async ({ page }) => {
      await openDeck(page);
      const keep = page.getByRole('button', { name: /^Keep / }).first();
      await keep.click();
      const pressed = page.locator('.keep-toggle[aria-pressed="true"]').first();
      await expect(pressed).toBeVisible();
      const s = await sample(pressed);
      expect(ratio(s.color, s.bgs)).toBeGreaterThanOrEqual(4.5);
    });

    test('"Save $x" on a cheaper replacement is readable', async ({ page }) => {
      await openDeck(page);
      await page.getByRole('button', { name: 'Find suggestions' }).click();
      const panel = page.getByRole('complementary', { name: 'Suggestions' });
      await panel.getByRole('button', { name: 'Cheaper' }).click();
      const save = panel.locator('.save').first();
      await expect(save).toContainText('Save $');
      const s = await sample(save);
      expect(ratio(s.color, s.bgs)).toBeGreaterThanOrEqual(4.5);
    });

    test('the keyboard focus ring is visible on links, buttons and fields', async ({ page }) => {
      await openDeck(page);
      await page.keyboard.press('Tab'); // so focus counts as keyboard focus (:focus-visible)
      const targets = [page.getByRole('link', { name: '← Your decks' }), page.getByRole('button', { name: 'Rename' }), page.getByRole('combobox', { name: 'Add a card' })];
      for (const target of targets) {
        await target.focus();
        const s = await sample(target);
        expect(s.outlineStyle).not.toBe('none');
        expect(ratio(s.outlineColor, s.parentBgs), 'focus ring').toBeGreaterThanOrEqual(3);
      }
    });

    test('a text field has a border you can see against both the field and the page', async ({ page }) => {
      await openDeck(page);
      const s = await sample(page.getByRole('combobox', { name: 'Add a card' }));
      expect(ratio(s.borderColor, s.bgs), 'against the field').toBeGreaterThanOrEqual(3);
      expect(ratio(s.borderColor, s.parentBgs), 'against the page').toBeGreaterThanOrEqual(3);
    });

    test('a disabled primary button keeps a readable label and is not just dimmed', async ({ page }) => {
      await page.goto('./#/new');
      const create = page.getByRole('button', { name: 'Create deck' });
      await expect(create).toBeDisabled();
      const s = await sample(create);
      expect(seenRatio(s), 'label as seen').toBeGreaterThanOrEqual(4.5);
      expect(s.opacity, 'a disabled control is restyled, not faded').toBe('1');
    });

    test('the paste box and its focus ring are visible', async ({ page }) => {
      await page.goto('./#/paste');
      const box = page.getByLabel('Decklist');
      const s = await sample(box);
      expect(ratio(s.borderColor, s.bgs), 'textarea border').toBeGreaterThanOrEqual(3);
      await page.keyboard.press('Tab');
      await box.focus();
      const f = await sample(box);
      expect(f.outlineStyle).not.toBe('none');
      expect(ratio(f.outlineColor, f.parentBgs), 'textarea focus ring').toBeGreaterThanOrEqual(3);
    });
  });
}

test('Home shows no empty alert box until there is a message to show', async ({ page }) => {
  await seedEdgarDeck(page);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Back up my decks' })).toBeVisible();
  // Empty message elements must take no space: an empty bordered box reads as a broken control.
  const empties = await page.locator('.notice').evaluateAll((els) => els.filter((e) => !e.textContent?.trim() && getComputedStyle(e).display !== 'none').length);
  expect(empties).toBe(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the browser bar colour follows the colour scheme', async ({ page }) => {
  await page.goto('./');
  const metas = await page.locator('meta[name="theme-color"]').evaluateAll((els) => els.map((e) => ({ content: e.getAttribute('content'), media: e.getAttribute('media') })));
  const find = (scheme: string) => metas.find((m) => m.media === `(prefers-color-scheme: ${scheme})`);
  expect(find('light')?.content).toBe('#ffffff');
  expect(find('dark')?.content).toBe('#242424');
});
