import type { Tab } from '../lib/nav';
import { h, icon } from './dom';

const TABS: Array<{ id: Tab; label: string; root: string; paths: string[] }> = [
  { id: 'decks', label: 'Decks', root: '#/', paths: ['M7 3h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 21h8a4 4 0 0 0 4-4V8'] },
  { id: 'browse', label: 'Browse', root: '#/browse', paths: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M16 16l5 5'] },
  { id: 'life', label: 'Life Counter', root: '#/life', paths: ['M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'] },
];

export interface TabBar {
  el: HTMLElement;
  /** Marks the current tab and points each other tab at the place it was left. */
  update(active: Tab, last: Record<Tab, string>): void;
}

/** The bottom navigation. The current tab's link goes to that tab's root; tapping it there only scrolls to the top. */
export function createTabBar(): TabBar {
  const links = new Map<Tab, HTMLAnchorElement>();
  for (const t of TABS) {
    const a = h('a', { href: t.root }, icon(...t.paths), h('span', {}, t.label));
    a.addEventListener('click', (e) => {
      if (a.getAttribute('href') === (location.hash || '#/')) {
        e.preventDefault();
        window.scrollTo(0, 0);
      }
    });
    links.set(t.id, a);
  }
  const el = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, ...links.values());
  return {
    el,
    update(active, last) {
      for (const t of TABS) {
        const a = links.get(t.id)!;
        a.setAttribute('href', t.id === active ? t.root : last[t.id]);
        if (t.id === active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
    },
  };
}
