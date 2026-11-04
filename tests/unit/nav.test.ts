import { describe, expect, it } from 'vitest';
import { backTarget, lifeRoute, tabOf } from '../../src/lib/nav';

describe('tabOf', () => {
  it.each([
    ['', 'decks'],
    ['#/', 'decks'],
    ['/', 'decks'],
    ['#/new', 'decks'],
    ['#/paste', 'decks'],
    ['#/deck/abc-1', 'decks'],
    ['#d=eJzLSM3JyQcABiwCFQ', 'decks'],
    ['#/browse', 'browse'],
    ['#/browse/card/xyz', 'browse'],
    ['#/life', 'life'],
    ['#/life/game', 'life'],
    ['#/life/anything', 'life'],
    ['#/lifeboat', 'decks'],
    ['#/browser', 'decks'],
  ])('%s is on the %s tab', (route, tab) => {
    expect(tabOf(route)).toBe(tab);
  });
});

describe('backTarget', () => {
  it('leaves the app only from Your decks', () => {
    expect(backTarget('')).toBeNull();
    expect(backTarget('#/')).toBeNull();
  });

  it('goes from the game to the Life Counter setup, then to Your decks', () => {
    expect(backTarget('#/life/game')).toBe('#/life');
    expect(backTarget('#/life')).toBe('#/');
  });

  it('goes from Browse and from deck screens to Your decks', () => {
    expect(backTarget('#/browse')).toBe('#/');
    expect(backTarget('#/browse/card/xyz')).toBe('#/');
    expect(backTarget('#/deck/abc')).toBe('#/');
    expect(backTarget('#/new')).toBe('#/');
    expect(backTarget('#d=abc')).toBe('#/');
  });
});

describe('lifeRoute', () => {
  it('keeps the setup route, and sends unknown sub-routes there', () => {
    expect(lifeRoute('#/life')).toBe('#/life');
    expect(lifeRoute('#/life/x')).toBe('#/life');
    expect(lifeRoute('#/life/game/extra')).toBe('#/life');
  });

  it('keeps the game route only when a game exists', () => {
    expect(lifeRoute('#/life/game', true)).toBe('#/life/game');
    expect(lifeRoute('#/life/game', false)).toBe('#/life');
    expect(lifeRoute('#/life/game')).toBe('#/life');
  });
});
