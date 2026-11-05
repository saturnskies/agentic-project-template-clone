---
description: Phone layout fixes from the 2026-11-04 UI critique, dark mode first — five test-gated slices (dark contrast, empty alert bug, touch targets, Cards|Suggestions switch, deck header)
status: draft
updated: 2026-11-04
---

# Phone layout fixes (dark mode first)

Source: the impeccable critique of 2026-11-04, checked by rendering the app at Pixel 7 size with the recorded Edgar deck. Numbers below were measured or computed, not guessed. Stack and test rules are unchanged ([ADR-001](../../decisions/ADR-001-swapsmith-stack-and-hosting.md), `.claude/rules/testing.md`, `.claude/rules/ui-state.md`). Each slice is gated by `npm run check`, starts with a failing test, and is committed on its own.

## Findings this plan fixes

| # | Finding | Evidence | Slice |
|---|---|---|---|
| 1 | Dark accent `#c0202b` used as text fails 4.5:1 (links, "Save $x", pressed Keep chip, logo "Smith", focus ring) | 2.57:1 on panel, 2.89:1 on page, 2.10:1 on tag | 1 |
| 2 | Text-field borders (`--line`) are nearly invisible in both themes | `#3a3a3a` on `#242424` is about 1.4:1; needs 3:1 (WCAG 1.4.11) | 1 |
| 3 | `theme-color` is fixed `#000000` | `index.html:10`; page is light or `#1a1a1a` | 1 |
| 4 | Empty bordered box under "Back up my decks" | `.notice` has no `:empty` rule (`backup.ts:9`) | 2 |
| 5 | Touch targets too small | remove 32px, Keep 44×19, Owned checkbox 18px, small buttons 32px, segments 34px | 3 |
| 6 | Suggestions are 10.5 screens down on a 100-card deck | panel top at 8822px of 9318px; viewport 839px | 4 |
| 7 | Deck header has no hierarchy | "Still to buy" same size as total; "Cards / 100 / 100 cards"; about 100px of empty gap | 5 |

## Decisions (change them before building if wrong)

- **Dark first.** Slice 1 ships alone and is safe to release by itself.
- **New tokens, not new colours for fills.** Keep `--accent` for fills (white on it is 6.03:1). Add `--accent-text` for anything that is text or a ring: dark `#ff6b73`, light `#8a0f1a` (the same as today's accent, 8.75:1).
- **`--field-line: #767676` in both themes** for text-field borders (3.4:1 or better on every surface). Buttons keep `--line`: their text names them, so no border contrast is required.
- **Hit areas, not row growth.** Touch targets reach 44px with padding or a pseudo-element under `@media (pointer: coarse)`, so a 100-row list does not get longer. Visible sizes stay. Controls must not overlap neighbours' hit areas.
- **Switch, not tabs, under 70rem.** The two-column layout starts at 70rem, so below it the deck shows a `Cards | Suggestions` switch (same `aria-pressed` segmented pattern as List/Grid, for consistency). It is sticky at the bottom of the screen for thumb reach, with `env(safe-area-inset-bottom)`. The suggestions panel stays mounted when hidden, so `panel.refresh()` and Undo keep working (ui-state rule: redraw everything a change feeds). Switching does not touch history, so the Android back gesture in `native.ts` is unchanged. A read-only shared deck has no panel and no switch.
- **Slice 5 changes visible button names** (Copy / Download / Share move into one menu), which existing e2e specs click by name. Update those specs to the new path; never weaken them. If you would rather keep the buttons, drop slice 5 and keep only the stat hierarchy.

## Execution routing

| Work | Who | Model | Effort |
|---|---|---|---|
| Slices 1–5 (CSS, UI code, tests) | main session | as set | as set |
| Test gate after each slice | `npm run check` | — | — |
| Look at renders (yes/no per checklist) | haiku agent with Playwright screenshots | haiku | low |
| Review before PR | code review agent | sonnet | high |

## Test support (built in slice 1, reused after)

- `tests/support/contrast.ts`: `contrastRatio(fg, bg)` and a parser for computed `rgb()` colours. Unit-tested in `tests/unit/contrast.test.ts` against known pairs (for example `#ffffff` on `#000000` is 21).
- `tests/e2e/phone-layout.spec.ts`: runs on the `phone` project only (`test.skip` on `desktop`) and for both colour schemes (`page.emulateMedia({ colorScheme })`). Uses `seedEdgarDeck` and `mockScryfall(edgarFull)` from `helpers.ts`. Never asserts prices: re-recording fixtures moves them.
- Contrast tests read computed styles from the real page and walk up to the nearest opaque background, so they check what ships and not the token table.

## Slices

### 1. Dark mode contrast, field borders, theme colour
- [x] Failing tests first. In `phone-layout.spec.ts`, for dark and light: link text, `.save`, a pressed `.keep-toggle`, the logo's `span`, and the focus ring colour each reach their threshold against their real background (4.5:1 text, 3:1 ring and large text); a focused text input's border reaches 3:1.
- [x] `src/style.css`: add `--accent-text` and `--field-line` (both schemes). Use `--accent-text` in `a`, the focus rule (`a`, `button`, `input`, plus `textarea`, `select`, `summary`, `[tabindex]`), `.site-header h1 span`, `.link-button:hover`, `.keep-toggle[aria-pressed="true"]`, `.save`. Use `--field-line` on `input[type=text]`, `textarea`, `select`. Leave fills on `--accent`.
- [x] `index.html`: two `theme-color` metas with `media="(prefers-color-scheme: …)"` matching header surface colours. Check that `public/manifest.webmanifest` `theme_color` still agrees.
- [x] Check dark mode on every screen the e2e fixtures reach (home, new deck, paste, deck, picker dialog, suggestions) at phone width, plus the picker `dialog::backdrop`.
- Failure paths: a colour that cannot be parsed (transparent, `color-mix`) makes the test fail loudly, never pass; the test must prove it fails on the old CSS before trusting it.

### 2. Empty alert box on Home
- [x] Failing test first: on Home with no backup message, no element with `role="alert"` is visible (`toBeHidden` after the page settles).
- [x] `src/style.css`: `.notice:empty { display: none; }`. Check other `.notice` and `.banner` users for the same bug while in there.
- [x] Added with it, from the dark-mode screenshots: a disabled button is restyled (muted label on the tag surface) instead of faded to half opacity, which left its label at about 3:1.

### 3. Touch targets (44px hit areas)
- [x] Failing test first, `phone` project: for every kind of control (links, buttons, segments, sort headers, printing links, Keep chips, remove buttons, checkboxes, text fields), a 44px square around the control, probed at its centre and four edge midpoints, lands on that control or its own label. Corners are not probed: rounded controls legitimately don't claim them. A neighbour's larger target covering a control fails the same check.
- [x] `src/style.css`, inside `@media (pointer: coarse)`: real 44px height on buttons, segments, sort headers, printing links, text fields and the back link; 44px remove button; the Owned checkbox is tapped through a 44px label (`.own-cell` in the table, `.own-label` in the grid); the Keep chip keeps its small look and gets a taller tap area (`::after`).
- [x] **Changed from the first plan:** hit areas alone could not work for the Keep chip, because it sat stacked between the name and the printing link, so enlarged areas overlapped. On phones, Keep now shares the printing line (`src/ui/deckView.ts`; the desktop copy is hidden under 40rem). The "rows grow at most 8px" check became height guards instead: the list may not get longer than before (9318px; now 8847px), and the grid may grow at most 15% (16542px before; now 18271px, +10%, from 44px tool rows).
- [x] The `×` stays an icon, now 44px. Removing a card still has no undo (follow-up below).
- [x] Grid tool rows (Owned, Keep, remove) stay on one line even with a pressed (bold) Keep chip: checked by a test that fails when the spacing fixes are undone.
- Narrower phones (about 360px) still wrap the grid tool row onto two lines; the layout holds, just taller.

### 4. Cards | Suggestions switch below 70rem
- [x] Failing tests first (phone, 10 tests, all failing before the code existed): the bar is on screen without scrolling and stays on screen while the list scrolls; Suggestions shows the panel in the first viewport and hides the list; Cards brings the list back at the same scroll position; a card added from suggestions is in the list when you switch back; ticking Owned in the list updates suggestions while they are hidden; Undo is still offered after leaving and returning; leaving while a search runs does not lose it; switching does not change history length or the URL hash; the pressed button keeps focus; a wide screen shows both with no bar, and narrowing again keeps the chosen pane.
- [x] `src/ui/panes.ts` (new): the bar. It only sets `data-pane` on `.deck-columns`; each pane keeps its own scroll position, and Suggestions opens with the panel at the top the first time. Neither pane is removed, so the panel keeps refreshing while hidden.
- [x] `src/style.css`: below 70rem a fixed bottom bar (safe-area padding, `body:has(.pane-bar)` bottom padding so the last card and footer stay reachable) and the inactive pane is hidden; from 70rem up the bar is hidden and both panes show. CSS alone decides this, so resizing or rotating needs no script and no `matchMedia` listener.
- [x] A shared read-only deck has no bar: `share.spec.ts` asserts it.
- [x] Existing specs updated, not weakened: `suggestions.spec.ts` now opens the pane it needs (a `showPane` helper that does nothing on wide screens) and looks at the list while the list is showing, so "this row is gone" checks are not vacuous against a hidden list.
- The `Add a card` field and the List/Grid switch stay visible above the Suggestions panel; List/Grid controls a hidden list there. Left as is; see follow-ups.

### 5. Deck header hierarchy
- [x] Failing tests first (phone): "Still to buy" has the largest font of the three figures, and the card count sits on the commander line (`deck-count` testid kept); empty message slots take no space (any zero-height, non-hidden child of a grid or flex container is a failure; the first version of this test only measured elements with a height, passed on the old code, and was fixed before the implementation); the first cards are on the first screen (list header 696px down before, 520px after); copy, download and share are behind one button and Escape closes it and returns focus to it.
- [x] `src/ui/deckView.ts` and `src/style.css`: "Still to buy" is the one prominent figure (`.stat-hero`), the deck total is small text under it, and the count moved onto the commander line. The three stat cards and `.stat-value` are gone (migration finished, no second pattern). `.muted:empty, .stack:empty` hide empty message slots.
- [x] One `Share & export` button (a shared, read-only deck gets `Export`) opens a dialog (the same `dialog` pattern as the printing picker, so the Android back button already closes it) with Copy deck, Download .txt and Copy share link. The link button is now labelled "Copy share link" (it makes the link and copies it); a read-only deck has no link button.
- [x] `export.spec.ts` and `share.spec.ts` updated to open the dialog first; share.spec also checks that a friend's read-only deck can Copy and Download but has no link button, and that Close works.
- On wide screens the Share & export button sits at the far right of the stat row, away from the stat block. Fine for now.

## Done when

- `npm run check` passes with the new specs, and the dark-mode tests were shown failing on the old CSS first.
- The 11 measured items above are re-measured and match: contrast numbers, target sizes, suggestions reachable in one tap.
- A fresh critique run (`/impeccable critique`, after the engine launcher is allowed) scores the deck screen at least as high as the 26/40 baseline.
- `docs/toolbox.md` and CLAUDE.md need no change; if a new convention appears (the `--accent-text` token rule), add it to `.claude/rules/` with `paths: src/style.css`.

## Follow-ups (not in this plan)

- Undo for removing a card.
- Hide the List/Grid switch (and maybe Add a card) while the Suggestions pane is showing.
- Pickers and dialogs (the printing picker's buttons) were not covered by the touch-target test.
- Self-host Bricolage Grotesque (it loads from Google Fonts; the service worker only caches same-origin files, so the Android app and an offline PWA fall back to the system font), and confirm the `godofwar.ttf` logo font licence.
- Replace Unicode glyph icons (`×`, `▾`, `←`) with one drawn icon set.
- Explain "Keep" and "Owned" on first use (the `title` tooltip never shows on a phone).
