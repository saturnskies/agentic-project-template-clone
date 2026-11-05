---
description: Make "Owned" belong to each deck instead of one list shared by every deck, with a migration so no one loses the ticks they already made — two test-gated slices (storage and migration, then the screens)
status: draft
updated: 2026-11-05
---

# Owned belongs to each deck

**Why:** a physical card can only be in one deck at a time. Today one tick follows a card into every deck (a single global `owned` list), so owning Sol Ring for deck A also marks it owned in deck B, and the "Still to buy" total and the suggestions in B are wrong. The owner of the project asked for ownership to stop carrying across decks; the per-deck tick box stays.

This changes saved data, so the rules in [ADR-004](../../decisions/ADR-004-apk-signing-and-data-safety.md) and CLAUDE.md apply: the `swapsmith:v1` storage key and the package id stay as they are, and the change ships with a migration, so nobody's decks or ticks are lost. Same workflow as before: each slice starts with a failing test, is gated by `npm run check` and is committed on its own ([testing rules](../../../.claude/rules/testing.md), [UI state rules](../../../.claude/rules/ui-state.md)).

## Decisions (change them before building if wrong)

- **Where it lives:** two optional fields on each deck, `owned` (Oracle IDs) and `unownedBasics`. A card is owned in a deck only if it is ticked in that deck. Basic lands still count as owned unless unticked, in each deck separately. Cards are still matched by Oracle ID, so owning any printing counts.
- **Migration:** on load, a store that still has the old top-level `owned` / `unownedBasics` lists copies them into each deck, keeping only the cards that deck actually contains. So every deck looks exactly as it did before the update. Nothing is lost, and a card that was ticked everywhere can now be unticked in one deck. The old top-level lists are then dropped and the store's `version` becomes 2 (the key stays `swapsmith:v1`).
- **A deck that already has its own fields is never overwritten**, so an old cached copy of the app that saves the old shape cannot undo the migration.
- **Old backup files** (made before this change) still restore: they go through the same migration. New backups carry the per-deck fields inside each deck.
- **Restore merge:** when a deck is in both the app and a backup, the one edited last wins, with its ticks (they are part of the deck now). The old "combine all owned cards" step is removed.
- **A shared deck is unchanged:** the share link still carries no ownership, and a deck saved from a link starts with only basic lands owned.
- **Suggestions and "Still to buy"** read the open deck's ticks only. The home screen's per-deck "to buy" figure becomes correct per deck as a side effect.

## Slices

### 1. Storage, migration and backup
- [x] Failing unit tests first: an old-shape store (global lists, two decks) loads with each deck holding only the ticks for cards it contains; a card ticked globally and present in both decks is ticked in both; ids not in a deck are dropped; the top-level lists are gone and `version` is 2; a deck that already has its own fields is left alone; loading twice gives the same result; garbage in a deck's fields (non-strings) is dropped; a new-shape store round-trips unchanged; an old-format backup restores with its ticks in the right decks; merging a backup keeps the newer deck together with its ticks and no longer combines lists.
- [x] `src/lib/deck.ts`: the two optional fields. `src/lib/owned.ts`: `deckCollection(deck)`. `src/lib/storage.ts`: `Store` loses the top-level lists, `sanitizeStore` migrates. `src/lib/backup.ts`: merge by deck.
- Failure paths: a store that fails to parse is still backed up under `swapsmith:v1:backup` exactly as now; a deck with a missing commander is dropped by the existing check before migration looks at it.
- Also added, beyond the plan: the first time old shared data is migrated, `loadStore` keeps one untouched copy of it under `swapsmith:v1:before-owned-per-deck` and never overwrites that copy, so a mistake in the migration can never cost anyone their decks. Nothing reads it.
- Built as planned. 12 new unit tests (storage migration cases, old-format backup restore, the per-deck merge, `deckCollection`); unit total 170.

### 2. The screens
- [x] Failing e2e first: ticking a card in one deck leaves it unticked in another deck that contains it, and each deck's "Still to buy" and the home screen's "to buy" figure use only its own ticks; ticks survive a reload; suggestions in deck B ignore deck A's ticks (cheaper replacements still appear for a card owned only in A); a store saved in the old shape (global ticks, two decks) opens with each deck's ticks intact; a deck saved from a share link starts with only basics owned. The existing test "owned cards are remembered across reloads and shared by every deck" is replaced by these, since it asserts the rule being removed.
- [x] `src/ui/deckView.ts`, `src/ui/suggestions.ts`, `src/ui/app.ts`: ticking writes to the open deck; `ctx.setOwned` and the store-level lists are removed (one pattern, not two); suggestions get the deck's collection.
- [x] Update the spec lines that say ownership is shared ([spec](../specs/2026-11-02-swapsmith-design.md)) and the share-dialog wording stays true ("Your owned cards are not included").
- Built as planned, with one addition: ticking a card also updates the deck's `updatedAt`, because ownership is part of the deck now and a restore keeps whichever copy was edited last. Four e2e tests in `tests/e2e/owned.spec.ts` (replacing the one that asserted shared ownership): ticks stay in one deck and the home screen's per-deck "to buy" figures follow, a tick in deck A leaves deck B unticked, suggestions in B ignore what is owned in A, and data saved in the old shape opens unchanged and then separates. The spec is updated ("Decisions after review").

## Done when

- `npm run check` passes with the new tests, each shown failing on the old code first.
- Opening the app with data saved by the previous version shows every deck with the same ticks and totals as before.
- No code reads a store-level `owned` any more.
