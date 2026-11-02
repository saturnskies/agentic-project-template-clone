---
description: Swapsmith v1 design spec — free static Commander deckbuilder with live TCGplayer prices via Scryfall, owned-card tracking, and rules-based swap/upgrade/cheaper-replacement suggestions
status: current
updated: 2026-11-02
---

# Swapsmith v1: design spec

## Goal

A free website where someone builds or pastes a Commander deck, sees what each card costs on TCGplayer, marks what they own, and gets suggestions for what to swap in or out. It costs nothing to run or use: no accounts, no server, no AI calls.

**Audience:** the owner and their playgroup. It should be easy to use and work on a phone, but it doesn't need onboarding for strangers.

**Stack and hosting:** see [ADR-001](../../decisions/ADR-001-swapsmith-stack-and-hosting.md).

## In scope (v1)

1. **Commander deck building.** Pick a commander, then add cards by search with autocomplete. Or paste a text list.
2. **Live prices.** Each card shows its cheapest TCGplayer market price, with a link to that printing's TCGplayer page. A printing picker overrides the default per card.
3. **Owned cards.** Tick the cards you own. Totals show the deck cost and the cost still to buy.
4. **Suggestions**, all from rules over Scryfall data:
   - upgrades by price tier
   - swap pairs (cut one card, add another)
   - cheaper replacements
5. **Saving and sharing.** Decks are saved in the browser. A share link encodes the whole deck.
6. **Grid and list views.** A card-image grid grouped by type, or a compact list. You can switch between them.

## Out of scope (v1)

These were decided against for v1. The code shouldn't block them.

- Deck health checks (land, ramp, draw and removal counts against targets)
- Other formats (60-card Standard, Modern, Pauper). Code keeps format rules in one module so a format can be added later.
- Accounts and cloud saves
- Importing from Moxfield or Archidekt URLs
- AI-written suggestions
- Price history and alerts

## Data source: Scryfall API

Every card fact and price comes from the free public [Scryfall API](https://scryfall.com/docs/api), called directly from the browser. This was confirmed on 2026-11-02:

- **CORS:** it sends `access-control-allow-origin: *`.
- **Prices:** Scryfall's `prices.usd`, `usd_foil` and `usd_etched` are TCGplayer market prices, refreshed daily. `purchase_uris.tcgplayer` links to the TCGplayer product. The app strips Scryfall's affiliate redirect and links to `tcgplayer.com/product/<id>` directly; the product id is in the redirect's `u=` parameter.
- **Searches the suggestions use:** `f:commander` (legal in Commander), `id<=wbr` (within a color identity), `order:edhrec` (EDHREC popularity), `usd<3` (price filter) and `otag:` (Scryfall Tagger functional tags). Verified tags: `ramp`, `card-advantage`, `removal`, `board-wipe`, `tutor`, `sacrifice-outlet`, `lifegain`, `death-trigger`, `recursion`, `mana-rock`. Example: `id<=wbr f:commander t:vampire usd<3 order:edhrec` returned 371 cards, led by Blood Artist.
- **Endpoints:**

  | Use | Endpoint |
  |---|---|
  | Autocomplete names | `GET /cards/autocomplete?q=` |
  | Look up up to 75 cards in one call | `POST /cards/collection` |
  | All printings of a card (cheapest price, printing picker) | `GET /cards/search?q=oracleid:<id>&unique=prints` |
  | Suggestion and role searches | `GET /cards/search?q=` |

**Being a good API citizen.** Scryfall asks clients to stay under about 10 requests a second and to cache data.

- All requests go through one client module.
- That module queues requests, about 100 ms apart, and retries on HTTP 429 with backoff.
- It caches responses in IndexedDB for 24 hours, keyed by URL. Prices only change daily, so a reopened deck loads mostly from cache.
- The footer credits Scryfall. The site never charges for Scryfall data, which Scryfall's terms require.

**Load cost.** A deck is priced in about 15 requests:
- 2 collection lookups.
- A few batched printings searches, each covering about 15 Oracle IDs OR-ed together, following every page.
- One price-filtered search per basic land.

The full 100-card Edgar list was priced in 8 s against the live API on 2026-11-02, and a reload takes 0.1 s from the cache.

**Scryfall behaviour found while building (2026-11-02):**
- **Query length:** queries longer than about 1,000 characters are silently cut short, so batches stay under 900.
- **Rate limits:** bursts of searches at 10 a second get 429s. Those replies carry no CORS headers, so browsers report them as a network error. Searches, name lookups and collection lookups are spaced 500 ms apart, and network errors are retried like 429s.
- **Batch lookups:** results come back in request order with misses left out. Matching is forgiving: "Stromkirk Blood-Thief" finds Stromkirk Bloodthief. It can also return the wrong card: "Sign in Blood" returns Scheming Silvertongue // Sign in Blood. So each pairing is checked by name, and a mismatch falls back to fuzzy lookup.
- **Double-faced cards:** a batch lookup only matches the front-face name, not "A // B".
- **Alternate names:** names printed on some versions (`flavor_name`, e.g. Panther Idol for Mind's Eye) are matched and shown to the user.
- **User-Agent:** the API rejects Node's default User-Agent, but browsers are fine.

## Data model

All of this lives in the browser.

```ts
Deck = {
  id: string,                 // random, local only
  name: string,
  format: 'commander',        // the only value in v1
  commander: CardRef,
  cards: DeckEntry[],         // excludes the commander
  updatedAt: string,          // ISO time
}
DeckEntry = { card: CardRef, qty: number, printingId?: string /* user-picked printing; absent = cheapest */ }
CardRef  = { oracleId: string, name: string }
Owned    = Set<oracleId>      // one collection across all decks
UnownedBasics = Set<oracleId> // basic lands are owned by default; unticking one adds it here
Prefs    = { view: 'grid' | 'list', budgetTier?: 'budget' | 'mid' | 'premium' }
```

- **Storage.** Decks, owned cards and preferences go in `localStorage` under one versioned key (`swapsmith:v1`). Cached API responses go in IndexedDB. If storage is blocked, as in some private windows, the app still works for the session and shows a banner saying decks won't be saved.
- **Owned cards are matched by Oracle ID.** Owning any printing of a card counts as owning it. Basic lands (type line `Basic Land`, including Wastes and snow basics) count as owned unless unticked.

### Share links

A share link holds the deck in the URL hash (`#d=<data>`), so no server is needed.

- **Encoding:** commander and card lines as compact text (`qty name|printingId`), compressed with the browser's built-in `CompressionStream('deflate-raw')`, then base64url-encoded. A 100-card deck makes a URL of roughly 1–2 KB.
- **Opening a link:** shows the deck read-only, with a **Save to my decks** button.
- **Owned cards stay out.** They're personal and are never put in a share link.

## Screens and flows

### 1. Deck list (home)

- Cards for each saved deck: commander art, name, total, still-to-buy, and last edited.
- Buttons: **New deck** and **Paste a list**.

### 2. New deck

1. **Pick a commander.** Autocomplete only offers cards that can be commanders, using `is:commander`.
2. You land on an empty deck editor with that commander, ready to add cards.

### 3. Paste a list

- **Accepted formats:** `1 Card Name`, `1x Card Name`, `Card Name` (qty 1), and `1 Card Name (SET) 123`, which pins that printing. Section headers like `Commander`, `Deck` and `Sideboard`, and blank lines, are ignored.
- **Choosing the commander:** a `Commander` section, or a line marked `*CMDR*`, sets it. Otherwise the app asks which listed legend is the commander.
- **Names that don't match** appear in a fix-up list. Each has autocomplete and a "did you mean" choice from Scryfall's fuzzy match. This catches typos like "Calastria Highborn" → Kalastria Highborn.

### 4. Deck editor (main screen)

- **Header:** deck name, commander, deck total, still-to-buy total, card count against 100, and a color identity pip row.
- **Add card:** a search box with autocomplete. It warns, but still allows, when a card is outside the commander's colors, not legal in Commander, or a duplicate of a non-basic card.
- **View toggle:** grid or list, remembered per browser.
  - **Grid:** card images grouped by type (Creatures, Instants, Sorceries, Artifacts, Enchantments, Planeswalkers, Lands, and Battles if any). Each tile shows price, an owned tick and a remove button.
  - **List:** one row per card with name (hover or tap to see the image), type, printing, qty, price, owned and remove. Columns can be sorted.
- **Card links:** every card name and image links to that printing's TCGplayer page in a new tab.
- **Printing picker:** opened from a card. It lists every paper printing with set, number, finish (nonfoil, foil or etched) and price, cheapest first. You can pick one, or reset to cheapest.
- **Rename and delete deck:** deleting asks for confirmation in the page.
- **Share:** copies the share link.

### 5. Suggestions panel

A panel beside the editor on wide screens, or a tab on phones, with three sections.

## Suggestion rules

All rules are pure functions over card data, so unit tests can cover them without the network. Every suggestion shows a short reason built from the rule that produced it.

### Deck profile, computed locally from deck cards

- **Color identity:** the commander's `color_identity`.
- **Tribe:** the most common creature subtype among non-commander creatures, if at least 8 cards share it. The commander's own types break ties.
- **Themes:** found by matching oracle text across deck cards. A theme counts when at least 5 cards match it.

  | Theme | Matching oracle text |
  |---|---|
  | sacrifice | `sacrifice a creature`, `sacrifice another` |
  | death triggers | `whenever .* dies` |
  | lifegain | `lifelink`, `gain .* life` |
  | tokens | `create .* token` |
  | +1/+1 counters | `\+1/\+1 counter` |
  | graveyard | `from your graveyard` |

- **Card roles:** looked up through Scryfall tags. Run `otag:<role> (!"A" or !"B" …)` over the deck's names in batches of about 20 names, for each role in the verified list above. The results are cached.

### Candidate pool

For each detected tribe, theme and role, run a search with these rules:

- `f:commander id<=<CI> -is:digital game:paper order:edhrec`, plus the theme's filter: `t:<tribe>`, the theme's oracle text, or `otag:<role>`.
- Keep the first 2 pages, about 350 cards, per search.
- Remove cards already in the deck.
- Collect the results into one pool, cached for 24 hours.

### Score for a candidate

`score = popularity + 0.5 × (number of themes, tribe and roles matched) + 0.3 if owned`

- `popularity` = `1 − edhrec_rank / max_rank`, from 0 to 1.
- Cards with no `edhrec_rank` get popularity 0.

### 1. Upgrades by price tier

- **Tiers** are set on the cheapest printing's price: Budget is under $3, Mid is $3–$15, Premium is over $15. The boundaries are constants in one module.
- **Each tier** shows the top 10 by score.
- **Reasons** look like: "Vampire · death-trigger payoff · top 3% in Commander · $0.40 · owned".

### 2. Swap pairs

- **Adds:** the top 10 overall candidates, filtered by a budget tier if one is set.
- **The paired cut** comes from the deck with the lowest keep score: `popularity + 0.5 × matches`.
- **Cut preference:** a card that shares a role with the add, so a removal spell replaces a removal spell. If none shares a role, the lowest keep score overall.
- **Never cut:** the commander, basic lands, cards the user has pinned as "keep" (a toggle on each card), or a card already used in another pair.
- **Lands:** a land is only cut for a land.
- **Apply:** one click swaps the two cards. **Undo** reverts the last apply.

### 3. Cheaper replacements

- **Which cards get them:** every deck card whose cheapest price is at least $5 and that the user doesn't own. The threshold is a constant.
- **What's offered:** the 3 highest-scoring cards that share at least one role with it, are within the color identity, are legal, and cost under half its price.
- **Display:** "Save $X.XX", plus a **Swap** button.

### Guarantees across all three

- Never suggest a card that is banned in Commander, outside the color identity, or already in the deck.
- Always link to TCGplayer.

**Known limit:** EDHREC rank measures a card's popularity across all of Commander, not in decks with this particular commander. Suggestions are on-theme and popular, but they won't know combos.

## Errors and empty states

- **Scryfall unreachable:** a banner says "Couldn't reach Scryfall; showing saved prices from <date>". Edits still work.
- **Card with no price:** it shows "no price" and is left out of totals, and the total says "N cards unpriced".
- **Fewer than 5 deck cards:** suggestions show "Add a few cards to get suggestions", with tribe and color picks only.

## Testing

Tests are written first, following the repo's TDD flow.

- **Unit tests (Vitest)** cover:
  - list parser formats
  - share-link encode and decode round trip
  - cheapest-printing selection
  - deck profile detection
  - scoring
  - each suggestion rule's guarantees, including no banned, off-color or duplicate cards
  - tier boundaries
  - storage migration from an empty or corrupted store

  These tests use recorded Scryfall fixtures, so they need no network.
- **End-to-end tests (Playwright)** cover:
  - new deck from commander
  - paste the Edgar Markov list
  - fix a typo
  - mark cards owned and see still-to-buy change
  - switch views
  - pick a printing
  - apply a swap and undo it
  - copy a share link and open it in a fresh context

  These tests run against the built site, with Scryfall answered from fixtures (`page.route`).
- **CI:** a GitHub Actions workflow runs lint, unit and end-to-end tests on every push and PR. It deploys to GitHub Pages only from `main` after the tests pass.

## Build order (vertical slices)

Each slice works end to end and is gated by its tests. The detailed plan comes next, in `docs/superpowers/plans/`.

1. **Skeleton and deploy:** Vite app, CI, Pages deploy, footer credit, and the Scryfall client with queue and cache.
2. **Paste a list and price it:** parser, fix-up list, list view, totals, TCGplayer links, saved in the browser.
3. **Commander-first building:** commander picker, add-card autocomplete, legality and color warnings.
4. **Owned cards and printing picker:** still-to-buy total.
5. **Grid view:** view toggle.
6. **Share links.**
7. **Suggestions:** deck profile, candidate pool, upgrades by tier.
8. **Swap pairs and cheaper replacements:** apply and undo.

## Decisions after review (2026-11-02)

- **Repo name:** the repo is renamed `swapsmith` on GitHub, so the site lives at `https://saturnskies.github.io/swapsmith/`. Vite's `base` is `/swapsmith/`.
- **Basic lands are owned by default.** Unticking one records it in `UnownedBasics`. Still-to-buy totals exclude owned basics.
