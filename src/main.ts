import './style.css';
import { startApp } from './ui/app';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Swapsmith: #app element missing');

app.innerHTML = `
  <header class="site-header">
    <div class="wrap">
      <h1><a href="#/" class="home-link">Swap<span>smith</span></a></h1>
    </div>
  </header>
  <main class="wrap" id="main"></main>
  <footer class="site-footer">
    <div class="wrap">
      <p>Card data, images and prices from <a href="https://scryfall.com">Scryfall</a>. Prices are TCGplayer market prices in USD, updated daily.</p>
      <p>Swapsmith is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. It is not approved or endorsed by Wizards, and not affiliated with Wizards of the Coast or TCGplayer.</p>
    </div>
  </footer>
`;

startApp(app.querySelector<HTMLElement>('#main')!);
