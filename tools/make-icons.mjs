// Renders public/icon.svg into the PNG icons the web manifest and iOS need.
// Run: node tools/make-icons.mjs   (uses the Playwright Chromium from devDependencies)
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('public/icon.svg', 'utf8');

// Full-bleed square (the OS applies its own mask) with the art shrunk into the 80% safe zone.
const square = svg
  .replace(' rx="96"', '')
  .replace(/(<rect [^>]*\/>)([\s\S]*)<\/svg>/, '$1<g transform="translate(256 256) scale(.8) translate(-256 -256)">$2</g></svg>');

const jobs = [
  { out: 'public/icon-192.png', size: 192, markup: svg },
  { out: 'public/icon-512.png', size: 512, markup: svg },
  { out: 'public/icon-maskable-512.png', size: 512, markup: square },
  { out: 'public/apple-touch-icon.png', size: 180, markup: square },
];

const browser = await chromium.launch();
for (const { out, size, markup } of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
  );
  writeFileSync(out, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  await page.close();
  console.log('wrote', out);
}
await browser.close();
