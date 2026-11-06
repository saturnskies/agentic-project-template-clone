import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEdhrecClient } from '../../src/edhrec/page';
import type { Deck } from '../../src/lib/deck';
import { deckProfile, type DeckProfile } from '../../src/lib/profile';
import { compare, similarTo, type Tapped } from '../../src/lib/similar';
import { scoreEdhrec, type Suggestion } from '../../src/lib/suggest';
import { isLand } from '../../src/lib/swaps';
import { createClient, memoryCache } from '../../src/scryfall/client';
import { oracleIdOf, priceDeck } from '../../src/scryfall/resolve';
import { deckRoles } from '../../src/scryfall/roles';
import { rulesText } from '../../src/scryfall/suggest';
import type { ScryCard } from '../../src/scryfall/types';
import { fixtureFetch, type FixtureMap } from '../support/fixtures';
import { pageRoles, scoredPage } from '../support/swap-pool';
import { BREYA } from '../support/swap-samples';

// What similarTo offers for real cards. Edgar Markov's page and deck were recorded 2026-11-03 (tests/fixtures/edhrec-edgar.json,
// scryfall-edgar-full.json), Breya's page 2026-11-06 (edhrec-breya.json). The constants in src/lib/similar.ts were tuned against
// these (the plan's "Tuning results"). The pools are built the way the suggestions panel builds them: the page's cards, with the
// roles of the 60 best looked up, so a card outside those has no role and only its text can tie it to the tapped card.
const read = (name: string): FixtureMap => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const clients = (map: FixtureMap) => {
  const f = fixtureFetch(map);
  const sleep = async () => {};
  return { edhrec: createEdhrecClient({ fetch: f, cache: memoryCache(), sleep }), scryfall: createClient({ fetch: f, cache: memoryCache(), sleep }) };
};
const once = <T,>(make: () => Promise<T>) => {
  let value: Promise<T> | undefined;
  return () => (value ??= make());
};

const typeLine = (c: ScryCard) => c.type_line ?? c.card_faces?.[0]?.type_line ?? '';
const text = (c: ScryCard) => c.card_faces?.[0]?.oracle_text ?? c.oracle_text ?? '';
/** An artifact that makes mana ("{T}: Add {C}", "Sacrifice an artifact: Add …"): a mana rock, not an artifact land. */
const isManaRock = (c: ScryCard) => /\bArtifact\b/.test(typeLine(c)) && !isLand(typeLine(c)) && (c.produced_mana?.length ?? 0) > 0 && /\bAdd\b/.test(text(c));
const isDualLand = (c: ScryCard) => isLand(typeLine(c)) && (c.produced_mana ?? []).filter((m) => m !== 'C').length === 2;
const names = (options: Array<{ suggestion: Suggestion }>) => options.map((o) => o.suggestion.card.name);

interface Setup {
  cards: ScryCard[];
  pool: Suggestion[];
  /** Roles of the cards a tap can start from (a deck card's roles come from the deck's own lookup). */
  roles: Map<string, string[]>;
  profile: DeckProfile;
}
const tap = (s: Setup, card: ScryCard): Tapped => ({ card, oracleId: oracleIdOf(card), roles: s.roles.get(oracleIdOf(card)) ?? [], score: 0 });
const options = (s: Setup, card: ScryCard) => similarTo(tap(s, card), s.pool, s.profile);

/** Edgar's bracket 2 page and his 100-card Vampires deck (`deck`). */
const loadEdgar = once(async (): Promise<Setup & { deck: ScryCard[] }> => {
  const { edhrec, scryfall } = clients(read('edhrec-edgar.json'));
  const replay = createClient({ fetch: fixtureFetch(read('scryfall-edgar-full.json')), cache: memoryCache(), sleep: async () => {} });
  const priced = await priceDeck(replay, JSON.parse(readFileSync(new URL('../fixtures/edgar-deck.json', import.meta.url), 'utf8')) as Deck);
  const identity = ['B', 'R', 'W'];
  const { page, poolRoles } = await scoredPage(edhrec, scryfall, { slug: 'edgar-markov', commander: 'Edgar Markov', filter: { bracket: 2, theme: null, budget: false }, colorIdentity: identity, deckIds: new Set(priced.map((p) => p.entry.card.oracleId)) });
  const own = await deckRoles(replay, priced.filter((c) => !c.isCommander).map((c) => ({ oracleId: c.entry.card.oracleId, name: c.entry.card.name })));
  const roles = new Map([...poolRoles, ...own.roles]);
  const deck = priced.flatMap((p) => (p.card ? [p.card] : []));
  return {
    deck,
    cards: [...deck, ...page.candidates.map((c) => c.card)],
    // Every page card is a candidate, the deck's own too, so it is the matching that keeps Sol Ring out of Skullclamp's list and not the deck.
    pool: scoreEdhrec(page.candidates, { colorIdentity: identity, oracleIds: new Set() }, new Set(), 'Edgar Markov', roles),
    roles,
    profile: deckProfile(priced.map((p) => ({ name: p.entry.card.name, typeLine: p.typeLine, oracleText: rulesText(p.card), isCommander: p.isCommander })), identity),
  };
});

/** Breya's page (all brackets), with no deck: every page card is a candidate and a tap can start from any of them. */
const loadBreya = once(async (): Promise<Setup> => {
  const { edhrec, scryfall } = clients(read('edhrec-breya.json'));
  const { page, scored } = await scoredPage(edhrec, scryfall, { ...BREYA, filter: { bracket: null, theme: null, budget: false } });
  return { cards: page.candidates.map((c) => c.card), pool: scored, roles: await pageRoles(scryfall, page), profile: deckProfile([], BREYA.colorIdentity) };
});

describe('Edgar Markov (100-card Vampires deck, bracket 2 page)', () => {
  it("offers Skullclamp's draw cards and artifacts, never Sol Ring", async () => {
    const edgar = await loadEdgar();
    const out = options(edgar, edgar.cards.find((c) => c.name === 'Skullclamp')!);
    expect(out.length).toBeGreaterThan(0);
    for (const o of out) {
      const draws = (edgar.roles.get(o.suggestion.oracleId) ?? []).includes('card draw');
      expect(draws || /\bArtifact\b/.test(typeLine(o.suggestion.card)), o.suggestion.card.name).toBe(true);
    }
    expect(names(out)).not.toContain('Sol Ring');
  });
});

describe('Breya, Etherium Shaper (mana rocks and dual lands)', () => {
  // Plain rocks: ramp is their only role. Mind Stone and Commander's Sphere also draw, so draw cards are fair options for them.
  const plainRocks = (s: Setup) => s.cards.filter((c) => isManaRock(c) && !/\bCreature\b/.test(typeLine(c)) && (s.roles.get(oracleIdOf(c)) ?? []).join() === 'ramp');

  it('has mana rocks and dual lands to check', async () => {
    const breya = await loadBreya();
    expect(plainRocks(breya).length).toBeGreaterThan(20);
    expect(breya.cards.filter(isDualLand).length).toBeGreaterThan(20);
  });

  it("offers a mana rock's job only to other mana rocks, and some", async () => {
    const breya = await loadBreya();
    for (const rock of plainRocks(breya)) {
      const out = options(breya, rock);
      expect(out.length, `options for ${rock.name}`).toBeGreaterThan(0);
      for (const o of out) expect(isManaRock(o.suggestion.card), `${o.suggestion.card.name} for ${rock.name}`).toBe(true);
    }
  });

  it("offers a dual land's job only to lands, and some for most of them", async () => {
    const breya = await loadBreya();
    const duals = breya.cards.filter(isDualLand);
    let withOptions = 0;
    for (const dual of duals) {
      const out = options(breya, dual);
      if (out.length) withOptions++;
      for (const o of out) expect(isLand(typeLine(o.suggestion.card)), `${o.suggestion.card.name} for ${dual.name}`).toBe(true);
    }
    // Not all: Tundra's whole text is reminder text, which matching drops.
    expect(withOptions / duals.length).toBeGreaterThan(0.8);
  });
});

describe('Breya, comparison lines from real card text', () => {
  // Scryfall's own wording: "This land enters tapped." (never the card's name), "As this land enters, you may pay 2 life. If you don't, it enters tapped."
  const real = async (name: string) => (await loadBreya()).cards.find((c) => c.name === name)!;

  it('says a tri-land that always enters tapped, against an untapped dual, enters untapped instead of tapped, and the reverse the other way', async () => {
    const [triland, untapped] = [await real('Arcane Sanctum'), await real('Caves of Koilos')];
    expect(text(triland)).toContain('This land enters tapped.');
    expect(compare(triland, untapped)).toContain('Enters untapped instead of tapped');
    expect(compare(untapped, triland)).toContain('Enters tapped instead of untapped');
    const bridge = await real('Razortide Bridge');
    expect(text(bridge)).toContain('This land enters tapped.');
    expect(compare(bridge, untapped)).toContain('Enters untapped instead of tapped');
  });

  it('claims nothing from a land that enters tapped only sometimes', async () => {
    const [triland, untapped, ...sometimes] = [await real('Arcane Sanctum'), await real('Caves of Koilos'), await real('Archway of Innovation'), await real('Steam Vents'), await real('Sea of Clouds')];
    for (const land of sometimes) {
      expect(text(land), land.name).toMatch(/enters tapped|it enters tapped/);
      for (const phrase of [...compare(land, untapped), ...compare(untapped, land), ...compare(land, triland), ...compare(triland, land)]) expect(phrase, land.name).not.toMatch(/Enters (un)?tapped/);
    }
  });
});

describe('Breya, keyword phrases from real keywords arrays', () => {
  const real = async (name: string) => (await loadBreya()).cards.find((c) => c.name === name)!;
  const keywordPhrases = (phrases: string[]) => phrases.filter((p) => /^(Gains|Loses) /.test(p));

  it('says nothing for keywords that are not abilities a creature has: Equip, Treasure, Scry, Investigate', async () => {
    const [clamp, satchel, manufactor, alibou] = [await real('Skullclamp'), await real("Detective's Satchel"), await real('Academy Manufactor'), await real('Alibou, Ancient Witness')];
    expect([clamp, satchel, manufactor, alibou].map((c) => c.keywords)).toEqual([['Equip'], ['Investigate'], ['Treasure', 'Food'], ['Scry']]);
    expect(keywordPhrases(compare(clamp, satchel))).toEqual([]);
    expect(keywordPhrases(compare(satchel, manufactor))).toEqual([]);
    expect(keywordPhrases(compare(manufactor, clamp))).toEqual([]);
    expect(keywordPhrases(compare(alibou, clamp))).toEqual([]);
  });

  it('still says a difference in a listed ability, such as Deathtouch', async () => {
    const [strix, monitor] = [await real('Baleful Strix'), await real('Thought Monitor')];
    expect([strix, monitor].map((c) => c.keywords)).toEqual([['Deathtouch', 'Flying'], ['Flying', 'Affinity']]);
    // Affinity is not on the list of abilities: only Deathtouch is stated.
    expect(keywordPhrases(compare(strix, monitor))).toEqual(['Loses deathtouch']);
    expect(keywordPhrases(compare(monitor, strix))).toEqual(['Gains deathtouch']);
  });
});

describe("Better fit counts the commander page's score, not the owned bonus", () => {
  // Scores are inclusion plus positive synergy on Breya's page; owning a card adds 0.3 to its score for ordering only (src/lib/suggest.ts).
  const pageScore = (s: Setup, name: string) => s.pool.find((x) => x.card.name === name)!.score;
  /** Breya's pool scored again with these cards owned, over the roles the unowned lookup found (owning changes which 60 cards a lookup would ask about). */
  const ownedPool = async (names: string[]) => {
    const breya = await loadBreya();
    const owned = new Set(breya.pool.filter((x) => names.includes(x.card.name)).map((x) => x.oracleId));
    const { edhrec, scryfall } = clients(read('edhrec-breya.json'));
    const { page, poolRoles } = await scoredPage(edhrec, scryfall, { ...BREYA, filter: { bracket: null, theme: null, budget: false } });
    const scored = scoreEdhrec(page.candidates, { colorIdentity: BREYA.colorIdentity, oracleIds: new Set() }, owned, BREYA.commander, poolRoles);
    return { breya, scored };
  };
  const flag = (s: Setup, pool: Suggestion[], from: string, to: string) => {
    const card = s.cards.find((c) => c.name === from)!;
    const out = similarTo({ ...tap(s, card), score: pageScore(s, from) }, pool, s.profile);
    const option = out.find((o) => o.suggestion.card.name === to);
    expect(option, `${to} as an option for ${from}`).toBeDefined();
    return option!.betterFit;
  };

  it('does not flag an owned option that scores lower on the page than the tapped card', async () => {
    const { breya, scored } = await ownedPool(['Arcane Signet']);
    expect(pageScore(breya, 'Arcane Signet')).toBeLessThan(pageScore(breya, 'Sol Ring'));
    // Owned, Arcane Signet scores 0.3 more than on the page and would clear the margin over Sol Ring.
    expect(scored.find((x) => x.card.name === 'Arcane Signet')!.score).toBeGreaterThan(pageScore(breya, 'Sol Ring') + 0.1);
    expect(flag(breya, scored, 'Sol Ring', 'Arcane Signet')).toBe(false);
  });

  it('does not flag an owned option that is only a little ahead on the page', async () => {
    const { breya, scored } = await ownedPool(['Sol Ring']);
    expect(pageScore(breya, 'Sol Ring') - pageScore(breya, 'Arcane Signet')).toBeLessThan(0.1);
    expect(flag(breya, scored, 'Arcane Signet', 'Sol Ring')).toBe(false);
  });

  it('flags a higher option by its page score, owned or not', async () => {
    const { breya, scored } = await ownedPool(['Sol Ring']);
    expect(pageScore(breya, 'Sol Ring') - pageScore(breya, "Ashnod's Altar")).toBeGreaterThanOrEqual(0.1);
    expect(flag(breya, breya.pool, "Ashnod's Altar", 'Sol Ring')).toBe(true);
    expect(flag(breya, scored, "Ashnod's Altar", 'Sol Ring')).toBe(true);
  });
});

describe('speed', () => {
  // Spec "Speed": options render in under 100 ms for a 100-card deck. One tap is similarTo (similarity and compare for every option)
  // over the pool; the pool is Breya's 295 page cards and the taps are each of Edgar's 78 different deck cards (100 with copies), with Edgar's profile (a tribe and five
  // themes to test every candidate against). The bar is generous so a slow CI machine passes; the pass takes a few milliseconds.
  it('lists the options of any card of a 100-card deck over a 290-card pool in under 100 ms', async () => {
    const [edgar, breya] = await Promise.all([loadEdgar(), loadBreya()]);
    expect(breya.pool.length).toBeGreaterThanOrEqual(290);
    expect(edgar.deck.length).toBeGreaterThan(70); // the 100 cards are 78 different ones: the basic lands repeat
    const tapAll = () => edgar.deck.map((card) => {
      const start = performance.now();
      const out = similarTo(tap(edgar, card), breya.pool, edgar.profile);
      return { ms: performance.now() - start, out };
    });
    tapAll(); // warm-up
    const runs = tapAll();
    expect(runs.some((r) => r.out.length > 0)).toBe(true);
    const slowest = runs.reduce((a, b) => (b.ms > a.ms ? b : a));
    expect(slowest.ms).toBeLessThan(100);
  });
});
