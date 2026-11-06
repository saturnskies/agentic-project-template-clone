---
description: Plan for swap from a card — tap a deck card, see similar cards from decks with the same commander, popularity and comparison side by side, swap in one tap; five test-gated slices
status: done
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
- "Better fit" means the option's inclusion-plus-synergy score on the commander's page (owned bonus left out) beats the tapped card's by at least 0.1; popularity wording is "In N% of {commander} decks".
- Do not change the `swapsmith:v1` storage key or the package id. Re-recording fixtures moves e2e totals: record any new commander into its own flow's map only.
- Every doc under `docs/` starts with front matter; run `tools/doc-index.sh` after changing one.

## Review Focus

- **Vanilla and empty-text cards** (no oracle text): similarity must not divide by zero or match everything; expect no options or only role and type matches, never a crash.
- **Double-faced and split cards:** compared on the front face; a land-spell front face that is a spell never matches lands.
- **A tapped card not on the EDHREC page** (score 0): every listed option may be flagged; the dialog says "Not on this commander's page" and still works.
- **Rapid taps and swaps:** tapping a second card while the first dialog loads, or swapping twice quickly, never swaps the wrong card or shows a card already in the deck.
- **EDHREC answers late, fails, or the deck changes while the dialog is open:** the dialog shows its failed state or re-scores, never stale options.

## Execution routing

| Task | Who | Model | Effort |
|---|---|---|---|
| Tasks 1 to 4 (code and tests) | worker agent, one at a time, test gate (`npm run check`) rerun by script after each | sonnet | high |
| Task 5 (tuning, fixtures, docs) | worker agent | sonnet | medium |
| Final review | reviewer on the whole branch | sonnet | high |

## File Structure

- Create `src/lib/similar.ts` — pure: text normalisation, similarity, fit filter, ranking, comparison.
- Create `src/ui/cardDialog.ts` — the dialog (one `<dialog class="picker">`, same pattern as the printing picker in `deckView.ts:218`).
- Modify `src/scryfall/types.ts` — add `produced_mana?: string[]`, `power?: string`, `toughness?: string` to `ScryCard` and `mana_cost?`, `power?`, `toughness?` to each `card_faces` entry (Scryfall already sends them).
- Modify `src/ui/suggestions.ts` — expose the pool: `swapOptions`, `find`, `onUpdate`.
- Modify `src/ui/deckView.ts` — the card name opens the dialog; the TCGplayer link moves into the dialog (my call: the name was the link; a tap now means the dialog). Shared read-only decks keep the link, since they have no panel.
- Tests: `tests/unit/similar.test.ts`, `tests/e2e/card-swap.spec.ts`, fixture additions in Slice 5.

## Task 1: Tap a card, see similar cards that fit

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

- [x] **Step 1: Failing unit tests** in `tests/unit/similar.test.ts`, with a `card({...})` builder for `ScryCard`:
  - `normalizeText` replaces the card's own name with `~`, drops parenthesised reminder text, turns digits into `#` and mana symbols like `{G}` into `{m}`, uses the front face only.
  - `similarity` of Arcane Signet vs Sol Ring text is at least 0.35 with a shared `ramp` role; vs Lightning Greaves is below 0.35 without one; a tapped dual land vs an untapped dual land is at least 0.6; empty text vs empty text is 0 (no NaN).
  - `similarTo` drops a nonland for a land tapped card and a land for a nonland tapped card; drops a candidate that matches no deck theme or tribe, shares no role and scores under `FIT_BAR`; keeps one that shares the tribe; orders by similarity then by `suggestion.score`.
- [x] **Step 2: Run** `npx vitest run tests/unit/similar.test.ts`. Expected: FAIL, module missing.
- [x] **Step 3: Implement** `normalizeText`, `similarity` (Jaccard overlap of word pairs of the normalised text, plus `ROLE_BONUS` for a shared role and `TYPE_BONUS` for the same main type via `mainType`, capped at 1) and `similarTo` (fit rule from the spec: tribe or theme match, or shared role, or similarity ≥ `FIT_BAR`; set `betterFit: false` and `differences: []` for now). Add the type fields to `ScryCard`.
- [x] **Step 4: Run** the unit tests. Expected: PASS.
- [x] **Step 5: Failing e2e** `tests/e2e/card-swap.spec.ts` using `edgarEdhrec` fixtures and `seedEdgarDeck` (as `edhrec.spec.ts` does): after Find suggestions, tapping a deck card's name opens a dialog titled with the card, showing its cost, price, text and "In N% of Edgar Markov decks"; the list has at least one option, each with name, price, popularity and text, and shows 10 at most with a "Show more" button when more exist. Existing list-row and grid specs that click the name as a TCGplayer link are updated to the dialog's link.
- [x] **Step 6: Implement** `swapOptions`, `find`, `onUpdate` in the panel (build `Tapped` from the deck card's `ScryCard`, `roles` map and `edhrecKeepScores`), `cardDialog.ts`, and the trigger in `cardControls` (`deckView.ts`). Dialog: labelled, Escape closes, 44 px targets.
- [x] **Step 7: Run** `npm run check`. Expected: PASS. **Commit** each file separately (project rule), message specific to its change.

## Task 2: Swap, undo, Keep

**Consumes:** Slice 1's dialog and `PanelActions['swap']`.

- [x] **Step 1: Failing e2e** in `card-swap.spec.ts`: pressing Swap on an option replaces the tapped card with it (deck total and card list change), closes the dialog and shows the existing "Swapped X → Y" undo, which restores the deck; a Keep card opens the dialog, shows options and its Swap works; the commander and a basic land have no dialog trigger that offers options; after a swap, reopening another card no longer lists the swapped-in card.
- [x] **Step 2: Failing unit test** in `similar.test.ts`: `similarTo` never returns a pool entry whose `oracleId` equals the tapped card's.
- [x] **Step 3: Implement** the Swap button in the dialog calling `swap(tapped.oracleId, option.suggestion.card)`; `swapOptions` rescored against the current deck on each call (use `edhrecScored(edh, ids)`); trigger hidden for the commander and basic lands.
- [x] **Step 4: Run** `npm run check`; **commit** per file.

## Task 3: Better fit and the comparison line

**Interfaces — Produces:** `compare(a: ScryCard, b: ScryCard): string[]` in `similar.ts`, at most 3 short phrases, in this order: cost ("Costs 1 less" / "Costs 2 more", from `cmc`), tapped state ("Enters untapped instead of tapped", only for an unconditional "enters tapped" on one side and none on the other), colors made ("Also makes {U}", "No longer makes {R}", from `produced_mana`), stats ("3/3 instead of 2/2", creatures only), keywords ("Gains flying", "Loses lifelink", from `keywords`). Anything not in this list is never claimed. `BETTER_MARGIN = 0.1` exported beside the other constants.

- [x] **Step 1: Failing unit tests**: Arcane Signet vs Commander's Sphere gives `["Costs 1 less"]`; an untapped vs a tapped dual gives `["Enters untapped instead of tapped"]`; a conditional "enters tapped unless" is not claimed; two cards with no listed difference give `[]`; `betterFit` is true at a score gap of 0.1 and false at 0.09; a tapped card with score 0 flags every positive-score option.
- [x] **Step 2: Run, see FAIL; implement** `compare` and fill `betterFit` and `differences` in `similarTo`.
- [x] **Step 3: Failing e2e**: an option shows "Better fit" only when its inclusion-plus-synergy score is higher than the tapped card's, shows its comparison line when `differences` is non-empty and none when empty, and a tapped card the page doesn't list shows "Not on this commander's page".
- [x] **Step 4: Implement** the flag, the line and the note in `cardDialog.ts`; `listed` comes from the panel. **Run** `npm run check`; **commit** per file.

## Task 4: Loading, failure and the rules fallback

- [x] **Step 1: Failing e2e**: tapping a card before Find suggestions shows a loading line, starts the same load (no second EDHREC request when Find is pressed afterwards, checked on the mock's request log), then fills in; an EDHREC 403 (the `edgarFull` flow) shows options from the rules pool with the note "Matching is approximate" or, when none match, "No similar cards found for this deck yet."; a failed load shows a retry button and leaves the dialog usable; tapping a second card while the first is loading shows the second card's options only.
- [x] **Step 2: Implement** `find()` reuse (a click on the existing Find button, guarded so a run in progress isn't restarted), `status` and `source` states, `onUpdate` redraw of an open dialog, and a run token so a late reply for a closed or changed dialog is ignored.
- [x] **Step 3: Run** `npm run check`; **commit** per file.

## Task 5: Tune, time and document

- [x] **Step 1: Record** one artifact-heavy commander with many mana rocks and dual lands into its own flow's fixture map (`RECORD=1 npx vitest run tests/unit/record-fixtures.test.ts`, extended for it); other flows' totals must not move. *(Done: one commander, Breya, Etherium Shaper, recorded 2026-11-06 into its own `tests/fixtures/edhrec-breya.json`; `RECORD=1` recorder extended.)*
- [x] **Step 2: Failing fixture tests** in `similar.test.ts`: on the Edgar page, Skullclamp's options are draw or artifact cards and exclude Sol Ring; on the new commander, a mana rock's options are all mana rocks and a dual land's all lands. Tune the starting constants until these pass, and write the final values and the three commanders checked into this plan under "Tuning results". *(Done, with differences: the fixture tests live in `tests/unit/similar-fixtures.test.ts`, not `similar.test.ts`; two commanders were checked, Edgar Markov and Breya, not three; constants tuned to MIN 0.4, FIT 0.7, ROLE 0.25, TYPE 0.2, see "Tuning results".)*
- [x] **Step 3: Timing test**: `similarTo` plus `compare` over a 290-card pool and a 100-card deck finishes in under 100 ms (`performance.now()`, generous margin for CI). *(Done: in `similar-fixtures.test.ts`, over Breya's 295 page cards, taps from Edgar's 78 different deck cards.)*
- [x] **Step 4: Docs**: set the spec's status to `current`; add a line to CLAUDE.md "Architecture" for `src/lib/similar.ts` and `src/ui/cardDialog.ts`; mark this plan `done`; run `tools/doc-index.sh`.
- [ ] **Step 5: Run** `npm run check` and `tools/doc-index.sh --check`; finish with `/go`. *(Not ticked: `npm run check` and `tools/doc-index.sh --check` ran at each task and again after the final fixes, but finishing with `/go` is still to do.)*

## Tuning results

Tuned 2026-11-06 with `tests/unit/similar-fixtures.test.ts` against real cards: Edgar Markov's bracket 2 page with the seeded 100-card Vampires deck (recorded 2026-11-03), and Breya, Etherium Shaper (W/U/B/R, artifacts), recorded 2026-11-06 into its own `tests/fixtures/edhrec-breya.json` (page, name lookups, role lookups; `trim` keeps `produced_mana`, `power` and `toughness` only when asked, so no other fixture or pinned e2e total moved). Breya was picked because her page holds 20 plain mana rocks (Signets, Talismans, Moxen, Sol Ring) and 22 two-colour lands, the cards the owner's moments are about. Pools are built as the panel builds them: roles are known for the 60 best page cards only, so most candidates have no role and text must carry the match. No Atraxa recording exists, so two commanders were checked, not three.

| Constant | Start | Final | Why |
|---|---|---|---|
| `MIN_SIMILARITY` | 0.35 | 0.4 | Text alone must be a real overlap (4 words or pairs in 10); a role and a type together (0.45) still clear it |
| `FIT_BAR` | 0.6 | 0.7 | Dark Ritual (text 0.60) fitted for Thran Dynamo; no role, tribe or theme tie now needs near-identical text |
| `ROLE_BONUS` | 0.15 | 0.25 | Role tags are real Scryfall Tagger data; alone (0.25) it does not list a card |
| `TYPE_BONUS` | 0.1 | 0.2 | Same main type; still smaller than the role bonus (spec), and alone it does not list a card |
| `BETTER_MARGIN` | 0.1 | 0.1 | Not touched by these checks |

What the starting values did: Skullclamp got no option (Skullclamp, Vanquisher's Banner and Herald's Horn all draw, but their texts share almost no words, so only role plus type can tie them, and 0.15 + 0.1 stayed under 0.35); Mana Vault and Liquimetal Torque got none; Thran Dynamo offered Dark Ritual. A grid over the four constants (computed once per tapped card and candidate, every combination of MIN 0.25 to 0.5, FIT 0.5 to 1.0, ROLE 0.1 to 0.4, TYPE 0.05 to 0.3, with TYPE smaller than ROLE as the spec says) found 39 combinations that pass both checks; 0.4 / 0.7 / 0.25 / 0.2 sits inside a plateau (MIN 0.35 to 0.5, FIT 0.7 to 0.8, ROLE 0.2 to 0.3, TYPE 0.15 to 0.25 all pass), so it does not rest on one card. Round numbers, no logic changed. A role and a type together now reach MIN_SIMILARITY, which reverses the old comment that the bonuses alone stay under it (updated, with its unit test): without it Skullclamp can have no neighbours.

Before and after, top 10 (similarity in brackets):

- **Skullclamp (Edgar)**: before: none. After: Vanquisher's Banner (0.50), Herald's Horn (0.47). Sol Ring is never listed.
- **Thran Dynamo (Breya)**: before: Sol Ring (0.68), Dark Ritual (0.60), Arcane Signet (0.38). After: Sol Ring (0.88), Arcane Signet (0.57), Ashnod's Altar (0.53), Krark-Clan Ironworks (0.53), Ornithopter of Paradise (0.43).
- **Blasphemous Act (Edgar, rules fallback)**: before: none; after: the other board-wipe sorceries (Dusk // Dawn, Fumigate, Martial Coup, Decree of Pain, White Sun's Twilight, Blood Money). The e2e that expected an empty list now taps Cathars' Crusade, which has no role.
- **Haunted Ridge (Edgar)**: before and after the same 12 lands, same order: Shattered Sanctum, Sundown Pass, Vault of Champions, Luxury Suite, Spectator Seating, Smoldering Marsh, Isolated Chapel, Dragonskull Summit, Clifftop Retreat, Bloodfell Caves (scores 0.07 to 0.10 higher; the land rule keeps every option a land).

Other lists after tuning (top 10):

- **Edgar**: Arcane Signet: Commander's Sphere, Phyrexian Altar, Sol Ring, Orzhov Signet, Talisman of Hierarchy (was 4, no Talisman). Sol Ring: Orzhov Signet, Rakdos Signet, Boros Signet, Arcane Signet, Talisman of Hierarchy, Ashnod's Altar. Blood Artist: Falkenrath Noble, Vengeful Bloodwitch, Cruel Celebrant, Sanctum Seeker, Cordial Vampire, Marauding Blight-Priest, Butcher of Malakir, Edgar, Ancient Bloodlord, Dusk Legion Zealot (was 6). Vampire Nighthawk: Vampire of the Dire Moon, Gifted Aetherborn.
- **Breya**: Sol Ring: the six Signets, Ashnod's Altar, Krark-Clan Ironworks, Arcane Signet, Ornithopter of Paradise. Fellwar Stone: Arcane Signet, Ornithopter of Paradise, Sol Ring, Ashnod's Altar, Krark-Clan Ironworks (was 2). Mind Stone (ramp and draw): Sol Ring, Ashnod's Altar, Krark-Clan Ironworks, Arcane Signet, Skullclamp, Mystic Forge, Baleful Strix, Jhoira, Weatherlight Captain (was 4; the draw cards come from its draw role). Hallowed Fountain: the five other shock lands. Mistvault Bridge: the other five Bridges, then four three-colour lands (0.95). Adarkar Wastes: Shivan Reef, Caves of Koilos, Battlefield Forge, Ancient Tomb.

Known limits, seen in this data and left alone (no logic change in this task):

- A land whose whole rules text is reminder text (Tundra, Underground Sea, Volcanic Island: "({T}: Add {W} or {U}.)") has no text after normalisation, so it gets no options. 3 of the 22 two-colour lands on Breya's page hit it, which is why the test asks for options on more than 80% of them and not all.
- Command Tower has no options: its one-line "any color in your commander's color identity" text overlaps no land enough.
- A plain mana rock gets other mana rocks only because roles and text agree; Mind Stone and Commander's Sphere (also card draw) get draw artifacts too, by design (shared role).
- Role tags cover 60 candidates, so Thought Vessel or Mana Vault often see a short list (1 to 3 options).

Timing: one tap (`similarTo` with `compare` for each option) over Breya's 295-card pool, for each of Edgar's 78 different deck cards (100 with copies), took 5 to 9 ms for the slowest card on this machine; the test asserts under 100 ms. No optimisation was needed (the tapped card's text is still normalised once per candidate; computing it once per call is the obvious fix if a slower phone needs it).
