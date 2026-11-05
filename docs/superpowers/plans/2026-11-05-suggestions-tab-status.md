---
description: A small status badge on the Suggestions tab (Searching, Ready, Failed) so a search started in the Suggestions pane is visible from the Cards pane on a phone — one test-gated slice
status: draft
updated: 2026-11-05
---

# Search status on the Suggestions tab

**Why:** on a phone the card list and the suggestions panel are separate panes ([phone layout plan](2026-11-04-phone-layout.md), slice 4). Start a search, switch to Cards, and nothing says it is still running or that it finished. The second critique listed this as a P3.

## Decisions (change them before building if wrong)

- **A badge inside the Suggestions tab button**, one of: `Searching`, `Ready`, `Failed`. Nothing shows when idle.
- **It only shows while you are on Cards.** On the Suggestions pane the panel already shows its own status, so no badge there. Opening the pane clears `Ready` and `Failed` (they have been seen); `Searching` stays until the search ends.
- **The button's name does not change.** The badge is `aria-hidden`, so the tab is still just "Suggestions" to a screen reader and to tests that find it by name. A separate hidden live region in the bar announces the change ("Searching Scryfall for suggestions…", "Suggestions are ready.", "Couldn't search Scryfall.").
- **"Ready" means the search finished**, not that the deck's own roles have loaded (that continues quietly afterwards, as today).
- **Motion:** a small pulsing dot with `Searching`, only when the user has not asked for reduced motion.
- **Out of scope here, done right after:** the List/Grid switch above the Suggestions panel. On a phone it is now hidden while the Suggestions pane shows (it controls a list you cannot see) and always shown on a wide screen; the choice is kept. One CSS rule under 70rem (`body:has(.deck-columns[data-pane="suggestions"]) .view-switch`) and a class on the switch; one test in the Cards | Suggestions group.

## Slice

- [x] Failing tests first (phone): while a search runs and you are on Cards the tab shows `Searching`, then `Ready`; the tab's accessible name stays "Suggestions"; a polite live region announces both; opening Suggestions clears `Ready`; a search that finishes while you are already on Suggestions never shows a badge; a search that fails (every Scryfall search aborted) shows `Failed` on the tab and opening the pane shows the panel's own error and clears the badge; a second Find after a failure shows `Searching` again; the badge fits on one line in the bar at 360px and 412px wide.
- [x] `src/ui/suggestions.ts` reports `searching` / `ready` / `failed` through a callback, only for the current run (replies from an older run are ignored, as the panel already does); `src/ui/panes.ts` returns the bar plus a `setSearch` and draws the badge and live region; `src/ui/deckView.ts` connects them; `src/style.css` for the badge.
- Failure paths: a superseded run never changes the badge; every Scryfall search failing is the only way to `Failed` (one failed search among several still gives results, with the panel's note, as today).

- Built as planned, in 5 tests in `tests/e2e/suggestions-status.spec.ts` (phone only): Searching then Ready from the Cards pane with an unchanged tab name and a live-region announcement; no badge when the search finishes while you are on Suggestions (a guard that cannot fail before the code exists, so the first test is the one that proves the badge); Failed after every search is aborted, cleared by opening the pane, and Searching again on retry; one line in the bar at 360px; the dot only pulses when motion is allowed. One test locator was wrong at first (the live region sits next to the Show group, not inside it) and was fixed.
- The tab segments now size to their content (`flex: 1 1 auto`) so the badge fits at 360px; the Cards segment is a little narrower while a badge shows.

## Done when

- `npm run check` passes with the new tests, each shown failing on the old code first.
