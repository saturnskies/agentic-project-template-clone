import { parseDeckList, type ParsedLine } from '../lib/parse';
import { fuzzyCard } from '../scryfall/cards';
import { buildDeck, commanderCandidates, oracleIdOf, resolveList } from '../scryfall/resolve';
import type { ScryCard } from '../scryfall/types';
import type { AppContext } from './app';
import { h } from './dom';

type Line = { entry: ParsedLine; card: ScryCard | null; suggestion: ScryCard | null; aliasOf?: string; removed: boolean };

const SCRYFALL_DOWN = "Couldn't reach Scryfall. Check your connection and try again.";

export function renderPaste(view: HTMLElement, ctx: AppContext): void {
  const name = h('input', { id: 'deck-name', type: 'text', autocomplete: 'off', placeholder: 'Optional, e.g. Edgar Vampires' });
  const text = h('textarea', { id: 'decklist', rows: 14, spellcheck: false, placeholder: '1 Edgar Markov\n1 Sol Ring\n8 Swamp\n…', required: true });
  const submit = h('button', { type: 'submit', class: 'button primary' }, 'Price this deck');
  const status = h('div', { class: 'stack' });

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'deck-name' }, 'Deck name'), name),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'decklist' }, 'Decklist'),
      h('p', { class: 'hint' }, 'One card per line, like "1 Sol Ring". Exports from Moxfield, Archidekt and most deck sites work. A Commander heading or *CMDR* marks your commander.'),
      text,
    ),
    h('div', { class: 'actions' }, submit, h('a', { class: 'button', href: '#/' }, 'Cancel')),
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { entries, errors } = parseDeckList(text.value);
    status.replaceChildren();
    if (errors.length) {
      status.append(h('div', { class: 'notice', role: 'alert' }, h('p', {}, 'Some lines need fixing:'), h('ul', {}, ...errors.map((e) => h('li', {}, `Line ${e.line} "${e.text}": ${e.reason}`)))));
      return;
    }
    if (!entries.length) {
      status.append(h('p', { class: 'notice', role: 'alert' }, 'Paste at least one card.'));
      return;
    }
    submit.disabled = true;
    status.append(h('p', { class: 'muted', role: 'status' }, `Looking up ${entries.length} cards on Scryfall…`));
    try {
      const resolved = await resolveList(ctx.client, entries);
      renderFixUp(status, ctx, name.value, resolved.map((r) => ({ ...r, removed: false })));
    } catch {
      status.replaceChildren(h('p', { class: 'notice', role: 'alert' }, SCRYFALL_DOWN));
    } finally {
      submit.disabled = false;
    }
  });

  view.append(h('section', { class: 'stack' }, h('h2', {}, 'Paste a list'), form, status));
  text.focus();
}

function renderFixUp(host: HTMLElement, ctx: AppContext, deckName: string, lines: Line[]): void {
  const draw = () => {
    host.replaceChildren();
    const open = lines.filter((l) => !l.card && !l.removed);
    const matched = lines.filter((l): l is Line & { card: ScryCard } => !!l.card && !l.removed);

    if (open.length) {
      host.append(
        h('h3', {}, `${open.length} ${open.length === 1 ? 'card needs' : 'cards need'} attention`),
        h('ul', { class: 'fixups' }, ...open.map((l) => fixUpRow(l))),
      );
    }

    const aliases = matched.filter((l) => l.aliasOf);
    if (aliases.length) {
      host.append(
        h('div', { class: 'banner' }, h('p', {}, 'Matched by alternate printed names:'), h('ul', {}, ...aliases.map((l) => h('li', {}, `${l.entry.name} is sold as ${l.aliasOf}`)))),
      );
    }

    const candidates = commanderCandidates(matched);
    let commander: ScryCard | null = candidates[0] ?? null;
    let commanderBlock: HTMLElement;
    if (candidates.length > 1) {
      const select = h('select', { id: 'commander' }, ...candidates.map((c) => h('option', { value: oracleIdOf(c) }, c.name)));
      select.addEventListener('change', () => {
        commander = candidates.find((c) => oracleIdOf(c) === select.value) ?? null;
      });
      commanderBlock = h('div', { class: 'field' }, h('label', { for: 'commander' }, 'Which card is your commander?'), select);
    } else if (commander) {
      commanderBlock = h('p', {}, h('strong', {}, `Commander: ${commander.name}`));
    } else {
      commanderBlock = h('p', { class: 'notice' }, 'No legendary creature found. Add your commander to the list, or mark it with a Commander heading.');
    }

    const create = h('button', { type: 'button', class: 'button primary', disabled: open.length > 0 || !commander }, 'Create deck');
    create.addEventListener('click', () => {
      if (!commander) return;
      const deck = buildDeck(deckName, matched, commander);
      ctx.saveDeck(deck);
      ctx.go(`#/deck/${deck.id}`);
    });
    host.append(commanderBlock, h('div', { class: 'actions' }, create, open.length ? h('span', { class: 'muted' }, 'Fix or remove the cards above first.') : null));
  };

  const fixUpRow = (l: Line) => {
    const input = h('input', { type: 'text', value: l.entry.name, 'aria-label': `Card name for line ${l.entry.line}` });
    const msg = h('span', { class: 'muted' });
    const lookUp = h('button', { type: 'button', class: 'button' }, 'Look up');
    lookUp.addEventListener('click', async () => {
      lookUp.disabled = true;
      msg.textContent = 'Looking up…';
      try {
        const found = await fuzzyCard(ctx.client, input.value);
        if (found) {
          l.card = found;
          draw();
        } else msg.textContent = 'Still no match. Check the spelling.';
      } catch {
        msg.textContent = SCRYFALL_DOWN;
      } finally {
        lookUp.disabled = false;
      }
    });
    const remove = h('button', { type: 'button', class: 'button' }, 'Remove');
    remove.addEventListener('click', () => {
      l.removed = true;
      draw();
    });
    const suggestion = l.suggestion;
    const use = suggestion ? h('button', { type: 'button', class: 'button primary' }, `Use ${suggestion.name}`) : null;
    use?.addEventListener('click', () => {
      l.card = suggestion;
      draw();
    });
    return h(
      'li',
      { class: 'fixup' },
      h('p', {}, h('strong', {}, l.entry.name), ` (line ${l.entry.line}): `, suggestion ? `did you mean ${suggestion.name}?` : 'No close match.'),
      h('div', { class: 'actions' }, use, input, lookUp, remove, msg),
    );
  };

  draw();
}
