---
description: Swapsmith v1 build plan — eight test-gated vertical slices from skeleton and deploy to swap suggestions
status: current
updated: 2026-11-02
---

# Swapsmith v1: build plan

Builds the [v1 spec](../specs/2026-11-02-swapsmith-design.md) on the stack in [ADR-001](../../decisions/ADR-001-swapsmith-stack-and-hosting.md). Each slice works end to end in the browser and is gated by tests: `npm run check` (typecheck, unit tests, e2e) must pass before the slice is committed.

**Layout:**
- `src/` holds the app code.
- `src/lib/` holds pure logic: parser, pricing, suggestion rules and share codec. It gets unit tests in `tests/unit/`.
- `src/scryfall/` holds the API client with its queue and cache.
- `src/ui/` holds the screens.
- `tests/e2e/` holds Playwright tests, with Scryfall answered from fixtures in `tests/fixtures/`.

## Execution routing

| Work | Who | Model | Effort |
|---|---|---|---|
| Slices 1–6 (app code and tests) | main session | as set | as set |
| Slices 7–8 (suggestion rules) | main session; code review agent before PR | sonnet | high |
| Test gate after each slice | `npm run check` script | — | — |
| Recording Scryfall fixtures | `tools/record-fixtures.mjs` script | — | — |

## Slices

### 1. Skeleton, Scryfall client and deploy
- [x] Vite + TypeScript app with `base: '/swapsmith/'`. App shell has header, an empty deck list and a footer crediting Scryfall.
- [x] `src/scryfall/client.ts`: queued fetch about 100 ms apart, 429 retry with backoff, and a 24 h IndexedDB cache keyed by URL.
- [x] Unit tests: queue spacing, retry on 429, cache hit, cache expiry (fake timers, fake IndexedDB).
- [x] E2E smoke: page loads, title "Swapsmith", Scryfall credit visible.
- [x] `.github/workflows/pages.yml`: typecheck, unit and e2e tests on push and PR. Deploy to Pages from `main` only.
- [x] CLAUDE.md: Stack line and Essential Commands filled in.

### 2. Paste a list and price it
- [x] `lib/parse.ts`: the spec's list formats. Unit tests include the Edgar Markov list.
- [x] `lib/price.ts`: cheapest printing across nonfoil, foil and etched, and the TCGplayer link without the affiliate redirect. Unit tests.
- [x] Fix-up list for unmatched names, using Scryfall fuzzy "did you mean".
- [x] List view with totals and TCGplayer links. Decks saved to `localStorage` (`swapsmith:v1`), with a banner when storage is blocked.
- [x] E2E: paste the Edgar list, fix "Calastria Highborn", total shown, deck survives reload.

### 3. Commander-first building
- [x] New deck: commander autocomplete (`is:commander`), then the editor.
- [x] Add-card autocomplete. Warnings for off-color cards, cards not legal in Commander, and duplicate non-basics.
- [x] Unit tests for the warning rules. E2E: build from Edgar and add a card.

### 4. Owned cards and printing picker
- [x] Owned ticks, a shared collection across decks, basics owned by default (`UnownedBasics`), and a still-to-buy total.
- [x] Printing picker listing every paper printing cheapest first, with pick and reset.
- [x] Unit tests for totals with owned cards and basics. E2E: tick owned, pick a printing.

### 5. Grid view
- [ ] Card-image grid grouped by type, a view toggle, and the choice remembered.
- [ ] E2E: toggle the view, and the choice persists.

### 6. Share links
- [ ] `lib/share.ts`: deflate-raw plus base64url. Round-trip unit tests. Owned cards are never included.
- [ ] Read-only shared view with **Save to my decks**.
- [ ] E2E: copy a link, open it in a fresh context, save it.

### 7. Suggestions: profile, pool and upgrades
- [ ] `lib/profile.ts`: color identity, tribe and themes. `scryfall/roles.ts`: role lookup by `otag:`.
- [ ] Candidate pool, the scoring formula, and upgrade tiers.
- [ ] Unit tests: never banned, off-color or in-deck cards. Tier boundaries. Owned cards get the bonus.
- [ ] E2E: the suggestions panel shows three tiers for the Edgar deck.

### 8. Swap pairs and cheaper replacements
- [ ] Swap pairs with role-matched cuts and the spec's never-cut rules. Apply and Undo.
- [ ] Cheaper replacements for unowned cards of $5 or more.
- [ ] Unit tests for each rule's guarantees. E2E: apply a swap, undo it, swap in a replacement.
- [ ] Code review, then `/go` for the PR.

## Before the first deploy (owner)

1. Rename the repo to `swapsmith` in GitHub Settings.
2. Make the repo public: Settings, then Danger Zone, then Change visibility.
3. Turn on Pages: Settings, then Pages, then Source: GitHub Actions.
