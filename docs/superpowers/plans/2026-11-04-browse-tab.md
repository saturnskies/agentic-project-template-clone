---
description: Browse tab build plan — five test-gated vertical slices from a first search with a result grid to every filter, Load more, the card detail, and Add to deck with New deck
status: current
updated: 2026-11-04
---

# Browse tab: build plan

Builds the [Browse tab spec](../specs/2026-11-04-browse-tab.md) on top of the merged [tab bar and Life Counter](2026-11-04-tab-bar-life-counter.md) (the `#/browse` route and kept-place container exist). Each slice works end to end in the browser. Every test is written first and seen failing for the right reason. Before a slice is committed, `npm run check` must pass, and the change must be tried in the dev server at a phone width (390 px) with a screenshot that is actually looked at.

**Layout:**
- `src/lib/browse.ts` — pure: filter shape, `buildQuery`, escaping, validation, sort options, preference sanitizer. Unit tests in `tests/unit/browse.test.ts`.
- `src/scryfall/browse.ts` — `searchCards(client, query, sort, dir, page)`, the only new Scryfall call, through the shared client.
- `src/ui/browse.ts` — form, results, detail dialog; `src/ui/app.ts` — passes `ctx` in, owns the Decks stale flag.
- `tests/e2e/browse.spec.ts` (search, filters, paging, detail) and `tests/e2e/browse-decks.spec.ts` (Add to deck, New deck, Decks refresh). Fixtures: `tests/fixtures/scryfall-browse.json`, recorded from real Scryfall.

**Reuse (ladder rung that held):** `h()`, `segmented()` (`controls.ts`), `<dialog>`, `<select>` (2, 4); the shared client with its queue, 429 retry and cache (2); `printings()`, `bestPrice`, `tcgplayerUrl` (2); `isOwned`/`setOwned` and `ctx.setOwned` (2); `cardWarnings`/`warningText`/`isBasicLand` for the colors and duplicate checks (2); `combobox`, `searchCommanders`, `buildDeck` for New deck… (2); `cardsByOracleId` to read the commander's colors (2); `POOL_ROLES` and the `tokens` theme query (2); `browserStorage()` and the sanitizer pattern from `life.ts` (2). New code (rung 6): the query builder, `searchCards`, the Browse screen. Types extended, not duplicated. No new dependency.

**Fixtures.** `trim()` in `tests/support/fixtures.ts` keeps a fixed list of card fields and shrinks `legalities` to Commander. Slice 1 adds `mana_cost`, `rarity`, `cmc`, `keywords` to `CARD_KEYS` and a full-`legalities` option used only by the Browse recording, so other fixtures are unchanged until re-recorded. Slice 1 records `scryfall-browse.json` with `RECORD=1 npx vitest run tests/unit/record-fixtures.test.ts -t Browse`: the searches the e2e tests make (each sort, page 1 and 2, a 404, a 400 with Scryfall's own message) and printings for the detail card. The mock answers by recorded request key; a request with no recording is a test failure (the `misses` list), never an invented reply.

## Execution routing

| Work | Who | Model | Effort |
|---|---|---|---|
| Slices 1–5 (code and tests) | main session | as set | as set |
| Fixture recording (live Scryfall) | main session, one script run | — | — |
| Test gate after each slice | `npm run check`, in the background, not polled | — | — |
| Code review before PR | the single `/go` review agent | sonnet | high |

No other subagents. Docs-only commits get no review.

## Slices

### 1. First search: name, Commander-legal, advanced, grid, sort
- [x] `lib/browse.ts`: `buildQuery(filters)` for name, Commander-legal and advanced (advanced wrapped in parentheses and ANDed); quote and backslash escaping; length check (over 900 characters → an error naming the advanced box, never truncated); sort options → `order`/`dir`. Unit tests first, including `or` inside advanced not escaping the toggles, and 899 / 901 characters.
- [x] `types.ts` gains `mana_cost`, `rarity`, `cmc`, `keywords`, full `legalities`; `trim` and `CARD_KEYS` as above; record `scryfall-browse.json`.
- [x] `scryfall/browse.ts` `searchCards`: one call through the client with `unique=cards`; returns cards, `has_more`, `total_cards`. 404 → empty result; 400 → an error carrying Scryfall's `details`; anything else rethrown.
- [x] `ui/browse.ts`: form (name, Commander-legal toggle on by default, advanced box with a syntax link, Search, hint before the first search), "Searching: …" line, image grid (lazy images, name, price, Owned badge as text), sort control with direction, run number so a stale reply is dropped. `renderBrowse(view, ctx)`; `app.ts` passes `ctx`.
- [x] E2E (`browse.spec.ts`, both projects): opening the tab fetches nothing; Search lists the recorded cards in the grid with names and prices; changing sort re-runs from page 1; the grid and form fit at 390 px; text and results survive a visit to Decks and back (scroll too).
- **Failure paths:** no matches (404) → "No cards match"; a 400 from the advanced box → Scryfall's message under that box and the previous results stay; network failure → retry message and previous results stay; query over 900 characters → no request is sent; **slow first search overtaken by a second**: the older reply is dropped (test holds the first reply back and fails with the run guard removed); Search pressed twice quickly asks once per distinct query; image-less cards (a double-faced card's first face, a card with no image) still render.
- **Done 2026-11-04.** Unit: 11 query tests, 7 search tests. E2E: 15 browse tests pass in both projects. `npm run check`: 386 unit and 264 e2e tests pass.
  - Added to the slice: Scryfall's `warnings` (200 with an ignored term) are shown above the results, and unbalanced parentheses in the advanced box are refused before searching, because the wrapper would otherwise be escaped.
  - A real 400 can't come from the form, so `searchCards` is tested against a recorded real 400, and the e2e test answers a form-reachable search with that recorded body. The 503 test uses Scryfall's generic error shape, not a recorded reply.
  - Mutation checks: with the run guard removed ("slow earlier search") and with the same-search guard removed ("twice quickly") the tests fail.
  - `trim()` keeps `mana_cost`, `cmc`, `rarity`, `keywords` and, for the Browse recording only, every legality. The fixture is 484 KB.
  - Still to do for the live check: `searchCards` against the real API (`SCRYFALL_LIVE`), before review.
  - On a phone the form fills most of the first screen; slice 3 must keep the extra filters compact (collapsible).

### 2. Load more
- [x] `searchCards` takes `page`; the UI keeps the run's query, appends the next page, shows "Showing 175 of 1,204", hides the button when `has_more` is false, disables it while a page is in flight.
- [x] E2E: page 1 then Load more appends page 2 (counts pinned at the recorded values, not ranges); the button disappears on the last page.
- **Failure paths:** page 2 fails → the loaded cards stay, a message and a retry show, and a retry that succeeds appends once; a new search while a page is in flight → the late page is dropped and does not append to the new results (fails with the run guard removed); Load more clicked twice → one request; changing sort while a page loads → same drop.
- **Done 2026-11-04.** `npm run check`: 386 unit (11 live ones skipped) and 280 e2e tests pass; 8 new Load more tests in each project.
  - The button belongs to the results on screen. It is disabled while a new search is waiting (the old results stay up meanwhile) and while a page is in flight, and any new search or sort change drops a page still on its way.
  - A search fits on one page when it has 175 matches or fewer, and then there is no button. The recorded multi-page search is `name:"sol"` (187 matches: 175, then 12), plus the same search by price; `scryfall-browse.json` is now 813 KB, the big searches recorded with Commander legality only.
  - The failed-page test answers page 2 with Scryfall's generic 503 error shape (not a recorded reply), once, then lets the recorded page through.
  - Mutation checks, each failing its test: the run guard in `loadMore` removed (new-search and sort-change tests); both the in-flight guard and the disabled state removed (pressed twice; either alone is enough to hold, so both go); the button always shown (page-one and last-page tests); not disabled during a waiting search.
  - Not built: dropping a card Scryfall repeats across pages if prices reorder the list between requests.


### 3. Every filter, list view, preferences
- [x] `buildQuery` for set (code), type, tribe, keyword, role (`POOL_ROLES` plus the `tokens` theme query), color identity (within / exactly / includes, Colorless), mana value range, rarity set, price range. Unit tests at both sides of each bound, and the escaped forms.
- [x] Inline validation before any request: set code shape, tribe and keyword characters, min above max (mana value and price), non-numeric or negative values, price with more than two decimals. Reset clears filters, not preferences.
- [x] List view and the grid/list toggle; the price-filter note ("cards with no USD price are left out").
- [x] Preferences (`view`, `sort`, `descending`, `commanderLegal`) saved under `swapsmith:browse` with a sanitizer: wrong shapes → defaults, unknown future `version` left alone. Unit-tested like `life.ts`.
- [x] E2E: each filter changes the "Searching:" line and the request (asserted on the recorded key); list view shows mana cost, type line and rarity; preferences survive a reload; the form (many controls) is usable at 390 px with no horizontal scroll.
- **Failure paths:** every invalid input blocks Search with a message and sends nothing (test each); the combined query over 900 characters from filters plus advanced; storage blocked or full → works, nothing saved; invalid JSON in `swapsmith:browse` → defaults (and `swapsmith:v1` untouched; a test asserts the deck store key is never written by Browse preferences); `or` in advanced with the toggles still applied.
- **Done 2026-11-04.** `npm run check`: 419 unit (12 live ones skipped) and 350 e2e tests pass. New: 44 query and preference unit tests, 35 filter e2e tests, and 13 real sample searches (`tests/support/browse-samples.ts`) shared by the unit test, the recorder, the live test and the e2e tests.
  - The extra filters sit in a collapsible "More filters" section (closed by default); the advanced box and Commander-legal stay outside it. An error in a filter opens the section.
  - The form reports the first error in form order, one at a time.
  - Colorless is its own choice: picking it clears the colors and picking a color clears it, so "colorless plus a color" can only come from the builder (unit-tested).
  - Browse preferences (`view`, `sort`, `descending`, `commanderLegal`) live under `swapsmith:browse`, loaded by `loadPrefs` (bad data repaired field by field, a newer version left alone and never overwritten); the e2e tests assert `swapsmith:v1` is byte-for-byte unchanged.
  - The live test (`SCRYFALL_LIVE=1`) sends all 13 sample queries to Scryfall and fails on any ignored-term warning or empty result.
  - Mutation checks, each failing its test: set-code validation off; the error not reopening the filters (8 tests); the newer-version guard off; `savePrefs` letting a full storage throw (the sort change then skips its re-search); Reset also resetting Commander-legal; colorless not exclusive.
  - Role query for token makers is the `tokens` theme query; there is no Tagger tag for it.


### 4. Card detail, Mark as owned, Decks stays in step
- [x] Detail `<dialog>`: image with Flip for double-faced cards, name, mana cost, type line, rules text for every face, Commander legality (text plus color) and an "All formats" disclosure, price with **Buy on TCGplayer**. The cheapest printing loads through `printings()`; if that fails the result's own price shows.
- [x] **Mark as owned / Owned** through `ctx.setOwned`; the result's Owned badge updates.
- [x] `app.ts`: `saveDeck`, `deleteDeck`, `setOwned` and `replaceStore` mark the Decks screen stale when another tab is showing; coming back redraws it once. (Part 1's known follow-up.)
- [x] The dialog closes with Escape, Close, the Android back gesture (existing `dialog[open]` handling), and when the tab is hidden.
- [x] E2E: open a card, see its text, legality and price; Mark as owned, switch to Decks, open the deck that holds that card and the owned count is right; Decks list shows the change without a reload (fails with the stale flag removed); an open detail is closed after switching to Decks, and Decks is clickable; phone screenshot of the detail looked at.
- **Failure paths:** the printings lookup fails or is empty → result price used, no crash; a card with no price → "No price" and no TCGplayer link to nowhere; no Commander legality value → "Unknown"; a double-faced card with only one face image; a card that is a token or has no `oracle_id` (marking owned is disabled with a reason, never a bad id stored); detail opened for card A, then B before A's printings return → A's late reply does not change B (run guard, test fails without it).
- **Done 2026-11-04.** `npm run check`: 426 unit (12 live ones skipped) and 378 e2e tests pass; 14 new detail e2e tests in each project.
  - Each card name is a real button, and the whole tile or row opens the detail for a mouse or finger. Each open builds its own `<dialog>` inside the Browse container (so the app's hidden-tab closing finds it), which makes a late printings reply for a closed card harmless by construction; that test pins the behaviour but has no guard to remove.
  - The price shown first is the result's own (its cheapest finish); then "Cheapest printing: $X" with its set, from `printings()`. A failed lookup keeps the first price and says so.
  - Pure helpers in `lib/browse.ts`: `legalityLabel` (words, tone only styles them), `allFormats` (readable names; Scryfall's separator-less keys such as `paupercommander` and `predh` are mapped by hand), `ownableId` (Oracle ID or null, never the printing id).
  - `app.ts` marks the Decks screen stale when `saveDeck`, `deleteDeck`, `setOwned` or `replaceStore` run while another tab shows, and redraws it once on return. Changes made on Decks itself do not mark it. The e2e test marks Sol Ring owned in Browse and sees the deck's to-buy go from $35.47 to $34.37 on return.
  - Mutation checks, each failing its test: the stale flag removed; hidden-tab dialog closing removed; the no-Oracle-ID guard removed; `ownableId` falling back to the printing id; no redraw after an owned change; no focus move after a redraw. The browser already returns focus to the opener, so that test covers the redraw case, where the opener is replaced.
  - Slice 5 adds "Add to deck…" to this dialog's actions.
  - Not checked: the Android back gesture with the detail open (relies on `native.ts` closing `dialog[open]`).


### 5. Add to deck… and New deck…
- [ ] "Add to deck…" in the detail: a deck select (newest first, nothing chosen), **New deck…** as the last option, Add disabled until a choice is made. Browse reads no state from the deck open on the Decks tab (a test opens a deck, then adds to a different one).
- [ ] Existing deck: `mergeEntries` adds the card, `cardWarnings` supplies "already in this deck" (basic lands may repeat) and "Outside this commander's colors" (a warning, Add still works); the commander's colors come from `cardsByOracleId`; if that lookup fails, add anyway with "Couldn't check colors". Saves through `ctx.saveDeck`, then the confirmation "Added to <deck>" with an **Open deck** link.
- [ ] **New deck…**: optional name and the commander `combobox`; **Use this card as commander** when the card can be one (then the card is not also added as a main-deck card); **Create deck and add** uses `buildDeck`, saves, and stays in Browse. No decks at all: the select starts on New deck…
- [ ] E2E (`browse-decks.spec.ts`): add to an existing deck, then Decks shows the new count (fixes the stale list from part 1); create a new deck with a chosen commander from Browse, never leaving the Browse URL, then Open deck shows it with the card; commander shortcut; first deck made with none existing; both projects, phone screenshot of the dialog looked at.
- **Failure paths:** already in the deck → message, no second copy, deck unchanged (fails without the check); off-color → warning shown and Add works; commander colors lookup fails → note and Add works; New deck with no commander picked → Create disabled; the commander search returns nothing or fails → message, nothing created; **Add pressed twice** → one card added (action guard); deck deleted elsewhere between opening the dialog and Add → no crash, the deck list is rebuilt and nothing is written to a missing deck; storage blocked → the card shows in the deck for this session only, with the existing storage banner; the deck count on the Decks home is correct after adding (summary refreshed).

## Verification at the end

- `npm run check` (typecheck, unit, e2e, both projects) on the final tree, run once in the background with a long timeout.
- `SCRYFALL_LIVE=1 npm test` before review; the PR says whether it ran. A live test of `searchCards` (a real search, page 2, a 404, a bad-syntax 400) is added in slice 1 so the fixtures can be checked against the real API.
- `tools/doc-index.sh --check`.
- Mutation checks, each proved by removing the guard and watching the test fail: the stale-search run guard, the Load more run guard, the Decks stale flag, the duplicate check, the double-click guard, the 900-character limit.
- Not verifiable in this sandbox, stated in the PR: the Android back gesture with the detail open, and the feel of the grid on a real phone.

## Follow-ups (not built)

A route per card (`#/browse/card/<id>`); saved searches; searching by set name; Browse preferences in deck backup and restore.
