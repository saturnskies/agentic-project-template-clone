---
description: A short first-use note explaining Owned and Keep above the card list, dismissed for good with "Got it" — one test-gated slice
status: done
updated: 2026-11-05
---

# Explain Keep and Owned

**Why:** the second critique scored Help 2/4: on a phone there is no hover, so what "Owned" and "Keep" mean was only in a tooltip nobody sees. "Keep" is staying as a name (the owner likes it); it just needs one plain explanation, written for the per-deck Owned rule ([owned per deck](2026-11-05-owned-per-deck.md)).

## Decisions (change them before building if wrong)

- **One note, shown the first time, then gone for good.** Two short lines (what Owned does, what Keep does) and a "Got it" button. No always-on caption: the list header was just made shorter and an always-on note would take that space back.
- **Wording:** "**Owned**: tick the cards you already have for this deck. They come off Still to buy. Other decks keep their own ticks." and "**Keep**: suggestions never cut or replace that card."
- **Where:** at the top of the Cards pane, so on a phone it is hidden while the Suggestions pane shows. Not on a shared, read-only deck (it has neither control).
- **Remembered per device, not per deck**, as one optional preference (`prefs.helpDismissed`). It is additive: old data without it just shows the note once, nothing is migrated, and an older copy of the app ignores it.
- **Not built:** a way to bring the note back. If it turns out people dismiss it by reflex, add a "?" next to the list/grid switch.

## Slice

- [x] Failing tests first: a first-time visitor sees the note with both terms and "Other decks keep their own ticks"; "Got it" removes it and it stays gone after a reload; dismissing in one deck means no note in another deck; on a phone it is hidden while the Suggestions pane shows; a shared read-only deck never shows it; its button is a 44px target; unit tests that the preference is kept only when it is exactly `true`, survives a save and load, and is absent by default. Existing specs that measure the header or the first cards start with the note already dismissed (the seeded store says so), as a returning user would.
- [x] `src/lib/storage.ts` (the preference), `src/ui/app.ts` (`dismissHelp`), `src/ui/helpTip.ts` (new), `src/ui/deckView.ts` (the note at the top of the Cards pane), `src/style.css`.
- Failure paths: storage that is blocked or full means the note comes back next visit, which is harmless; a backup restore keeps the current device's preference (the existing merge keeps current prefs).

- Built as planned. Tests: 3 e2e specs in `tests/e2e/help-tip.spec.ts` (first visit, device-wide dismissal, phone pane and 44px button), one assertion in `share.spec.ts` (a read-only deck has no note) and 3 unit tests for the preference. `seedEdgarDeck` now starts as a returning user (note dismissed) unless `{ firstVisit: true }` is passed, so the layout measurements in other specs are unchanged.

## Done when

- `npm run check` passes with the new tests, each shown failing on the old code first.
- Opening a deck for the first time explains Owned and Keep without hover, and the note never comes back after "Got it".
