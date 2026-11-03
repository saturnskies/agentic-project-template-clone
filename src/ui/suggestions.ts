import { edhrecCandidates, type EdhrecResult } from '../edhrec/candidates';
import { pageUrl } from '../edhrec/page';
import { cardImage } from '../lib/groups';
import { deckProfile, type DeckProfile } from '../lib/profile';
import { tcgplayerUrl } from '../lib/price';
import { byCategory, scoreEdhrec, scoreSuggestions, TIERS, upgradesByTier, type PoolEntry, type Suggestion, type Tier } from '../lib/suggest';
import { cheaperReplacements, swapPairs } from '../lib/swaps';
import { frontFace } from '../scryfall/cards';
import type { PricedCard } from '../scryfall/resolve';
import { deckRoles } from '../scryfall/roles';
import { candidatePool, deckCardFacts, rulesText } from '../scryfall/suggest';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { h, usd } from './dom';

/** Cards shown per category before Show more, and how many more each click adds. */
const CATEGORY_STEP = 5;

type EdhState = { status: 'loading' } | EdhrecResult | { status: 'lookup-failed' };

const COLOR_NAMES: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

type View = 'upgrades' | 'swaps' | 'cheaper';
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'upgrades', label: 'Upgrades' },
  { id: 'swaps', label: 'Swaps' },
  { id: 'cheaper', label: 'Cheaper' },
];

export interface PanelActions {
  add(card: ScryCard): Promise<void>;
  /** Replaces the deck card with this Oracle ID by the suggested card. */
  swap(cutOracleId: string, add: ScryCard): Promise<void>;
  undo(): void;
  /** A short label for the last swap, or null when there is nothing to undo. */
  lastSwap(): string | null;
}

/**
 * Suggestions beside the deck: upgrades from what decks with this commander play on EDHREC, grouped
 * by category (recommendations spec), with v1's rules-based price tiers when EDHREC has nothing; and
 * v1's swap pairs and cheaper replacements. Searching happens on demand; after that, every deck
 * change recomputes the lists locally with no new requests.
 */
export function suggestionsPanel(ctx: AppContext, priced: () => PricedCard[], actions: PanelActions): { root: HTMLElement; refresh(): void } {
  let pool: PoolEntry[] | null = null;
  /** Set when every pool search failed. */
  let poolError = false;
  let edh: EdhState | null = null;
  let commanderName = '';
  /** How many cards each Upgrades category shows; Show more raises it. */
  const shown = new Map<string, number>();
  /** Searches that didn't answer last time, named in a note. */
  let failedSearches: string[] = [];
  let roles = new Map<string, string[]>();
  /** The deck's own roles load after the pool; until then (or if that fails) swaps use roles seen in the pool. */
  let rolesState: 'loading' | 'ok' | 'approx' = 'loading';
  /** Each Find bumps this; replies from an earlier Find are ignored. */
  let run = 0;
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
    h('p', { class: 'muted small' }, 'Cards that fit this deck, legal in Commander and in your colors. Picked from what other decks with your commander play on EDHREC, or from your deck’s themes when EDHREC has no data.'),
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
    const err = h('span', { class: 'muted small', role: 'status' });
    b.addEventListener('click', async () => {
      b.disabled = true;
      b.textContent = 'Working…';
      err.textContent = '';
      try {
        await run();
      } catch {
        err.textContent = "Couldn't reach Scryfall. Try again.";
      } finally {
        // Usually the list redraws first; if not (a failure), the button is usable again.
        b.disabled = false;
        b.textContent = label;
      }
    });
    return h('span', { class: 'actions' }, b, err);
  };

  const suggItem = (s: Suggestion) =>
    h('li', { class: 'sugg' }, thumb(s), h('div', { class: 'sugg-body' }, h('div', { class: 'sugg-head' }, nameLink(s), h('span', { class: 'sugg-price' }, usd(s.price))), h('p', { class: 'muted small sugg-reason' }, s.reason), busyButton('Add', `Add ${s.card.name}`, () => actions.add(s.card))));

  /** Progress of the rules-based searches, updated in place so it doesn't redraw the panel. */
  const poolStatus = h('p', { class: 'muted small', role: 'status' }, 'Searching Scryfall…');
  const poolPending = () => (poolError ? h('p', { class: 'notice small', role: 'status' }, "Couldn't reach Scryfall. Check your connection and try again.") : poolStatus);

  const fallbackNote = (state: EdhState | null) =>
    !state || state.status === 'ok' || state.status === 'loading'
      ? null
      : h(
          'p',
          { class: 'notice small', role: 'status' },
          state.status === 'missing'
            ? `EDHREC has no decks for ${commanderName}, so these come from card rules, not real decks.`
            : state.status === 'failed'
              ? "EDHREC didn't answer, so these come from card rules, not real decks. Refresh suggestions to try again."
              : "Couldn't look up EDHREC's cards on Scryfall, so these come from card rules. Refresh suggestions to try again.",
        );

  const edhrecUpgrades = (res: Extract<EdhState, { status: 'ok' }>, oracleIds: Set<string>): HTMLElement[] => {
    const scored = scoreEdhrec(res.candidates, { colorIdentity: profile!.colorIdentity, oracleIds }, new Set(ctx.store.owned), commanderName);
    const groups = byCategory(scored);
    const out: HTMLElement[] = [
      h(
        'p',
        { class: 'small', 'data-testid': 'edhrec-source' },
        'From ',
        h('a', { href: pageUrl(res.path), target: '_blank', rel: 'noopener' }, `${res.page.numDecks.toLocaleString('en-US')} ${commanderName} decks on EDHREC`),
        ', best fit first.',
      ),
    ];
    if (res.failedLookups) out.push(h('p', { class: 'notice small', role: 'status' }, "Scryfall didn't answer every lookup, so some cards may be missing. Refresh suggestions to try again."));
    if (!groups.length) out.push(h('p', { class: 'muted small' }, 'Your deck already runs every card EDHREC lists for this commander.'));
    for (const { category, items } of groups) {
      const limit = shown.get(category) ?? CATEGORY_STEP;
      const more = h('button', { type: 'button', class: 'button', 'aria-label': `Show more ${category}` }, 'Show more');
      more.addEventListener('click', () => (shown.set(category, limit + CATEGORY_STEP), draw()));
      out.push(
        h(
          'section',
          { class: 'sugg-group stack', 'aria-label': category },
          h('h4', {}, `${category} (${items.length})`),
          h('ul', { class: 'sugg-list', 'aria-label': `${category} upgrades` }, ...items.slice(0, limit).map(suggItem)),
          items.length > limit ? more : null,
        ),
      );
    }
    return out;
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
    if (!profile) return;
    const deck = facts();
    const oracleIds = new Set(deck.map((c) => c.oracleId));
    const scored = pool ? scoreSuggestions(pool, { colorIdentity: profile.colorIdentity, oracleIds }, new Set(ctx.store.owned)) : [];
    const colors = profile.colorIdentity.map((c) => COLOR_NAMES[c] ?? c).join(', ') || 'colorless';
    const line = [`Colors: ${colors}`, profile.tribe ? `Tribe: ${profile.tribe}` : null, profile.themes.length ? `Themes: ${profile.themes.map((t) => t.label).join(', ')}` : null];
    const parts: Array<HTMLElement | null> = [
      h('div', { class: 'profile', 'data-testid': 'deck-profile' }, h('p', { class: 'small' }, line.filter(Boolean).join(' · ')), deck.length < 6 ? h('p', { class: 'muted small' }, 'Add a few cards to get suggestions that match your themes.') : null),
      failedSearches.length
        ? h('p', { class: 'notice small', role: 'status' }, `Scryfall didn't answer every search (${failedSearches.join(', ')}), so some suggestions may be missing. Refresh suggestions to try again.`)
        : null,
      segmented('Suggestions', VIEWS, view, (v) => ((view = v), draw())),
    ];

    if (view === 'upgrades' && edh?.status === 'ok') {
      parts.push(...edhrecUpgrades(edh, oracleIds));
    } else if (view === 'upgrades' && edh?.status === 'loading') {
      parts.push(h('p', { class: 'muted small', role: 'status' }, `Loading what ${commanderName} decks play on EDHREC…`));
    } else if (!pool) {
      parts.push(fallbackNote(edh), poolPending());
    } else if (view === 'upgrades') {
      parts.push(fallbackNote(edh));
      const tiers = upgradesByTier(scored, 10);
      const range = TIERS.find((t) => t.id === tier)!;
      parts.push(
        segmented('Price tier', TIERS.map((t) => ({ id: t.id, label: `${t.label} (${tiers[t.id].length})` })), tier, (t) => ((tier = t), draw())),
        h('p', { class: 'muted small' }, `Cards ${range.range}, best fit first.`),
        tiers[tier].length
          ? h('ul', { class: 'sugg-list', 'aria-label': `${range.label} upgrades` }, ...tiers[tier].map(suggItem))
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
                    busyButton('Swap', `Swap ${cut.name} for ${add.card.name}`, () => actions.swap(cut.oracleId, add.card)),
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
                          busyButton('Swap', `Swap ${card.name} for ${add.card.name}`, () => actions.swap(card.oracleId, add.card)),
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
    const mine = ++run;
    const cards = priced();
    const commanderLine = cards.find((p) => p.isCommander);
    const commander = commanderLine?.card ?? null;
    commanderName = frontFace(commander?.name ?? commanderLine?.entry.card.name ?? '');
    profile = deckProfile(
      cards.map((p) => ({ name: p.entry.card.name, typeLine: p.typeLine, oracleText: rulesText(p.card), isCommander: p.isCommander })),
      commander?.color_identity ?? [],
    );
    pool = null;
    poolError = false;
    failedSearches = [];
    roles = new Map();
    rolesState = 'loading';
    edh = commanderName ? { status: 'loading' } : { status: 'failed' };
    shown.clear();
    poolStatus.textContent = 'Searching Scryfall…';
    find.disabled = true;
    draw();

    // What decks with this commander play (EDHREC), and v1's rules-based pool, which the price tiers
    // fall back to and swaps and cheaper replacements still use. Each draws when it arrives.
    const fromEdhrec = !commanderName
      ? Promise.resolve()
      : edhrecCandidates(ctx.edhrec, ctx.client, [commanderName], profile.colorIdentity)
          .then((r) => void (mine === run && ((edh = r), draw())))
          .catch(() => void (mine === run && ((edh = { status: 'lookup-failed' }), draw())));
    let done = 0;
    const tick = () => (poolStatus.textContent = `Searching Scryfall (${++done} searches done)…`);
    const fromRules = candidatePool(ctx.client, profile, (n) => n && tick())
      .then((result) => {
        if (mine !== run) return;
        ({ pool, failed: failedSearches } = result);
        draw();
        // The deck's own roles (needed only for swaps) load afterwards; a failure there falls back
        // to the roles the pool searches revealed.
        deckRoles(ctx.client, cards.filter((c) => !c.isCommander).map((c) => ({ oracleId: c.entry.card.oracleId, name: c.entry.card.name })))
          .then(({ roles: r, complete }) => {
            if (mine !== run) return;
            roles = r;
            rolesState = complete ? 'ok' : 'approx';
            draw();
          })
          .catch(() => {
            if (mine !== run) return;
            rolesState = 'approx';
            draw();
          });
      })
      .catch(() => void (mine === run && ((poolError = true), draw())));
    await Promise.all([fromEdhrec, fromRules]);
    if (mine === run) {
      find.disabled = false;
      find.textContent = 'Refresh suggestions';
    }
  });

  return { root, refresh: draw };
}
