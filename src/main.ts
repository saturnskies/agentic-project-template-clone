import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Swapsmith: #app element missing');

app.innerHTML = `
  <header class="site-header">
    <div class="wrap">
      <h1>Swap<span>smith</span></h1>
      <p class="tagline">Price your Commander deck, track what you own, find better swaps.</p>
    </div>
  </header>
  <main class="wrap">
    <section aria-labelledby="decks-h">
      <h2 id="decks-h">Your decks</h2>
      <div class="empty">
        <p><strong>No decks yet.</strong></p>
        <p>Building a deck from a commander and pasting a list are coming next.</p>
      </div>
    </section>
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <p>Card data, images and prices from <a href="https://scryfall.com">Scryfall</a>. Prices are TCGplayer market prices in USD, updated daily.</p>
      <p>Swapsmith is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. It is not approved or endorsed by Wizards, and not affiliated with Wizards of the Coast or TCGplayer.</p>
    </div>
  </footer>
`;
