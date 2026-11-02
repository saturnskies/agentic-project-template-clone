---
description: Makes Swapsmith an installable PWA (manifest, small service worker, generated icons) on the existing /swapsmith/ GitHub Pages origin, as the base for an APK later
status: current
updated: 2026-11-02
---
# ADR-002: Installable PWA

## Context

Swapsmith is a static site on GitHub Pages ([ADR-001](ADR-001-swapsmith-stack-and-hosting.md)). The owner wants it installable on Android and may later wrap it as an APK or Play Store app (Trusted Web Activity via Bubblewrap, or Capacitor). Both wrappers need a web manifest, a service worker and proper icons, and an installed PWA is useful on its own. Monetization and Play distribution are on hold.

## Decision

- **Manifest** at `public/manifest.webmanifest`: standalone display, black background and theme, `start_url` and `scope` relative (`./`) so they follow Vite's `base`. Icons are 192 and 512 px `any` plus a 512 px `maskable`.
- **Service worker** at `public/sw.js`, hand-written, no library. Same-origin GETs only: pages are network first with a cached fallback, other files are cached and refreshed in the background. Scryfall requests are never touched; the IndexedDB cache in `src/scryfall/client.ts` already owns them. Registered from `src/main.ts` in production builds only.
- **Icons:** `public/icon.svg` is the source. `node tools/make-icons.mjs` renders the PNGs and the iOS touch icon; the PNGs are committed.
- **Origin:** keep `/swapsmith/` on `saturnskies.github.io`. A custom domain is not needed for installing the PWA.
- **Tests:** `tests/e2e/pwa.spec.ts` checks the manifest and icons, and that the worker takes control and opens the shell offline. Other e2e tests block service workers so fixtures stay in charge of Scryfall responses.

## Alternatives Considered

### Workbox or vite-plugin-pwa
- Pros: precaching of hashed assets, update prompts.
- Cons: a dependency and generated config for a shell of about three files.
- Rejected for now. Revisit if offline needs grow.

### Custom domain now
- Pros: clean origin for a full-screen Trusted Web Activity.
- Cons: cost and DNS work with no current need.
- Deferred until an APK or Play release is decided.

## Consequences

- Users can install the app from Chrome and open the shell offline; prices still need a network or the 24 h cache.
- Deploys show up on the next online page load; assets refresh in the background and apply on the load after.
- Changing the icon means rerunning `tools/make-icons.mjs` and committing the PNGs.
- An APK build is the next step and would need its own ADR if it adds a toolchain.
