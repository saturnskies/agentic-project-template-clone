---
description: Plan for swap from a card — tap a deck card, see similar cards from decks with the same commander, popularity and comparison side by side, swap in one tap; five test-gated slices
status: draft
updated: 2026-11-06
---

# Swap from a card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a deck card opens a dialog listing similar cards that fit the deck, each with popularity, a plain comparison and the card text beside yours, and a Swap button.

**Architecture:** A pure module `src/lib/similar.ts` scores similarity, filters by deck fit, ranks and compares. The suggestions panel already holds the scored EDHREC pool (or the v1 pool) and exposes it through a small new API. A new `src/ui/cardDialog.ts` renders it; `deckView.ts` opens it. No new network paths.

**Tech Stack:** TypeScript, Vite, Vitest (`tests/unit/`), Playwright (`tests/e2e/`), existing `src/scryfall/` and `src/edhrec/` clients.

**Spec:** [swap from a card](../specs/2026-11-06-swap-from-card.md). Read it before starting; it lists the owner's decisions and the calls already made.

## Global Constraints

- Static site, no server. No new EDHREC or Scryfall call path; the dialog only reads what the suggestions panel has loaded or starts that panel's own Find.
- Never offer a card that is banned, off the deck's colors, already in the deck, unpriced or a basic land; nothing for the commander or basic lands. A land matches only lands, and a nonland never matches a land.
- A card marked Keep still opens the dialog and its Swap works; Keep only excludes it from the Swaps and Cheaper tabs.
- Options render in under 100 ms for a 100-card deck once the pool is loaded (timed in a unit test on the pure functions).
- "Better fit" means the option's commander score beats the tapped card's by at least 0.1; popularity wording is "In N% of {commander} decks".
- Do not change the `swapsmith:v1` storage key or the package id. Re-recording fixtures moves e2e totals: record any new commander into its own flow's map only.
- Every doc under `docs/` starts with front matter; run `tools/doc-index.sh` after changing one.

## Review Focus

- **Vanilla and empty-text cards** (no oracle text): similarity must not divide by zero or match everything; expect no options or only role and type matches, never a crash.
- **Double-faced and split cards:** compared on the front face; a land-spell front face that is a spell never matches lands.
- **A tapped card not on the EDHREC page** (score 0): every listed option may be flagged; the dialog says "Not on this commander's page" and still works.
- **Rapid taps and swaps:** tapping a second card while the first dialog loads, or swapping twice quickly, never swaps the wrong card or shows a card already in the deck.
- **EDHREC answers late, fails, or the deck changes while the dialog is open:** the dialog shows its failed state or re-scores, never stale options.

## Execution routing

| Slice | Who | Model | Effort |
|---|---|---|---|
| 1 to 4 (code and tests) | worker agent, one at a time, test gate (`npm run check`) rerun by script after each | sonnet | high |
| 5 (tuning, fixtures, docs) | worker agent | sonnet | medium |
| Final review | reviewer on the whole branch | sonnet | high |

## File Structure

- Create `src/lib/similar.ts` — pure: text normalisation, similarity, fit filter, ranking, comparison.
- Create `src/ui/cardDialog.ts` — the dialog (one `<dialog class="picker">`, same pattern as the printing picker in `deckView.ts:218`).
- Modify `src/scryfall/types.ts` — add `produced_mana?: string[]`, `power?: string`, `toughness?: string` to `ScryCard` and `mana_cost?`, `power?`, `toughness?` to each `card_faces` entry (Scryfall already sends them).
- Modify `src/ui/suggestions.ts` — expose the pool: `swapOptions`, `find`, `onUpdate`.
- Modify `src/ui/deckView.ts` — the card name opens the dialog; the TCGplayer link moves into the dialog (my call: the name was the link; a tap now means the dialog). Shared read-only decks keep the link, since they have no panel.
- Tests: `tests/unit/similar.test.ts`, `tests/e2e/card-swap.spec.ts`, fixture additions in Slice 5.

## Slice 1: Tap a card, see similar cards that fit

**Interfaces — Produces** (in `src/lib/similar.ts`):
```ts
export const MIN_SIMILARITY = 0.35, FIT_BAR = 0.6, ROLE_BONUS = 0.15, TYPE_BONUS = 0.1, PAGE_SIZE = 10;
export interface Tapped { card: ScryCard; oracleId: string; roles: string[]; score: number }
export interface SwapOption { suggestion: Suggestion; similarity: number; betterFit: boolean; differences: string[] }
export function normalizeText(card: ScryCard): string;
export function similarity(tapped: ScryCard, other: ScryCard, sharedRole: boolean): number; // 0 to 1
export function similarTo(tapped: Tapped, pool: Suggestion[], profile: DeckProfile): SwapOption[]; // all that pass, best first
```
In `src/ui/suggestions.ts`, the panel returns `{ root, refresh, find(): void, onUpdate(fn: () => void): void, swapOptions(oracleId: string): SwapOptionsState }` with
`type SwapOptionsState = { status: 'idle' | 'loading' | 'failed' } | { status: 'ready'; source: 'edhrec' | 'rules'; options: SwapOption[]; listed: boolean }`.
In `src/ui/cardDialog.ts`: `cardDialog(panel: SwapPanel, swap: PanelActions['swap']): { root: HTMLDialogElement; open(card: PricedCard): void }`, where `SwapPanel` is the panel's return type.

- [ ] **Step 1: Failing unit tests** in `tests/unit/similar.test.ts`, with a `card({...})` builder for `ScryCard`:
  - `normalizeText` replaces the card's own name with `~`, drops parenthesised reminder text, turns digits into `#` and mana symbols like `{G}` into `{m}`, uses the front face only.
  - `similarity` of Arcane Signet vs Sol Ring text is at least 0.35 with a shared `ramp` role; vs Lightning Greaves is below 0.35 without one; a tapped dual land vs an untapped dual land is at least 0.6; empty text vs empty text is 0 (no NaN).
  - `similarTo` drops a nonland for a land tapped card and a land for a nonland tapped card; drops a candidate that matches no deck theme or tribe, shares no role and scores under `FIT_BAR`; keeps one that shares the tribe; orders by similarity then by `suggestion.score`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/similar.test.ts`. Expected: FAIL, module missing.
- [ ] **Step 3: Implement** `normalizeText`, `similarity` (Jaccard overlap of word pairs of the normalised text, plus `ROLE_BONUS` for a shared role and `TYPE_BONUS` for the same main type via `mainType`, capped at 1) and `similarTo` (fit rule from the spec: tribe or theme match, or shared role, or similarity ≥ `FIT_BAR`; set `betterFit: false` and `differences: []` for now). Add the type fields to `ScryCard`.
- [ ] **Step 4: Run** the unit tests. Expected: PASS.
- [ ] **Step 5: Failing e2e** `tests/e2e/card-swap.spec.ts` using `edgarEdhrec` fixtures and `seedEdgarDeck` (as `edhrec.spec.ts` does): after Find suggestions, tapping a deck card's name opens a dialog titled with the card, showing its cost, price, text and "In N% of Edgar Markov decks"; the list has at least one option, each with name, price, popularity and text, and shows 10 at most with a "Show more" button when more exist. Existing list-row and grid specs that click the name as a TCGplayer link are updated to the dialog's link.
- [ ] **Step 6: Implement** `swapOptions`, `find`, `onUpdate` in the panel (build `Tapped` from the deck card's `ScryCard`, `roles` map and `edhrecKeepScores`), `cardDialog.ts`, and the trigger in `cardControls` (`deckView.ts`). Dialog: labelled, Escape closes, 44 px targets.
- [ ] **Step 7: Run** `npm run check`. Expected: PASS. **Commit** each file separately (project rule), message specific to its change.

## Slice 2: Swap, undo, Keep

**Consumes:** Slice 1's dialog and `PanelActions['swap']`.

- [ ] **Step 1: Failing e2e** in `card-swap.spec.ts`: pressing Swap on an option replaces the tapped card with it (deck total and card list change), closes the dialog and shows the existing "Swapped X → Y" undo, which restores the deck; a Keep card opens the dialog, shows options and its Swap works; the commander and a basic land have no dialog trigger that offers options; after a swap, reopening another card no longer lists the swapped-in card.
- [ ] **Step 2: Failing unit test** in `similar.test.ts`: `similarTo` never returns a pool entry whose `oracleId` equals the tapped card's.
- [ ] **Step 3: Implement** the Swap button in the dialog calling `swap(tapped.oracleId, option.suggestion.card)`; `swapOptions` rescored against the current deck on each call (use `edhrecScored(edh, ids)`); trigger hidden for the commander and basic lands.
- [ ] **Step 4: Run** `npm run check`; **commit** per file.

## Slice 3: Better fit and the comparison line

**Interfaces — Produces:** `compare(a: ScryCard, b: ScryCard): string[]` in `similar.ts`, at most 3 short phrases, in this order: cost ("Costs 1 less" / "Costs 2 more", from `cmc`), tapped state ("Enters untapped instead of tapped", only for an unconditional "enters tapped" on one side and none on the other), colors made ("Also makes {U}", "No longer makes {R}", from `produced_mana`), stats ("3/3 instead of 2/2", creatures only), keywords ("Gains flying", "Loses lifelink", from `keywords`). Anything not in this list is never claimed. `BETTER_MARGIN = 0.1` exported beside the other constants.

- [ ] **Step 1: Failing unit tests**: Arcane Signet vs Commander's Sphere gives `["Costs 1 less"]`; an untapped vs a tapped dual gives `["Enters untapped instead of tapped"]`; a conditional "enters tapped unless" is not claimed; two cards with no listed difference give `[]`; `betterFit` is true at a score gap of 0.1 and false at 0.09; a tapped card with score 0 flags every positive-score option.
- [ ] **Step 2: Run, see FAIL; implement** `compare` and fill `betterFit` and `differences` in `similarTo`.
- [ ] **Step 3: Failing e2e**: an option shows "Better fit" only when more played than the tapped card, shows its comparison line when `differences` is non-empty and none when empty, and a tapped card the page doesn't list shows "Not on this commander's page".
- [ ] **Step 4: Implement** the flag, the line and the note in `cardDialog.ts`; `listed` comes from the panel. **Run** `npm run check`; **commit** per file.

## Slice 4: Loading, failure and the rules fallback

- [ ] **Step 1: Failing e2e**: tapping a card before Find suggestions shows a loading line, starts the same load (no second EDHREC request when Find is pressed afterwards, checked on the mock's request log), then fills in; an EDHREC 403 (the `edgarFull` flow) shows options from the rules pool with the note "Matching is approximate" or, when none match, "No similar cards found for this deck yet."; a failed load shows a retry button and leaves the dialog usable; tapping a second card while the first is loading shows the second card's options only.
- [ ] **Step 2: Implement** `find()` reuse (a click on the existing Find button, guarded so a run in progress isn't restarted), `status` and `source` states, `onUpdate` redraw of an open dialog, and a run token so a late reply for a closed or changed dialog is ignored.
- [ ] **Step 3: Run** `npm run check`; **commit** per file.

## Slice 5: Tune, time and document

- [ ] **Step 1: Record** one artifact-heavy commander with many mana rocks and dual lands into its own flow's fixture map (`RECORD=1 npx vitest run tests/unit/record-fixtures.test.ts`, extended for it); other flows' totals must not move.
- [ ] **Step 2: Failing fixture tests** in `similar.test.ts`: on the Edgar page, Skullclamp's options are draw or artifact cards and exclude Sol Ring; on the new commander, a mana rock's options are all mana rocks and a dual land's all lands. Tune the starting constants until these pass, and write the final values and the three commanders checked into this plan under "Tuning results".
- [ ] **Step 4: Timing test**: `similarTo` plus `compare` over a 290-card pool and a 100-card deck finishes in under 100 ms (`performance.now()`, generous margin for CI).
- [ ] **Step 5: Docs**: set the spec's status to `current`; add a line to CLAUDE.md "Architecture" for `src/lib/similar.ts` and `src/ui/cardDialog.ts`; mark this plan `done`; run `tools/doc-index.sh`.
- [ ] **Step 6: Run** `npm run check` and `tools/doc-index.sh --check`; finish with `/go`.

## Tuning results

(filled in during Slice 5)
