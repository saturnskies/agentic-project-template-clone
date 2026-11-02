import { describe, expect, it } from 'vitest';
import { printingsForMany } from '../../src/scryfall/cards';
import type { ScryfallClient } from '../../src/scryfall/client';

describe('printingsForMany', () => {
  it('keeps every search under Scryfall\'s query limit and asks for each card exactly once', async () => {
    // Scryfall silently drops the end of a query longer than ~1,000 characters (checked 2026-11-02).
    const ids = Array.from({ length: 47 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const asked: string[] = [];
    const client: ScryfallClient = {
      get: async <T,>(path: string) => {
        const q = new URLSearchParams(path.split('?')[1]).get('q')!;
        expect(q.length).toBeLessThanOrEqual(900);
        asked.push(...[...q.matchAll(/oracleid:([\w-]+)/g)].map((m) => m[1]));
        return { object: 'list', has_more: false, data: [] } as T;
      },
      post: async () => { throw new Error('unused'); },
    };

    await printingsForMany(client, ids);
    expect([...asked].sort()).toEqual([...ids].sort());
  });

  it('groups returned printings by Oracle ID and follows next pages', async () => {
    const pages: Record<string, unknown> = {
      first: { object: 'list', has_more: true, next_page: 'https://api.scryfall.com/cards/search?page=2', data: [{ oracle_id: 'a', name: 'A1' }] },
      '/cards/search?page=2': { object: 'list', has_more: false, data: [{ oracle_id: 'b', name: 'B1' }, { oracle_id: 'a', name: 'A2' }] },
    };
    const client: ScryfallClient = {
      get: async <T,>(path: string) => (pages[path] ?? pages.first) as T,
      post: async () => { throw new Error('unused'); },
    };
    const out = await printingsForMany(client, ['a', 'b']);
    expect(out.get('a')!.map((c) => c.name)).toEqual(['A1', 'A2']);
    expect(out.get('b')!.map((c) => c.name)).toEqual(['B1']);
  });
});
