import { cardImage } from '../lib/groups';
import { deckProfile, type DeckProfile } from '../lib/profile';
import { tcgplayerUrl } from '../lib/price';
import { scoreSuggestions, TIERS, upgradesByTier, type PoolEntry, type Suggestion, type Tier } from '../lib/suggest';
import { cheaperReplacements, swapPairs } from '../lib/swaps';
import type { PricedCard } from '../scryfall/resolve';
import { deckRoles } from '../scryfall/roles';
import { candidatePool, deckCardFacts, rulesText } from '../scryfall/suggest';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { h, usd } from './dom';

const COLOR_NAMES: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

type View = 'upgrades' | 'swaps' | 'cheaper';
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'upgrades', label: 'Upgrades' },
  { id: 'swaps', label: 'Swaps' },
  { id: 'cheaper', label: 'Cheaper' },
];

export interface PanelActions {
  add(card: ScryCard): Promise<void>;
  swap(cut: PricedCard, add: ScryCard): Promise<void>;
  undo(): void;
  /** A short label for the last swap, or null when there is nothing to undo. */
  lastSwap(): string | null;
}

/**
 * Rules-based suggestions beside the deck (v1 spec, "Suggestion rules"): upgrades by price tier,
 * swap pairs, and cheaper replacements. Searching happens on demand; after that, every deck change
 * recomputes the lists locally with no new requests.
 */
export function suggestionsPanel(ctx: AppContext, priced: () => PricedCard[], actions: PanelActions): { root: HTMLElement; refresh(): void } {
  let pool: PoolEntry[] | null = null;
  /** Searches that didn't answer last time, named in a note. */
  let failedSearches: string[] = [];
  let roles = new Map<string, string[]>();
  /** The deck's own roles load after the pool; until then (or if that fails) swaps use roles seen in the pool. */
  let rolesState: 'loading' | 'ok' | 'approx' = 'loading';
  let profile: DeckProfile | null = null;
  let view: View = 'upgrades';
  let tier: Tier = 'budget';
  let swapTier: Tier | null = null;

  const find = h('button', { type: 'button', class: 'button primary' }, 'Find suggestions');
  const undoBox = h('div', { class: 'undo-box' });
  const body = h('div', { class: 'stack' });
  const root = h(
    'aside',
    { class: 'suggestions stack', 'aria-labelledby': 'sugg-h' },
    h('h3', { id: 'sugg-h' }, 'Suggestions'),
    h('p', { class: 'muted small' }, 'Cards that fit this deck, legal in Commander and in your colors. Picked from your deck’s themes and how often Commander players use each card (EDHREC rank).'),
    find,
    undoBox,
    body,
  );

  const facts = () => deckCardFacts(priced(), roles, pool ?? [], ctx.store);

  const segmented = <T extends string>(label: string, options: Array<{ id: T; label: string }>, current: T, onPick: (id: T) => void) =>
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': label },
      ...options.map((o) => {
        const b = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(o.id === current) }, o.label);
        b.addEventListener('click', () => onPick(o.id));
        return b;
      }),
    );

  const nameLink = (s: Suggestion) => h('a', { href: tcgplayerUrl(s.card, s.finish), target: '_blank', rel: 'noopener', class: 'sugg-name' }, s.card.name);
  const thumb = (s: Suggestion) => {
    const src = cardImage(s.card, 'small');
    return src ? h('img', { src, alt: '', loading: 'lazy', width: 146, height: 204, class: 'sugg-thumb' }) : h('span', { class: 'sugg-thumb' });
  };
  const busyButton = (label: string, aria: string, run: () => Promise<void>) => {
    const b = h('button', { type: 'button', class: 'button', 'aria-label': aria }, label);
    b.addEventListener('click', async () => {
      b.disabled = true;
      b.textContent = 'Working…';
      try {
        await run();
      } catch {
        b.disabled = false;
        b.textContent = label;
      }
    });
    return b;
  };

  const drawUndo = () => {
    const label = actions.lastSwap();
    if (!label) return undoBox.replaceChildren();
    const btn = h('button', { type: 'button', class: 'button' }, 'Undo');
    btn.addEventListener('click', () => actions.undo());
    undoBox.replaceChildren(h('div', { class: 'banner row-between' }, h('p', { class: 'small' }, `Swapped ${label}.`), btn));
  };

  const rolesNote = () =>
    rolesState === 'loading'
      ? h('p', { class: 'muted small', role: 'status' }, 'Checking what your cards do (ramp, card draw, removal, board wipes)…')
      : rolesState === 'approx'
        ? h('p', { class: 'notice small', role: 'status' }, "Couldn't check what every card in your deck does, so matching cards by job is approximate. Refresh suggestions to try again.")
        : null;

  const draw = () => {
    drawUndo();
    if (!pool || !profile) return;
    const deck = facts();
    const scored = scoreSuggestions(pool, { colorIdentity: profile.colorIdentity, oracleIds: new Set(deck.map((c) => c.oracleId)) }, new Set(ctx.store.owned));
    const colors = profile.colorIdentity.map((c) => COLOR_NAMES[c] ?? c).join(', ') || 'colorless';
    const line = [`Colors: ${colors}`, profile.tribe ? `Tribe: ${profile.tribe}` : null, profile.themes.length ? `Themes: ${profile.themes.map((t) => t.label).join(', ')}` : null];
    const parts: Array<HTMLElement | null> = [
      h('div', { class: 'profile', 'data-testid': 'deck-profile' }, h('p', { class: 'small' }, line.filter(Boolean).join(' · ')), deck.length < 6 ? h('p', { class: 'muted small' }, 'Add a few cards to get suggestions that match your themes.') : null),
      failedSearches.length
        ? h('p', { class: 'notice small', role: 'status' }, `Scryfall didn't answer every search (${failedSearches.join(', ')}), so some suggestions may be missing. Refresh suggestions to try again.`)
        : null,
      segmented('Suggestions', VIEWS, view, (v) => ((view = v), draw())),
    ];

    if (view === 'upgrades') {
      const tiers = upgradesByTier(scored, 10);
      const range = TIERS.find((t) => t.id === tier)!;
      parts.push(
        segmented('Price tier', TIERS.map((t) => ({ id: t.id, label: `${t.label} (${tiers[t.id].length})` })), tier, (t) => ((tier = t), draw())),
        h('p', { class: 'muted small' }, `Cards ${range.range}, best fit first.`),
        tiers[tier].length
          ? h(
              'ul',
              { class: 'sugg-list', 'aria-label': `${range.label} upgrades` },
              ...tiers[tier].map((s) =>
                h('li', { class: 'sugg' }, thumb(s), h('div', { class: 'sugg-body' }, h('div', { class: 'sugg-head' }, nameLink(s), h('span', { class: 'sugg-price' }, usd(s.price))), h('p', { class: 'muted small sugg-reason' }, s.reason), busyButton('Add', `Add ${s.card.name}`, () => actions.add(s.card)))),
              ),
            )
          : h('p', { class: 'muted small' }, 'No suggestions in this price range.'),
      );
    } else if (view === 'swaps') {
      const pairs = swapPairs(scored, deck, profile, { tier: swapTier ?? undefined });
      parts.push(
        rolesNote(),
        segmented<Tier | 'any'>('Swap price', [{ id: 'any', label: 'Any price' }, ...TIERS.map((t) => ({ id: t.id, label: t.label }))], swapTier ?? 'any', (t) => ((swapTier = t === 'any' ? null : t), draw())),
        h('p', { class: 'muted small' }, 'Each pick replaces your least-played card that does the same job, so the deck stays the same size. The commander, basic lands and cards you mark Keep are never cut.'),
        pairs.length
          ? h(
              'ul',
              { class: 'sugg-list', 'aria-label': 'Swap pairs' },
              ...pairs.map(({ add, cut, sharedRole }) => {
                const cutCard = priced().find((p) => p.entry.card.oracleId === cut.oracleId)!;
                return h(
                  'li',
                  { class: 'sugg' },
                  thumb(add),
                  h(
                    'div',
                    { class: 'sugg-body' },
                    h('p', { class: 'small swap-cut' }, 'Cut ', h('strong', {}, cut.name), cut.price != null ? ` (${usd(cut.price)})` : ''),
                    h('div', { class: 'sugg-head' }, h('span', {}, 'Add ', nameLink(add)), h('span', { class: 'sugg-price' }, usd(add.price))),
                    h('p', { class: 'muted small sugg-reason' }, [sharedRole ? `Both ${sharedRole}.` : null, add.reason].filter(Boolean).join(' ')),
                    busyButton('Swap', `Swap ${cut.name} for ${add.card.name}`, () => actions.swap(cutCard, add.card)),
                  ),
                );
              }),
            )
          : h('p', { class: 'muted small' }, 'No swaps that would improve the deck in this price range.'),
      );
    } else {
      const replacements = cheaperReplacements(deck, scored);
      parts.push(
        rolesNote(),
        h('p', { class: 'muted small' }, 'Cheaper cards that do the same job as your cards of $5 or more that you don’t own. Mark a card Keep to leave it out.'),
        replacements.length
          ? h(
              'div',
              { class: 'stack', 'aria-label': 'Cheaper replacements', role: 'group' },
              ...replacements.map(({ card, options }) => {
                const cutCard = priced().find((p) => p.entry.card.oracleId === card.oracleId)!;
                return h(
                  'section',
                  { class: 'replace-group', 'aria-label': `Cheaper than ${card.name}` },
                  h('h4', {}, `${card.name} · ${usd(card.price!)}`),
                  h(
                    'ul',
                    { class: 'sugg-list' },
                    ...options.map(({ add, saves }) =>
                      h(
                        'li',
                        { class: 'sugg' },
                        thumb(add),
                        h(
                          'div',
                          { class: 'sugg-body' },
                          h('div', { class: 'sugg-head' }, nameLink(add), h('span', { class: 'sugg-price' }, usd(add.price))),
                          h('p', { class: 'small save' }, `Save ${usd(saves)}`),
                          h('p', { class: 'muted small sugg-reason' }, add.reason),
                          busyButton('Swap', `Swap ${card.name} for ${add.card.name}`, () => actions.swap(cutCard, add.card)),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            )
          : h('p', { class: 'muted small' }, 'No cheaper replacements found for your cards of $5 or more.'),
      );
    }
    body.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  };

  find.addEventListener('click', async () => {
    const cards = priced();
    const commander = cards.find((p) => p.isCommander)?.card ?? null;
    profile = deckProfile(
      cards.map((p) => ({ name: p.entry.card.name, typeLine: p.typeLine, oracleText: rulesText(p.card), isCommander: p.isCommander })),
      commander?.color_identity ?? [],
    );
    find.disabled = true;
    const status = h('p', { class: 'muted small', role: 'status' }, 'Searching Scryfall…');
    body.replaceChildren(status);
    try {
      let done = 0;
      const tick = () => (status.textContent = `Searching Scryfall (${++done} searches done)…`);
      ({ pool, failed: failedSearches } = await candidatePool(ctx.client, profile, (n) => n && tick()));
      find.textContent = 'Refresh suggestions';
      // Upgrades show now; the deck's own roles (needed only for swaps) load afterwards, and a
      // failure there falls back to the roles the pool searches revealed.
      roles = new Map();
      rolesState = 'loading';
      draw();
      deckRoles(ctx.client, cards.filter((c) => !c.isCommander).map((c) => ({ oracleId: c.entry.card.oracleId, name: c.entry.card.name })))
        .then((r) => {
          roles = r;
          rolesState = 'ok';
        })
        .catch(() => {
          rolesState = 'approx';
        })
        .finally(draw);
    } catch {
      status.textContent = "Couldn't reach Scryfall. Check your connection and try again.";
    } finally {
      find.disabled = false;
    }
  });

  return { root, refresh: draw };
}
