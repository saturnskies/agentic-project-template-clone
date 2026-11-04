---
description: Browse tab spec — search every card by name, set, type, tribe, keyword, role, color identity, mana value, rarity and price (plus raw Scryfall syntax), image grid or list, sorting, Load more, and a card detail with Add to deck and Mark as owned
status: current
updated: 2026-11-04
---

# Browse tab: design spec

Part 2 of two (part 1: [tab bar and Life Counter](2026-11-04-tab-bar-life-counter.md), merged). The tab, the `#/browse` route, the kept-place container and the Android back behavior already exist; Browse fills the container that holds a placeholder today (`src/ui/browse.ts`).

## Problem

Swapsmith only finds cards through a deck: the paste box, the commander picker and the suggestions panel. There is no way to look up "every cheap green ramp spell" or "a card I heard about", see what it costs, and drop it into a deck.

## Goal

A Browse tab that searches all of Scryfall with friendly filters, shows results as an image grid or a list, and lets a person open a card, see its price and legality, add it to one of their decks and mark it owned.

## Search form

Searching is explicit (Search button or Enter in a text field), never per keystroke: Scryfall's search endpoint is the slowest on our queue (500 ms apart). Nothing is fetched when the tab opens. Opening it shows a hint; Search with no filters is allowed and lists the most popular cards that match the toggles.

| Control | Scryfall term built | Notes |
|---|---|---|
| Name | quoted words, e.g. `"mana crypt"` (each word `name:`-matched, so word order is free) | Quotes and backslashes in the text are escaped |
| Set | `set:<code>` | Set code, 2–6 letters or digits; other input shows an inline error |
| Type | `t:<word>` per word | "legendary artifact" → `t:legendary t:artifact` |
| Tribe | `t:<creature type>` plus `t:creature` | One creature type, letters and hyphens only |
| Keyword | `kw:<keyword>` | One keyword, letters, spaces and hyphens |
| Role | the role's own Scryfall query | A select of `POOL_ROLES` from `src/scryfall/roles.ts` plus **token maker**, whose query is the `tokens` theme query in `src/lib/profile.ts` (there is no `otag:token-generator`). One role at a time |
| Color identity | `id<=wub`, `id=wub` or `id>=wub` | Five color toggles plus Colorless; a mode control: **within** (default), **exactly**, **includes**. Colorless alone means `id=c` |
| Mana value | `mv>=<n>` and `mv<=<n>` | Whole numbers 0–99, either end optional; min above max shows an error |
| Rarity | `(r:c or r:u …)` | Common, uncommon, rare, mythic; any combination |
| Price (USD) | `usd>=<n>` and `usd<=<n>` | Dollars, up to two decimals, either end optional. Cards with no USD price are left out when a price bound is set (Scryfall behavior); the form says so |
| Commander-legal | `legal:commander` | A toggle, **on by default** |
| Advanced | raw Scryfall syntax | A text box with a link to Scryfall's syntax page. It is ANDed with everything above, wrapped in parentheses so an `or` inside cannot escape the other filters |

- All filters are ANDed. The built query is shown under the form ("Searching: …") so the person can copy it into Scryfall.
- **Query length.** Scryfall silently drops the end of a query past ~1,000 characters. The builder measures the final string; over 900 characters the search does not run and the form says which part to shorten (usually the advanced box). Never truncated.
- **Errors from Scryfall.** 404 means no matches: "No cards match". 400 (bad syntax in the advanced box) shows Scryfall's own message under that box. Any other failure shows a retry message and keeps the previous results.
- **Reset** clears the filters (not the view, sort or Commander-legal toggle).

## Results

- **Grid / list toggle** (`segmented()`): the grid shows the card image (`image_uris.normal`, or the first face for double-faced cards), lazy loaded, with name, price and an **Owned** badge as text under it. The list shows name, mana cost, type line, rarity and price per row. Both open the same detail.
- **Sort** (`segmented()` or select): **Popularity** (`order=edhrec`, default), **Price** (`usd`), **Name**, **Mana value** (`cmc`), **Release date** (`released`), with an ascending/descending toggle that starts at each sort's natural direction (popularity, name, mana value up; price and release date down). Changing the sort or direction re-runs the search from page 1.
- **Load more.** Scryfall pages hold 175 cards. The first search loads page 1; a **Load more** button below the results asks for the next page (`&page=N`, through `src/scryfall/client.ts`, never a raw fetch) and appends. It shows "Showing 175 of 1,204" and is hidden when `has_more` is false. A failed page keeps what is loaded and shows the message with a retry; Load more is disabled while a page is in flight.
- **Stale replies.** Each search gets a run number; Load more belongs to the run that made it. A reply from an older search (or an older page of it) is dropped, so a slow first search cannot overwrite a newer one.
- **Price shown** is the price of the printing Scryfall returns for the card (`unique=cards`); the detail shows the cheapest printing, as the deck screens do.

## Card detail

A modal `<dialog>` opened from a result: large image (a **Flip** button for double-faced cards), name, mana cost, type line, rules text (every face), price with a **Buy on TCGplayer** link (`tcgplayerUrl` in `src/lib/price.ts`; cheapest printing, loaded when the dialog opens, falling back to the result's own price if that load fails), legality (Commander status as text plus color, and an "All formats" disclosure), and two actions:

- **Add to deck…** asks which deck, every time. Browse is **independent of the Decks tab**: it never follows or reads the deck being viewed there, and nothing is pre-selected from it. The dialog shows a select of the person's decks (newest first, nothing chosen at first) with **New deck…** as the last option, and an **Add** button that stays disabled until a choice is made.
  - **New deck…** reveals, inside the same dialog, an optional deck name and a commander search (the `combobox` and `searchCommanders` the New deck screen uses). **Create deck and add** builds the deck with `buildDeck`, puts the card in it and saves it. If the card itself can be a commander, a **Use this card as commander** shortcut fills the search. Creating a deck never leaves Browse; the confirmation says "Added to <deck>" with an **Open deck** link, and the person decides whether to go to Decks.
  - No decks yet: the select starts on New deck…, so the first deck is made right here.
  - Adding to an existing deck uses `mergeEntries`; a card already in the deck says so instead of adding a second copy (basic lands excepted, as in the deck editor). The deck's saved summary is refreshed. A deck made here with this card as its commander does not add it again as a main-deck card. **Color identity** (decided 2026-11-04): if the card's identity is not inside the chosen deck's commander identity, a warning "Outside this commander's colors" shows under the select and Add still works. If the commander's identity cannot be looked up (offline, lookup failed), Add works with a "Couldn't check colors" note instead.
- **Mark as owned / Owned** toggles through `ctx.setOwned`, the same collection every deck reads.

The dialog closes with Escape, its Close button and the Android back gesture (`native.ts` closes `dialog[open]` first), and `app.ts` closes it when the tab is hidden. It has no route of its own, so a reload returns to the results screen.

## Keeping Decks in step

A deck or the owned collection changed from Browse while the Decks tab is hidden must show on Decks when it comes back. `app.ts` marks the Decks screen stale when `saveDeck`, `deleteDeck`, `setOwned` or `replaceStore` runs while another tab is showing, and redraws it on the next visit. Tested end to end (add from Browse, switch to Decks, the deck's count has changed).

## Saved state

- Browse container stays mounted: search text, filters, results and scroll survive tab switches with no save code (already true for the container).
- **Preferences only** go to storage, under their own key `swapsmith:browse` (`{version: 1, view, sort, descending, commanderLegal}`), not into `swapsmith:v1`. That leaves deck backup and restore and the Android data-safety rules untouched (like `swapsmith:life`). Loaded through a sanitizer: wrong shapes fall back to defaults, an unknown future `version` is left alone and defaults are used. Storage blocked: works normally, nothing saved.
- Filters, results and the open card are not saved; a reload starts a fresh search form.

## Code layout and reuse

Reuse ladder, rung that held in brackets.

- `src/lib/browse.ts` — pure: filter shape, `buildQuery`, escaping, validation, sort options, the preference sanitizer. Unit-tested in `tests/unit/browse.test.ts`. [rung 6]
- `src/scryfall/browse.ts` — `searchCards(client, query, sort, page)`; the only new Scryfall call, through the shared client (queue, 429 retry, cache). [rung 2]
- `src/ui/browse.ts` — form, results, detail, built with `h()`, `segmented()` from `controls.ts`, the select pattern from `suggestions.ts`, `<dialog>`, `bestPrice`/`cheapestPrinting`/`tcgplayerUrl` from `src/lib/price.ts`, `isOwned`/`setOwned` from `src/lib/owned.ts`, and `combobox`, `searchCommanders` and `buildDeck` for New deck… (shared with `newDeck.ts`, not copied). [rungs 2 and 4]
- `src/scryfall/types.ts` — `ScryCard` gains `mana_cost`, `rarity`, `cmc`, `keywords`, and `legalities` widens to all formats. [rung 2, extended]
- `src/ui/app.ts` — the Decks stale flag; `ctx` is passed to `renderBrowse`.
- E2E: Scryfall answered from real recorded fixtures (`RECORD=1`), never invented replies; desktop and phone projects (390 px).
- No new dependency.

## Out of scope (follow-ups)

- A route per card (`#/browse/card/<id>`) for sharing and reload.
- Saving filters as named searches; searching by set name (only codes).
- Browse preferences in deck backup and restore.
