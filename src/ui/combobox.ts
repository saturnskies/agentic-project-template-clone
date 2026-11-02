import { h } from './dom';

export interface ComboboxOptions<T> {
  id: string;
  label: string;
  placeholder?: string;
  /** Called (debounced) with the typed text; return the suggestions to show. */
  search: (typed: string) => Promise<T[]>;
  render: (item: T) => { label: string; detail?: string };
  onPick: (item: T) => void;
}

const DEBOUNCE_MS = 250;
let uid = 0;

/** A searchable text box with a suggestion list, following the WAI-ARIA combobox pattern. */
export function combobox<T>(opts: ComboboxOptions<T>): { root: HTMLElement; input: HTMLInputElement; clear(): void } {
  const listId = `${opts.id}-list`;
  const input = h('input', {
    id: opts.id,
    type: 'text',
    role: 'combobox',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: opts.placeholder,
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': listId,
  });
  const list = h('ul', { id: listId, role: 'listbox', class: 'combo-list', 'aria-label': opts.label, hidden: true });
  const note = h('p', { class: 'combo-note muted small', 'aria-live': 'polite' });
  const root = h('div', { class: 'combo field' }, h('label', { for: opts.id }, opts.label), h('div', { class: 'combo-box' }, input, list), note);

  let items: T[] = [];
  let active = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const setActive = (i: number) => {
    active = i;
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    const el = list.children[i] as HTMLElement | undefined;
    if (el) {
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const choose = (i: number) => {
    const item = items[i];
    if (item === undefined) return;
    close();
    opts.onPick(item);
  };
  const show = (found: T[]) => {
    items = found;
    list.replaceChildren(
      ...found.map((item, i) => {
        const { label, detail } = opts.render(item);
        // The option is named by the card name alone; the detail (a type line) is its description.
        const oid = `${opts.id}-opt-${++uid}`;
        const li = h(
          'li',
          { id: oid, role: 'option', 'aria-selected': 'false', 'aria-labelledby': `${oid}-l`, 'aria-describedby': detail ? `${oid}-d` : null },
          h('span', { class: 'combo-label', id: `${oid}-l` }, label),
          detail ? h('span', { class: 'combo-detail', id: `${oid}-d` }, detail) : null,
        );
        // mousedown keeps focus in the input, so the list doesn't close before the click lands.
        li.addEventListener('mousedown', (e) => e.preventDefault());
        li.addEventListener('click', () => choose(i));
        return li;
      }),
    );
    list.hidden = found.length === 0;
    input.setAttribute('aria-expanded', String(found.length > 0));
    active = -1;
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const typed = input.value;
    note.textContent = '';
    if (typed.trim().length < 2) {
      show([]);
      return;
    }
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const found = await opts.search(typed);
        if (mine !== seq) return; // a newer search has started
        show(found);
        note.textContent = found.length ? '' : 'No matching cards.';
      } catch {
        if (mine !== seq) return;
        show([]);
        note.textContent = "Couldn't reach Scryfall. Check your connection and try again.";
      }
    }, DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(active + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(active - 1, 0));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', close);

  return {
    root,
    input,
    clear() {
      input.value = '';
      note.textContent = '';
      show([]);
    },
  };
}
