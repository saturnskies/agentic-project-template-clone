import { describe, expect, it } from 'vitest';
import { ScryfallError, type ScryfallClient } from '../../src/scryfall/client';
import { gameChangerCount } from '../../src/scryfall/names';

const fake = (answer: (q: string) => unknown): ScryfallClient & { queries: string[] } => {
  const queries: string[] = [];
  return {
    queries,
    get: async <T,>(path: string) => {
      const q = new URLSearchParams(path.split('?')[1]).get('q')!;
      queries.push(q);
      return answer(q) as T;
    },
    post: async () => { throw new Error('unused'); },
  };
};
const list = (names: string[]) => ({ object: 'list', data: names.map((name) => ({ name, oracle_id: `o-${name}` })) });
const GAME_CHANGERS = ['Demonic Tutor', 'Smothering Tithe', 'The One Ring'];

describe('gameChangerCount', () => {
  it('counts the deck cards Scryfall marks as Game Changers', async () => {
    const client = fake((q) => list(GAME_CHANGERS.filter((n) => q.includes(`!"${n}"`))));
    expect(await gameChangerCount(client, ['Sol Ring', 'Demonic Tutor', 'Smothering Tithe'])).toBe(2);
    expect(client.queries[0]).toMatch(/^is:gamechanger \(!"Sol Ring" or /);
  });

  it('counts zero when Scryfall finds none (404)', async () => {
    const client = fake(() => { throw new ScryfallError(404, 'none'); });
    expect(await gameChangerCount(client, ['Sol Ring'])).toBe(0);
  });

  it('gives up (null) when any batch fails, rather than guess low', async () => {
    const names = Array.from({ length: 80 }, (_, i) => `Card Number ${i}`);
    let n = 0;
    const client = fake(() => {
      if (n++ === 1) throw new ScryfallError(0, "Couldn't reach Scryfall");
      return list([]);
    });
    expect(await gameChangerCount(client, names)).toBeNull();
    expect(n).toBeGreaterThan(1);
  });

  it('gives up (null) when every batch fails', async () => {
    const client = fake(() => { throw new ScryfallError(0, "Couldn't reach Scryfall"); });
    expect(await gameChangerCount(client, ['Sol Ring'])).toBeNull();
  });
});
