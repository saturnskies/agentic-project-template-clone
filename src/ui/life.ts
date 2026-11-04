import { h } from './dom';

/** The Life Counter tab. Drawn once; the container stays mounted while another tab is showing. */
export function renderLife(view: HTMLElement): void {
  if (view.childElementCount) return;
  view.append(h('section', { class: 'stack', 'aria-labelledby': 'life-h' }, h('h2', { id: 'life-h' }, 'Life Counter')));
}
