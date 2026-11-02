import './style.css';
import { Capacitor } from '@capacitor/core';
import { startApp } from './ui/app';
import { installNativeBack } from './ui/native';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Swapsmith: #app element missing');

app.innerHTML = `
  <header class="site-header">
    <div class="wrap">
      <h1><a href="#/" class="home-link">Swap<span>Smith</span></a></h1>
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
void installNativeBack();

// Installable app + offline shell. Production only: the dev server serves unhashed modules.
// Skipped inside the Android app (ADR-003), which already ships the files in the APK.
const insideApk = Capacitor.isNativePlatform();
if (import.meta.env.PROD && 'serviceWorker' in navigator && !insideApk) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Unsupported or blocked (private mode, http): the site works the same without it.
    });
  });
}
