import type { Page } from '@playwright/test';

/** Opens the Life Counter setup, optionally picking the player count and starting life. */
export const start = async (page: Page, opts: { players?: number; life?: number | 'custom' } = {}) => {
  await page.goto('./#/life');
  if (opts.players) await page.getByRole('group', { name: 'Players' }).getByRole('button', { name: String(opts.players), exact: true }).click();
  if (opts.life) await page.getByRole('group', { name: 'Starting life' }).getByRole('button', { name: String(opts.life === 'custom' ? 'Custom' : opts.life), exact: true }).click();
};
export const begin = (page: Page) => page.getByRole('button', { name: /^(Start game|New game)$/ }).click();
export const life = (page: Page, seat: number) => page.locator(`.tile[data-player="${seat}"] .tile-life`);
export const minus = (page: Page, name: string) => page.getByRole('button', { name: `${name}: lose 1 life` });
export const plus = (page: Page, name: string) => page.getByRole('button', { name: `${name}: gain 1 life` });
