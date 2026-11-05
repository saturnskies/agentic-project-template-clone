---
description: Two follow-ups from the 2026-11-05 UI critique (29/40) — Undo for removing a card, and shorter phone list rows by showing a quantity only above 1
status: draft
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
- [ ] Failing tests first (both projects): removing a single-copy card shows "Removed X." with an Undo button and Undo restores the row, the card count and the totals; removing one copy of a multi-copy card (Swamp) and undoing restores the quantity; removing a second card makes Undo restore only the second (the first stays removed); the toast goes away by itself after about 10 seconds (`page.clock`); making another change (adding a card) dismisses it; on a phone the toast sits above the bottom bar and does not cover it, and its Undo button has a 44px target.
- [ ] `src/ui/deckView.ts`: `lastRemoval` state next to `lastSwap`, cleared by `commit()` unless it is the removal itself; `remove()` records the deck before the change; a `role="status"` toast with an Undo button, one timer that is cleared on every new removal and on any other commit.
- [ ] `src/style.css`: the toast, fixed, above the pane bar below 70rem (`env(safe-area-inset-bottom)`), above the page bottom on wide screens.
- Failure paths: Undo after the list changed under it (another removal or an add) restores only what that removal took away, or does nothing and the toast is already gone; a removal while a swap Undo is on offer ends the swap Undo (the existing `commit()` rule); the timer firing after the screen was left does nothing.

### 2. Shorter list rows on phones
- [ ] Failing tests first: under 40rem the Qty header and column are hidden and a card with several copies shows "×N" beside its name (Swamp), while a single copy shows no mark; at 40rem and up the Qty column is still there and no "×N" mark shows; the phone list is shorter than the 8,847px it was (guard set from the measured result, with a little slack); the existing touch-target and layout tests still pass.
- [ ] `src/ui/deckView.ts` and `src/style.css`: Qty `th` and `td` get `hide-narrow`; a `.qty-mark` span beside the name shows only under 40rem.
- [ ] Look at rows with Foil and a pressed Keep chip: if Foil still wraps onto its own line, put it on the printing line.

## Done when

- `npm run check` passes with the new specs, each shown failing on the old code first.
- A fresh critique (once the engine launcher is allowed, otherwise by hand against renders) scores Error recovery and Minimalist design at least as high as before.

## Follow-ups (not in this plan)

- Hide the List/Grid switch while the Suggestions pane is showing; show a search status on the Suggestions tab.
- Explain "Keep" and "Owned" on first use.
- Self-host the fonts, replace the glyph icons, check the logo font licence.
