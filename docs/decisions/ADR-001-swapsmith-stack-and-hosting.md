---
description: Chooses a static Vite + TypeScript site with no framework, Scryfall called from the browser, and GitHub Pages hosting for Swapsmith
status: current
updated: 2026-11-02
---
# ADR-001: Swapsmith stack and hosting

## Context

Swapsmith is a Commander deckbuilder with live TCGplayer prices and rules-based suggestions. The design is in the [v1 spec](../superpowers/specs/2026-11-02-swapsmith-design.md). The requirements that drive the stack:

- **Free to run and use.** No server bills, no accounts, and no AI calls that spend a user's credits.
- **Shareable by link** with a playgroup, and usable on phones.
- **Live prices for any card.** Scryfall's public API serves TCGplayer prices with `access-control-allow-origin: *`, checked on 2026-11-02, so a browser can call it directly.
- **Simple data.** All state is a few decks, an owned-card set and a cache, so it can live in the browser.
- **Public code.** The repo is public, so GitHub Pages is free.

## Decision

- **Language and build:** TypeScript, built with Vite into a static site. No UI framework: plain DOM modules, with a small render helper for repeated parts. The screens are few and mostly lists, so a framework would add more weight than it saves.
- **Data:** Scryfall's REST API, called from the browser through one client module that queues requests at about 10 a second, retries on 429, and caches responses in IndexedDB for 24 hours.
- **Storage:** `localStorage` holds decks (each with the cards owned for it) and preferences under the versioned key `swapsmith:v1`. Share links carry a deck in the URL hash, compressed with the browser's built-in `CompressionStream`.
- **Tests and checks:** `tsc --noEmit` as the lint step, Vitest for unit tests and Playwright for end-to-end tests, with Scryfall answered from recorded fixtures.
- **Hosting:** GitHub Pages at `https://saturnskies.github.io/swapsmith/` (repo renamed `swapsmith`), deployed by a GitHub Actions workflow from `main` after lint and tests pass.

## Alternatives Considered

### claude.ai Artifact app
- Pros: already used for the price dashboard. It has built-in storage and the option of Claude suggestions.
- Cons: the page can't reach Scryfall, so prices would be a refreshed snapshot. AI suggestions spend the viewer's credits, and saving decks needs a claude.ai sign-in.
- Rejected: it fails the "free for anyone with the link" requirement.

### React or Svelte single-page app
- Pros: components and state handling are familiar to many contributors.
- Cons: extra dependencies and build setup for an app with about five screens.
- Rejected for v1. Revisit if the UI grows, such as with accounts or several formats.

### Backend with accounts (for example Supabase) for cloud saves
- Pros: decks follow you across devices.
- Cons: a hosted service to set up and maintain, plus account sign-up for every friend.
- Rejected: browser saves plus share links cover the playgroup's needs.

### Netlify or Cloudflare Pages
- Pros: free tiers and preview deploys.
- Cons: another account and service, when the repo is public and Pages is free.
- Rejected for now. The build output is plain static files, so switching later is easy.

## Consequences

- **Scryfall dependency.** The site depends on Scryfall's API staying free and CORS-enabled. If it goes down, the app shows cached prices.
- **First-load wait.** A new deck takes about 10 seconds to price on first load, because finding each card's cheapest printing needs one request per card. The cache makes reloads fast.
- **Decks stay on one browser.** Clearing site data loses them. Share links double as a backup.
- **CLAUDE.md needs updating.** When slice 1 lands, its Stack line and Essential Commands table must be filled in with the npm commands.
