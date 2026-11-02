// Renders public/icon.svg into the PNG icons the web manifest and iOS need.
// Run: node tools/make-icons.mjs   (uses the Playwright Chromium from devDependencies)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('public/icon.svg', 'utf8');

// Full-bleed square (the OS applies its own mask) with the art shrunk into the 80% safe zone.
const square = svg
  .replace(' rx="96"', '')
  .replace(/(<rect [^>]*\/>)([\s\S]*)<\/svg>/, '$1<g transform="translate(256 256) scale(.8) translate(-256 -256)">$2</g></svg>');

// Android launcher icons for the Capacitor project (ADR-003): adaptive foreground (transparent,
// art inside the 66/108 safe zone over the black background colour), plus legacy square and round.
const foreground = svg
  .replace(/<rect [^>]*\/>/, '')
  .replace(/(<defs>[\s\S]*<\/defs>)([\s\S]*)<\/svg>/, '$1<g transform="translate(256 256) scale(.62) translate(-256 -256)">$2</g></svg>');
const round = svg.replace(' rx="96"', ' rx="256"');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const androidJobs = Object.entries(densities).flatMap(([d, k]) => {
  const dir = `android/app/src/main/res/mipmap-${d}`;
  return [
    { out: `${dir}/ic_launcher.png`, size: Math.round(48 * k), markup: svg },
    { out: `${dir}/ic_launcher_round.png`, size: Math.round(48 * k), markup: round },
    { out: `${dir}/ic_launcher_foreground.png`, size: Math.round(108 * k), markup: foreground },
  ];
});

const jobs = [
  { out: 'public/icon-192.png', size: 192, markup: svg },
  { out: 'public/icon-512.png', size: 512, markup: svg },
  { out: 'public/icon-maskable-512.png', size: 512, markup: square },
  { out: 'public/apple-touch-icon.png', size: 180, markup: square },
  ...(existsSync('android') ? androidJobs : []),
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
