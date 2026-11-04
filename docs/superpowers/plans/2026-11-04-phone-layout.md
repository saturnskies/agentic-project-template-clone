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
- [ ] (Not done: only the deck, suggestions and paste screens are covered by tests; home, new deck and the picker dialog still need a look.) Check dark mode on every screen the e2e fixtures reach (home, new deck, paste, deck, picker dialog, suggestions) at phone width, plus the picker `dialog::backdrop`.
- Failure paths: a colour that cannot be parsed (transparent, `color-mix`) makes the test fail loudly, never pass; the test must prove it fails on the old CSS before trusting it.

### 2. Empty alert box on Home
- [ ] Failing test first: on Home with no backup message, no element with `role="alert"` is visible (`toBeHidden` after the page settles).
- [ ] `src/style.css`: `.notice:empty { display: none; }`. Check other `.notice` and `.banner` users for the same bug while in there.

### 3. Touch targets (44px hit areas)
- [ ] Failing test first, `phone` project, both schemes: for the remove button, Keep chip, Owned checkbox, `.button.small`, `.segment`, and the sort headers, a 44×44px square centred on the control resolves (`elementFromPoint` at its four corners and centre) to that control or its own label. Also assert no two adjacent controls claim the same point.
- [ ] `src/style.css`, inside `@media (pointer: coarse)`: pseudo-element or padding hit areas; larger Owned label that wraps the checkbox; `.segment` min-height 44px (a visible change, it is a primary control).
- [ ] `src/ui/deckView.ts`: the `×` button gets a visible text label or stays icon with the larger target; decide while building and note it. Removing a card still has no undo here; **follow-up**, not in this plan.
- Check: the row height must not grow more than about 8px per row (the table must stay scannable at 100 rows).

### 4. Cards | Suggestions switch below 70rem
- [ ] Failing tests first (phone, both schemes): after Find suggestions, the switch is visible without scrolling; pressing Suggestions shows the panel in the first viewport and hides the card list; pressing Cards restores the list at the same scroll position; adding a suggested card then switching back shows the new count; Undo still works with the panel hidden; the browser back button from the deck still goes to Your decks and is not consumed by the switch; a shared read-only deck shows no switch.
- [ ] `src/ui/deckView.ts`: the switch and a `data-pane` attribute on `.deck-columns`; panel stays mounted. A `matchMedia('(min-width: 70rem)')` listener resets to the two-column layout on rotate or resize.
- [ ] `src/style.css`: hide the inactive pane with `hidden` or `[data-pane]` rules, sticky bottom bar with safe-area padding, and bottom padding on `main` so the bar never covers the last row.
- Failure paths: a Find that is still running when the user switches away (the `run` guard in `suggestions.ts` already drops stale replies; add a test that the status text is still there on return); focus returns to the pressed switch button.

### 5. Deck header hierarchy (optional; see decisions)
- [ ] Failing tests first: `deck-to-buy` is the largest text in the stats area; `deck-total` and `deck-count` stay (testids unchanged); no stray empty gap: `exportMsg`, `shareBox` and `note` take no height when empty (`:empty { display: none }`).
- [ ] `src/ui/deckView.ts` and `src/style.css`: "Still to buy" as the one prominent figure, total as secondary text, count as "100 / 100" in the subtitle row.
- [ ] If chosen: one "Share" button opening a `dialog` (reuse the picker pattern) containing Copy, Download and Share link. Update `export.spec.ts` and `share.spec.ts` to the new path in the same commit.

## Done when

- `npm run check` passes with the new specs, and the dark-mode tests were shown failing on the old CSS first.
- The 11 measured items above are re-measured and match: contrast numbers, target sizes, suggestions reachable in one tap.
- A fresh critique run (`/impeccable critique`, after the engine launcher is allowed) scores the deck screen at least as high as the 26/40 baseline.
- `docs/toolbox.md` and CLAUDE.md need no change; if a new convention appears (the `--accent-text` token rule), add it to `.claude/rules/` with `paths: src/style.css`.

## Follow-ups (not in this plan)

- Undo for removing a card.
- Self-host Bricolage Grotesque (it loads from Google Fonts; the service worker only caches same-origin files, so the Android app and an offline PWA fall back to the system font), and confirm the `godofwar.ttf` logo font licence.
- Replace Unicode glyph icons (`×`, `▾`, `←`) with one drawn icon set.
- Explain "Keep" and "Owned" on first use (the `title` tooltip never shows on a phone).
