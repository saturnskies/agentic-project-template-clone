---
description: Tab bar and Life Counter build plan — four test-gated vertical slices from the bottom tab bar and routes to a playable, saved, awake life counter
status: current
updated: 2026-11-04
---

# Tab bar and Life Counter: build plan

Builds the [tab bar and Life Counter spec](../specs/2026-11-04-tab-bar-life-counter.md). Each slice works end to end in the browser. Before a slice is committed, `npm run check` must pass, and the change must be tried in the dev server at a phone width.

**Layout:**
- `src/lib/nav.ts` — `tabOf`, `backTarget`; `src/lib/life.ts` — pure game logic. Unit tests in `tests/unit/`.
- `src/ui/tabs.ts` — the bar; `src/ui/app.ts` — the only router, owns the per-tab containers; `src/ui/life.ts` — Life Counter screens.
- `tests/e2e/tabs.spec.ts`, `tests/e2e/life.spec.ts`.

**Reuse (ladder rung that held):** `h()` and `<dialog>` (2, 4); `browserStorage()` (2); `backTarget` extended, not duplicated (2); segmented control copied from `suggestions.ts` and extracted to `src/ui/controls.ts` once a second file needs it (2); a small `icon()` SVG helper in `dom.ts` because `h()` builds HTML elements only (6). No new dependency.

## Execution routing

| Work | Who | Model | Effort |
|---|---|---|---|
| Slices 1–4 (code and tests) | main session | as set | as set |
| Test gate after each slice | `npm run check` script, in the background | — | — |
| Code review before PR | the single `/go` review agent | sonnet | high |

## Slices

### 1. Tab bar, routes, per-tab place
- [x] `lib/nav.ts`: `tabOf(route)` (Decks / Browse / Life) and `backTarget` (`#/life/game` → `#/life` → `#/` → exit). Unit tests cover every row of the spec's back table.
- [x] `dom.ts` `icon()`; `ui/tabs.ts` nav with links, labels, `aria-current`, safe-area padding. Page gets matching bottom padding.
- [x] `app.ts`: one container per tab. Browse and Life stay mounted and are `hidden` when inactive. Decks re-renders only when its route changes or a screen asks for a refresh, so coming back to it keeps the deck, its inputs and its scroll. Last route and scroll are remembered per tab. Tapping the active tab goes to its root and scrolls to the top.
- [x] Browse placeholder page; Life Counter empty setup screen (heading only).
- [x] `#/life/x` and `#/life/game` (no game exists yet) fall back to `#/life`.
- [x] E2E (`tabs.spec.ts`): three labelled tabs with the right one current; switching changes the route; reload on `#/life` stays; Decks keeps a half-typed form and its scroll across a visit to Life; tapping the active Decks tab returns to Your decks; hidden tab containers keep their DOM; the footer is not hidden behind the bar. Both projects.
- **Failure paths:** unknown life sub-route; empty hash; share-link route (`#d=…`) counts as Decks.
- **Follow-up for part 2:** a deck saved from Browse while the Decks tab is hidden must refresh the Decks screen when it comes back (stale list). Test it there.
- **Done 2026-11-04.** `npm run check`: 280 unit and 140 e2e tests pass. The Decks screen is kept as it was (not redrawn) when its route is unchanged, so a half-typed form and the scroll survive; `ctx.refresh`, `go` and `replace` force a redraw. The active tab's link points at its root and the others at the place they were left.

### 2. Setup, game screen, life, saved game
- [x] `lib/life.ts`: new game, change life, seating per player count, sanitize/serialize, `swapsmith:life` key. Unit tests including bad shapes, 7 players, string totals, `version: 2`.
- [x] Setup (players 1–6, starting life 20/30/40/custom, Start, Resume/New with confirm). Game screen with rotated tiles, tap ±1, hold ±10. Tab bar and header hidden on `#/life/game`; "Leave game" back to `#/life`.
- [x] Save after every change; reload on `#/life/game` resumes; no saved game redirects to `#/life`.
- **Failure paths:** storage blocked and full; invalid JSON copied to `:backup`; hold then release does not also tap; pointer leaving cancels the hold; two tiles changed at once.
- **Done 2026-11-04.** `npm run check`: 321 unit and 178 e2e tests pass.
  - The segmented control moved from `suggestions.ts` to `ui/controls.ts`, so there is one copy.
  - The 8-swatch palette and its contrast test landed here, not in slice 4, because tiles need readable text now. Slice 4 adds the picker.
  - A game menu dialog (Leave game, Close) exists already; slices 3 and 4 add Undo, Roll and the rest.
  - The pointer-leave test fails with the `pointerleave` handler removed.
  - The custom life field has no `maxlength`: it would cut "1000" to a valid "100" and hide the error.
  - An out-of-range saved player count falls back to 4 instead of clamping.

### 3. Poison, commander damage, warnings, undo
- [x] Reducers for poison and commander damage (partners tracked separately), lethal checks at 0 / 10 / 21, undo with a 50-entry history. Unit tests at both sides of each threshold.
- [x] Per-player sheet (`<dialog>`), warning styles (text plus color), game menu with Undo.
- **Failure paths:** undo with nothing to undo; history cap; undo after reset; nothing is ever eliminated.
- **Done 2026-11-04.** `npm run check`: 346 unit and 192 e2e tests pass.
  - Reset life totals landed here, not in slice 4: the plan's "undo after reset" path needs it. Reset clears the undo history.
  - The "Has a partner commander" toggle lives in the player's sheet only; there is no setup toggle. Turning it off drops that partner's damage and its undo entries.
  - Each commander of a pair is judged on its own against 21; 15 + 15 does not warn.
  - A saved game from before these counters loads with zeros and an empty history.
  - The click that ends a hold is swallowed once, within 150 ms. A longer window also swallowed a deliberate quick tap after a hold. The "release does not also tap" test fails without the guard.

### 4. Names, colors, first player, Wake Lock
- [ ] Names (24 chars) and 8 swatches, remembered for the next game; contrast unit test for the swatches.
- [ ] Roll for first player with an injectable random source; reduced-motion respected.
- [ ] Wake Lock on game open, released on leave, re-requested on `visibilitychange`; notice when unsupported or rejected.
- **Failure paths:** API missing; `request()` rejects; second request while held; release on leaving; reacquire after hidden.
