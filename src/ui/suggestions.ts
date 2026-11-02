import { cardImage } from '../lib/groups';
import { deckProfile, type DeckProfile } from '../lib/profile';
import { tcgplayerUrl } from '../lib/price';
import { scoreSuggestions, TIERS, upgradesByTier, type Suggestion, type Tier } from '../lib/suggest';
import type { PricedCard } from '../scryfall/resolve';
import { candidatePool } from '../scryfall/suggest';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { h, usd } from './dom';

const COLOR_NAMES: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

const textOf = (c: ScryCard | null) => (c ? (c.oracle_text ?? c.card_faces?.map((f) => f.oracle_text ?? '').join('\n') ?? '') : '');

/** Upgrade suggestions by price tier, built on demand from the deck's profile (v1 spec, "Upgrades by price tier"). */
export function suggestionsPanel(ctx: AppContext, priced: () => PricedCard[], onAdd: (card: ScryCard) => Promise<void>): HTMLElement {
  let tiers: Record<Tier, Suggestion[]> | null = null;
  let active: Tier = 'budget';

  const find = h('button', { type: 'button', class: 'button primary' }, 'Find upgrades');
  const body = h('div', { class: 'stack' });
  const panel = h(
    'aside',
    { class: 'suggestions stack', 'aria-labelledby': 'sugg-h' },
    h('h3', { id: 'sugg-h' }, 'Upgrades'),
    h('p', { class: 'muted small' }, 'Cards that fit this deck, legal in Commander and in your colors. Picked from your deck’s themes and how often Commander players use each card (EDHREC rank).'),
    find,
    body,
  );

  const profileLine = (p: DeckProfile, cardCount: number) => {
    const colors = p.colorIdentity.map((c) => COLOR_NAMES[c] ?? c).join(', ') || 'colorless';
    const parts = [`Colors: ${colors}`, p.tribe ? `Tribe: ${p.tribe}` : null, p.themes.length ? `Themes: ${p.themes.map((t) => t.label).join(', ')}` : null];
    return h(
      'div',
      { class: 'profile', 'data-testid': 'deck-profile' },
      h('p', { class: 'small' }, parts.filter(Boolean).join(' · ')),
      cardCount < 5 ? h('p', { class: 'muted small' }, 'Add a few cards to get suggestions that match your themes.') : null,
    );
  };

  const drawTiers = () => {
    if (!tiers) return;
    const tabs = h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': 'Price tier' },
      ...TIERS.map((t) => {
        const b = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(t.id === active), title: t.range }, `${t.label} (${tiers![t.id].length})`);
        b.addEventListener('click', () => {
          active = t.id;
          drawTiers();
        });
        return b;
      }),
    );
    const range = TIERS.find((t) => t.id === active)!.range;
    const list = tiers[active].length
      ? h('ul', { class: 'sugg-list', 'aria-label': `${TIERS.find((t) => t.id === active)!.label} upgrades` }, ...tiers[active].map(item))
      : h('p', { class: 'muted small' }, 'No suggestions in this price range.');
    body.querySelector('.tiers')?.remove();
    body.append(h('div', { class: 'tiers stack' }, tabs, h('p', { class: 'muted small' }, `Cards ${range}, best fit first.`), list));
  };

  const item = (s: Suggestion) => {
    const name = s.card.name;
    const thumb = cardImage(s.card, 'small');
    const add = h('button', { type: 'button', class: 'button', 'aria-label': `Add ${name}` }, 'Add');
    add.addEventListener('click', async () => {
      add.disabled = true;
      add.textContent = 'Adding…';
      try {
        await onAdd(s.card);
        add.textContent = 'Added';
      } catch {
        add.disabled = false;
        add.textContent = 'Add';
      }
    });
    return h(
      'li',
      { class: 'sugg' },
      thumb ? h('img', { src: thumb, alt: '', loading: 'lazy', width: 146, height: 204, class: 'sugg-thumb' }) : h('span', { class: 'sugg-thumb' }),
      h(
        'div',
        { class: 'sugg-body' },
        h('div', { class: 'sugg-head' }, h('a', { href: tcgplayerUrl(s.card, s.finish), target: '_blank', rel: 'noopener', class: 'sugg-name' }, name), h('span', { class: 'sugg-price' }, usd(s.price))),
        h('p', { class: 'muted small sugg-reason' }, s.reason),
        add,
      ),
    );
  };

  find.addEventListener('click', async () => {
    const cards = priced();
    const commander = cards.find((p) => p.isCommander)?.card ?? null;
    const profile = deckProfile(
      cards.map((p) => ({ name: p.entry.card.name, typeLine: p.typeLine, oracleText: textOf(p.card), isCommander: p.isCommander })),
      commander?.color_identity ?? [],
    );
    find.disabled = true;
    const status = h('p', { class: 'muted small', role: 'status' }, 'Searching Scryfall…');
    body.replaceChildren(profileLine(profile, cards.filter((p) => !p.isCommander).length), status);
    try {
      const pool = await candidatePool(ctx.client, profile, (done, total) => {
        status.textContent = `Searching Scryfall (${done} of ${total})…`;
      });
      const scored = scoreSuggestions(pool, { colorIdentity: profile.colorIdentity, oracleIds: new Set(cards.map((p) => p.entry.card.oracleId)) }, new Set(ctx.store.owned));
      tiers = upgradesByTier(scored, 10);
      status.remove();
      drawTiers();
      find.textContent = 'Refresh upgrades';
    } catch {
      status.textContent = "Couldn't reach Scryfall. Check your connection and try again.";
    } finally {
      find.disabled = false;
    }
  });

  return panel;
}
