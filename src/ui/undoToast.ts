import { h } from './dom';

const SHOW_MS = 10_000;

/**
 * The "Removed X. Undo" offer that follows removing a card: a live region in a fixed bar (above the Cards | Suggestions
 * bar on a phone). `offer` replaces any earlier offer and hides itself after 10 seconds; `clear` ends it at once. A
 * keyboard user cannot reach a bar that is last in the page within that time, so `focusUndo` hands it focus.
 */
export function undoToast(): { root: HTMLElement; offer(message: string, onUndo: () => void, focusUndo: boolean): void; clear(): void } {
  const root = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    root.replaceChildren();
  };
  return {
    root,
    clear,
    offer(message, onUndo, focusUndo) {
      clear();
      const undo = h('button', { type: 'button', class: 'button' }, 'Undo');
      undo.addEventListener('click', onUndo);
      root.replaceChildren(h('div', { class: 'toast' }, h('span', {}, message), undo));
      if (focusUndo) undo.focus();
      timer = setTimeout(clear, SHOW_MS);
    },
  };
}
