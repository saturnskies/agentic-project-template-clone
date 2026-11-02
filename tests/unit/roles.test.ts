import { describe, expect, it } from 'vitest';
import type { ScryfallClient } from '../../src/scryfall/client';
import { ScryfallError } from '../../src/scryfall/client';
import { deckRoles } from '../../src/scryfall/roles';

describe('deckRoles', () => {
  it('keeps every query under Scryfall\'s length limit and asks about every card for every role', async () => {
    const cards = Array.from({ length: 80 }, (_, i) => ({ oracleId: `o${i}`, name: `A Fairly Long Card Name Number ${i}` }));
    const asked = new Map<string, number>();
    const client: ScryfallClient = {
      get: async (path: string) => {
        const q = new URLSearchParams(path.split('?')[1]).get('q')!;
        expect(q.length).toBeLessThanOrEqual(900);
        for (const m of q.matchAll(/!"([^"]+)"/g)) asked.set(m[1], (asked.get(m[1]) ?? 0) + 1);
        throw new ScryfallError(404, 'none');
      },
      post: async () => { throw new Error('unused'); },
    };
    const roles = await deckRoles(client, cards);
    expect(asked.size).toBe(80);
    expect([...asked.values()].every((n) => n === 4)).toBe(true); // once per role
    expect(roles.get('o0')).toEqual([]);
  });

  it('maps found cards back by Oracle ID, using the front face of double-faced names', async () => {
    const client: ScryfallClient = {
      get: async <T,>(path: string) => {
        const q = new URLSearchParams(path.split('?')[1]).get('q')!;
        expect(q).not.toContain('//');
        if (q.startsWith('otag:removal')) return { object: 'list', data: [{ oracle_id: 'o-mortify', name: 'Mortify' }, { oracle_id: 'o-dusk', name: 'Dusk // Dawn' }] } as T;
        if (q.startsWith('otag:card-advantage')) return { object: 'list', data: [{ oracle_id: 'o-dusk', name: 'Dusk // Dawn' }] } as T;
        throw new ScryfallError(404, 'none');
      },
      post: async () => { throw new Error('unused'); },
    };
    const roles = await deckRoles(client, [
      { oracleId: 'o-mortify', name: 'Mortify' },
      { oracleId: 'o-dusk', name: 'Dusk // Dawn' },
      { oracleId: 'o-sol', name: 'Sol Ring' },
    ]);
    expect(roles.get('o-mortify')).toEqual(['removal']);
    expect(roles.get('o-dusk')).toEqual(['card draw', 'removal']);
    expect(roles.get('o-sol')).toEqual([]);
  });

  it('passes on errors other than "no cards found"', async () => {
    const client: ScryfallClient = { get: async () => { throw new ScryfallError(0, 'offline'); }, post: async () => { throw new Error('unused'); } };
    await expect(deckRoles(client, [{ oracleId: 'o', name: 'X' }])).rejects.toThrow('offline');
  });
});
