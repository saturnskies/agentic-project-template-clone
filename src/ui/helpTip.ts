import { h } from './dom';

/**
 * The first-use note about Owned and Keep. A phone has no hover, so a tooltip cannot explain them. It
 * is shown until dismissed once on this device; `onDismiss` remembers that.
 */
export function helpTip(onDismiss: () => void): HTMLElement {
  const gotIt = h('button', { type: 'button', class: 'button' }, 'Got it');
  const tip = h(
    'div',
    { class: 'banner tip', role: 'note', 'aria-label': 'How Owned and Keep work' },
    h('p', {}, h('strong', {}, 'Owned'), ': tick the cards you already have for this deck. They come off Still to buy. Other decks keep their own ticks.'),
    h('p', {}, h('strong', {}, 'Keep'), ': suggestions never cut or replace that card.'),
    gotIt,
  );
  gotIt.addEventListener('click', () => {
    onDismiss();
    tip.remove();
  });
  return tip;
}
