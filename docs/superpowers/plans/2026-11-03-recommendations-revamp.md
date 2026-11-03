---
description: Recommendations revamp build plan — five test-gated vertical slices from EDHREC client and category upgrades to filters, gaps, EDHREC-scored swaps and the wider Scryfall fallback
status: draft
updated: 2026-11-03
---

# Recommendations revamp: build plan

Builds the [recommendations revamp spec](../specs/2026-11-03-recommendations-revamp.md) on [ADR-005](../../decisions/ADR-005-edhrec-commander-data.md). Each slice works end to end in the browser. Before a slice is committed, `npm run check` must pass, and the change must be tried in the dev server on the Edgar deck.

**Layout:**
- `src/edhrec/` holds the EDHREC client and page parsing, and is the only code that calls EDHREC.
- `src/lib/` holds pure logic: slug, scoring, bracket estimate, gaps and categories. It gets unit tests in `tests/unit/`.
- `src/ui/suggestions.ts` holds the panel.
- `tests/fixtures/` holds recorded EDHREC replies beside the Scryfall ones.

**Reuse:**
- `createClient` gains a `base` option, so EDHREC gets the same queue, retry and cache with `spacingMs: 1000` and `maxInFlight: 1`. This extends the existing helper (reuse rung 2).
- The name batching in `scryfall/roles.ts` is moved out to be shared by role lookups and EDHREC name lookups.
- Tiers, `swapPairs` and `cheaperReplacements` stay, fed the new scores.

## Execution routing

| Work | Who | Model | Effort |
|---|---|---|---|
| Slices 1–5 (code and tests) | main session | as set | as set |
| Recording EDHREC fixtures | `RECORD=1` record script | — | — |
| Test gate after each slice | `npm run check` script | — | — |
| Code review before PR | code review agent | sonnet | high |
| Security check of the new outside data (EDHREC strings into the DOM, redirects) | `security-and-hardening` skill in the main session | — | — |

## Slices

### 1. EDHREC client, Edgar upgrades by category
- [x] `createClient({ base })`: the Scryfall default is unchanged, and unit tests cover the new base and spacing.
- [x] `lib/edhrec.ts`:
  - `commanderSlug(names)`: apostrophes, commas, accents, double-faced fronts, partners in alphabetical order. Unit tests use the real slugs checked on 2026-11-03.
  - `parsePage(json)`: checks every field used (`cardlists[].cardviews[].name/num_decks/potential_decks/synergy`, `card.num_decks`, `panels.taglinks`, `panels.piechart`). It returns null on any wrong shape and follows `redirect` once.
- [x] `src/edhrec/page.ts`: fetch with redirect handling. A 403 becomes "not on EDHREC"; other failures become "didn't answer".
- [x] Scoring: `inclusion + max(0, synergy) + 0.3 owned`. Unit tests pin the spec's Edgar numbers: Captivating Vampire above Exquisite Blood above Path to Exile.
- [x] Name lookup: batched `prefer:usd-low … (!"A" or …)` Scryfall searches. A failed batch is named, and the others are kept.
- [x] Category grouping: EDHREC list order; New, Top and High Lift cards go into their type's list with no duplicates; top 5 plus **Show more**; no basics; empty categories hidden.
- [x] UI: the source line with the EDHREC link and deck count; the reason line "In N% of <commander> decks · +N% synergy".
- [x] Fixtures: Edgar main page (EDHREC), Edgar name lookups (Scryfall).
- [x] E2E: Edgar Find shows Skullclamp under Utility Artifacts and Exquisite Blood under Enchantments.
- **Failure paths, each with a test:**
  - 403
  - network error
  - 200 with missing `cardlists`
  - empty `cardviews`
  - redirect loop (follow once only)
  - a card EDHREC names that Scryfall can't find (dropped)
  - a Scryfall batch failing
  - a stale run reply ignored (the existing run guard covers EDHREC replies; its test moves to slice 2, where filter changes can overlap)
- **Done 2026-11-03.** Until slices 4 and 5 land, Find still runs v1's rules pool beside EDHREC: Swaps and Cheaper use it, and Upgrades falls back to v1's price tiers when EDHREC has no page or doesn't answer. All 273 cards on Edgar's page matched on Scryfall.

### 2. Bracket, theme and price filters
- [x] Bracket estimate from Game Changers: one batched `is:gamechanger (!"A" or …)` search. 0 gives Core, 1–3 Upgraded, 4 or more Optimized. Unit tests cover the boundaries.
- [x] The deck stores its picked bracket as an optional field. Old saved decks load unchanged, and the field isn't in share links. A storage test covers a deck without it.
- [x] Bracket and theme dropdowns with deck counts. Price segmented control (Any, Budget, Mid, Premium). Budget reads EDHREC's `/budget` page with any bracket and theme (theme plus budget works after all).
- [x] URL building in fixed order `<slug>/<bracket>/<theme>/budget`, with unit tests. A bracket page under 50 decks falls back to all decks, with a note.
- [x] Fixtures: an Edgar bracket page, a theme page, and the budget page.
- [x] E2E: changing the theme reloads the list; the price filter narrows it; the estimated label shows.
- **Failure paths:**
  - A filter page fails: keep the previous list and say so.
  - Two quick changes: only the newest draws.
  - The Game Changer search fails: start on All decks.
- **Done 2026-11-03.** A filter change looks up only names not seen in this Find. The e2e mock answers EDHREC name lookups from the recorded cards, since batches depend on the order filters change. The overlap test holds back Scryfall lookups, not the EDHREC page: pages load one at a time, so only lookups can finish out of order. It fails with the page-run guard removed.

### 3. Gaps
- [x] `lib/gaps.ts`: deck type counts (front face, lands counted once) against the piechart average. Lines for types 3 or more below typical, with matching categories first. Unit tests cover equal, above, below by 2 (no line) and below by 3 (line).
- [x] E2E: the Edgar deck shows its Creatures gap (30 against 35); removing three artifacts adds an Artifacts line, with Utility and Mana Artifacts next after Creatures. Biggest gap leads.
- **Failure paths:** a piechart that is missing or has unknown labels shows no gap lines and doesn't throw.
- **Done 2026-11-03.** A card counts once by its main type, creature first, then land (an artifact land is a land), matching EDHREC's average deck, which sums to 99.

### 4. Swaps and Cheaper on EDHREC scores
- [x] Keep score: a deck card's EDHREC score, or 0 when it isn't on the page.
- [x] Roles for the top 60 candidates: 8 background searches after deck roles. Until they load, pairs match by EDHREC category and the reason says "Both artifacts".
- [x] Cheaper replacements accept a same-category match when roles are unknown.
- [x] Unit tests: every v1 never-cut rule still holds; an absent card is cut first; category matching works without roles; no downgrades.
- [x] E2E: the existing swap and undo test passes on the EDHREC flow.
- **Failure paths:** the role lookup fails partly or fully, giving category matching and the "approximate" notice.
- **Done 2026-11-03.**
  - Find no longer runs v1's rules searches when EDHREC answers; they start only when it has nothing. The deck's own roles now load at Find, not after the pool.
  - Pairs match on a shared role, then the same main type, the same way the average deck counts cards: "Both artifacts". An add with neither is skipped, instead of cutting something unrelated.
  - A partial role lookup keeps the roles it did find.
  - Edgar's first EDHREC swap is Kalastria Highborn → Blood Artist.

### 5. Wider Scryfall fallback
- [ ] Verify each new `otag` live first (tutor, recursion, protection, counterspell, mana-rock, token-generator, sacrifice-outlet), and record which exist.
- [ ] New themes in `lib/profile.ts`: artifacts matter, enchantments matter, spells matter, ETB/blink, landfall, equipment/auras. A theme the commander's own text names counts below the minimum. Unit tests cover each regex with a real card's text.
- [ ] The fallback uses the same category layout and price filter, with no gaps, bracket or theme controls, and shows the notice.
- [ ] Fixtures: the EDHREC 403 for a made-up commander; the fallback Scryfall searches.
- [ ] E2E: the 403 shows the fallback notice and still lists suggestions.
- **Failure paths:**
  - EDHREC 403, network error and wrong shape: each shows the fallback.
  - Every Scryfall search fails: the error message.

### After slice 5
- [ ] The opt-in live test `EDHREC_LIVE=1 npm test` checks the real Edgar page shape, and runs before review.
- [ ] Mark the v1 spec's "Suggestion rules" section as replaced by the revamp spec. Set both new docs to `current` and rerun `tools/doc-index.sh`.
- [ ] CLAUDE.md Architecture: add a line for `src/edhrec/`. Gotchas: EDHREC is unofficial, with the redirect and 403 behavior.
- [ ] `/go`: verify, review, simplify, PR.

## Follow-ups (not in this plan)

- Combos from EDHREC `combocounts`
- Next specs: the tab bar with life counter, then Browse
