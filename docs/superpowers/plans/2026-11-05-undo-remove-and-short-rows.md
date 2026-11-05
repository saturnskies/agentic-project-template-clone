---
description: Two follow-ups from the 2026-11-05 UI critique (29/40) — Undo for removing a card, and shorter phone list rows by showing a quantity only above 1
status: done
updated: 2026-11-05
---

# Undo for removing a card, and shorter list rows

Source: the second impeccable critique, run after the [phone layout plan](2026-11-04-phone-layout.md) (26/40 before, 29/40 after; single-context, no detector). The two issues below were the ones chosen from it. Same rules as before: each slice starts with a failing test, is gated by `npm run check`, and is committed on its own ([testing rules](../../../.claude/rules/testing.md), [UI state rules](../../../.claude/rules/ui-state.md)).

## Findings

| # | Finding | Evidence | Slice |
|---|---|---|---|
| 1 | Removing a card has no undo, and the `×` is now a 44px target next to the Owned checkbox, so a slip costs more | `remove()` in `deckView.ts` drops the card at once; only swaps have Undo | 1 |
| 2 | List rows are tall: a Qty column that reads "1" in nearly every row takes about 45px, squeezing names into two or three lines and pushing Keep and Foil onto extra lines | list view is 8,847px tall for 100 cards at Pixel 7 width | 2 |

## Decisions (change them before building if wrong)

- **Undo is a toast on the Cards pane, not in the suggestions panel.** The swap Undo lives in the panel, which is a different pane on phones. A removal's Undo has to be where you removed it, so it is a small fixed bar above the Cards | Suggestions bar (or at the bottom on wide screens).
- **It lasts 10 seconds, or until the next edit.** A fixed timer is the usual pattern, but a bare timer is hostile to slow users, so any other change to the deck also dismisses it, and Undo only ever restores the last removal (never silently reverts a later edit, which is the rule the swap Undo already follows).
- **Removing one copy of a multi-copy card is undoable too** (Swamp ×N goes back to ×N).
- **Quantity shows only above 1, and only on phones.** Under 40rem the Qty column is hidden and a card with more than one copy gets "×2" beside its name. Wide screens keep the Qty column. The unit price stays in the Price column; "×2" next to it is what stops "$4.65" reading as the line total.

## Execution routing

| Work | Who | Model | Effort |
|---|---|---|---|
| Slices 1–2 (UI code and tests) | main session | as set | as set |
| Test gate after each slice | `npm run check` | — | — |
| Look at renders | main session, screenshots | — | — |

## Slices

### 1. Undo for removing a card
- [x] Failing tests first (both projects): removing a single-copy card shows "Removed X." with an Undo button and Undo restores the row, the card count and the totals; removing one copy of a multi-copy card (Swamp) and undoing restores the quantity; removing a second card makes Undo restore only the second (the first stays removed); the toast goes away by itself after about 10 seconds (`page.clock`); making another change (adding a card) dismisses it; on a phone the toast sits above the bottom bar and does not cover it, and its Undo button has a 44px target.
- [x] `src/ui/deckView.ts`: `lastRemoval` state next to `lastSwap`, cleared by `commit()` unless it is the removal itself; `remove()` records the deck before the change; a `role="status"` toast with an Undo button, one timer that is cleared on every new removal and on any other commit.
- [x] `src/style.css`: the toast, fixed, above the pane bar below 70rem (`env(safe-area-inset-bottom)`), above the page bottom on wide screens.
- Failure paths: Undo after the list changed under it (another removal or an add) restores only what that removal took away, or does nothing and the toast is already gone; a removal while a swap Undo is on offer ends the swap Undo (the existing `commit()` rule); the timer firing after the screen was left does nothing.
- Built as planned: the offer is a `role="status"` toast (inverted colours, 44px Undo) kept above the bottom bar on phones. Any other change ends it, including a swap, a Keep toggle, an add or a printing change. It restores the whole deck as it was just before that removal.
- Tests: 6 in `tests/e2e/remove-undo.spec.ts` (5 on desktop, the 6th is phone-only), all failing before the code existed.

### 2. Shorter list rows on phones
- [x] Failing tests first (`tests/e2e/list-rows.spec.ts`): under 40rem the Qty header is hidden and a card with several copies shows "×N" beside its name (Swamp ×8) while a single copy shows no mark; the mark follows the quantity when a copy is removed; at 40rem and up the Qty column stays and no mark shows; the phone list is shorter. The first version of the height guard used a stale baseline (8847px, measured before the slice 5 header change; the real baseline was 8486px), so it passed on the old code. It was corrected to the measured figures before the change was kept.
- [x] `src/ui/deckView.ts` and `src/style.css`: the Qty header and cells get `hide-narrow`; a `.qty-mark` span beside the name shows only under 40rem. The Price column keeps the unit price; "×8" next to the name is what stops "$0.09" reading as a line total.
- [x] Result at Pixel 7 width on the seeded 100-card deck: list 8,486px before, 8,026px after (460px, 5.4% shorter). The commander row fits on one line, and Foil now fits on the printing line next to Keep, so no separate Foil change was needed.

## Done when

- `npm run check` passes with the new specs, each shown failing on the old code first.
- A fresh critique (once the engine launcher is allowed, otherwise by hand against renders) scores Error recovery and Minimalist design at least as high as before.

## Follow-ups (not in this plan)

- Hide the List/Grid switch while the Suggestions pane is showing; show a search status on the Suggestions tab.
- Explain "Keep" and "Owned" on first use.
- Self-host the fonts, replace the glyph icons, check the logo font licence.
