---
description: Recommendations revamp spec — EDHREC per-commander deck data (inclusion, synergy, themes, brackets, average deck) as the main signal, grouped by card category with gap hints, and a wider Scryfall rules fallback
status: draft
updated: 2026-11-03
---

# Recommendations revamp: design spec

First of three specs (then the tab bar with life counter, then Browse). It replaces the v1 [suggestion rules](2026-11-02-swapsmith-design.md#suggestion-rules) when the plan for it ships; the source choice is [ADR-005](../../decisions/ADR-005-edhrec-commander-data.md).

## Problem

v1 only considers cards that match one of about 8 Scryfall searches: the tribe, the detected themes, and four roles (ramp, card draw, removal, board wipe). It then ranks them by popularity across all of Commander. Cards that commander's decks actually play but that match none of those searches never appear. That includes off-tribe artifacts and enchantments such as Skullclamp, Herald's Horn, Exquisite Blood and Shared Animosity for Edgar Markov.

## Goal

Recommend what decks with the same commander actually play, grouped so artifacts, enchantments and lands get their own place, with notes on what the deck is short of. When that data isn't available, fall back to wider Scryfall rules.

## Data source: EDHREC (checked 2026-11-03)

EDHREC publishes each commander page as JSON. The endpoint is unofficial, so the choice and its risk go in ADR-005.

- **CORS:** `access-control-allow-origin: *`, on errors too, so the site and the Android app can call it directly. Archidekt (only `localhost:3000` allowed) and Moxfield (403) can't be called, so individual decklists ("the top 100 decks") are out. EDHREC's page already combines every deck it knows for the commander: 52,525 for Edgar Markov and 46,106 for Atraxa.
- **URL:** `https://json.edhrec.com/pages/commanders/<slug>[/<bracket>][/<theme>][/budget].json`
  - **Slug:** the commander's name in lower case, with apostrophes and commas dropped and every other run of non-letters turned into `-`. For example, "Atraxa, Praetors' Voice" becomes `atraxa-praetors-voice`.
  - **Partners:** both slugs joined in alphabetical order (`thrasios-triton-hero-tymna-the-weaver`). The wrong order returns `{"redirect": "/commanders/…"}`; follow it once.
  - **Bracket:** `exhibition` (1), `core` (2), `upgraded` (3), `optimized` (4) or `cedh` (5).
  - **Theme:** a slug from the page's `panels.taglinks` (for Edgar: Vampires, Lifegain, Tokens, Aristocrats…).
  - **Combinations:** every combination works in the order above, down to `core/vampires/budget` (8 Edgar decks). Other orders, such as `infect/core`, fail. (Corrected 2026-11-03: an earlier reading said theme plus budget wasn't served; `infect/budget` and `lifegain/budget` both are.)
  - **Counts on every page:** `bracket_counts` (decks per bracket, for the page's theme and budget) and `panels.taglinks` (themes, for the page's bracket).
  - **Unknown commander:** returns HTTP 403.
- **What a page gives:**
  - `container.json_dict.cardlists`: about 290 cards in lists such as New Cards, Top Cards, High Lift, Creatures, Instants, Sorceries, Utility Artifacts, Mana Artifacts, Enchantments, Planeswalkers, Utility Lands and Lands.
  - For each card: `name`, a Scryfall `id`, `num_decks`, `potential_decks`, `synergy` (−1 to 1) and `lift`. Inclusion is `num_decks ÷ potential_decks`.
  - `container.json_dict.card.num_decks`: the number of decks in the sample.
  - `panels.piechart.content`: the average deck's card-type counts (Atraxa: 36 lands, 24 creatures, 10 instants, 9 artifacts…).
  - `panels.taglinks`: themes with deck counts.
  - `bracket_counts`: decks per bracket. Only about a fifth of decks list a bracket.
- **Prices still come from Scryfall.** The EDHREC card names are looked up with batched `prefer:usd-low game:paper f:commander id<=<CI> (!"A" or !"B" …)` searches under the 900-character cap, the same batching `deckRoles` uses. That's about 7 searches for 290 names, roughly 4 s at 500 ms spacing. Those searches also re-check legality and color identity.
- **Being polite:** EDHREC requests use their own queue, about 1 s apart with no parallel calls. Replies are cached 24 h in the existing IndexedDB cache. One page per Find, and one more each time the bracket, theme or budget changes; a change back loads from cache.

## Flow

1. **Find suggestions** fetches the EDHREC page for the commander at the deck's saved or estimated bracket (see Bracket), then looks the names up on Scryfall.
2. Upgrades show as soon as prices arrive. Deck roles load next, as today. Roles for the top 60 candidates come last: 4 role tags × 2 name batches, so 8 searches. Swaps and Cheaper use roles, and until they load they say matching is approximate.
3. Changing the bracket, theme or budget reloads only the EDHREC page and the Scryfall lookups for new names. Deck edits recompute locally, as today.

## Scoring

`score = inclusion + max(0, synergy) + 0.3 if owned`

- On Edgar's page: Captivating Vampire 0.82 + 0.72 = 1.54, Exquisite Blood 0.51 + 0.43 = 0.94, Skullclamp 0.61 + 0.32 = 0.93, Sol Ring 0.92 + 0.04 = 0.96, Path to Exile 0.49 + 0.01 = 0.50. Popular staples and cards specific to this commander both rank, and cards special to the commander rank first.
- **Keep score** for a deck card uses the same formula without the owned bonus. A deck card that isn't on the page (under about 4% inclusion) scores 0, so it's the first cut candidate unless marked Keep.
- **Reason line:** "In 51% of Edgar Markov decks · +43% synergy · owned". The role is added when known.
- Guarantees stay the same: never a card that's banned, outside the color identity, already in the deck or unpriced.

## Upgrades layout

- **Source line:** "From 52,525 Edgar Markov decks on EDHREC", linking to the EDHREC page. This also serves as the credit.
- **Controls:**
  - **Bracket:** All decks, or brackets 1–5 with deck counts. See Bracket for the starting value.
  - **Theme:** All, or the page's 20 biggest themes with deck counts. Edgar's page lists 113.
  - **Price:** Any, Budget, Mid or Premium. These are the v1 tiers, now a filter. Budget also reads EDHREC's `/budget` page, with any bracket and theme.
- **Gaps:** compares the deck's card-type counts with the average deck. A type the deck has 3 or more fewer of than typical gets a line: "Artifacts: you run 3, typical is 9". Those categories show first.
- **Categories:** EDHREC's lists in its order: Creatures, Instants, Sorceries, Utility Artifacts, Mana Artifacts, Enchantments, Planeswalkers, Utility Lands, Lands.
  - Cards from New Cards, Top Cards and High Lift go into their type's category; no card shows twice.
  - Each category shows its top 5 by score, with **Show more** for 5 more at a time.
  - An empty category is hidden.
  - Basic lands are never suggested.
- **Each card:** thumbnail, name linked to TCGplayer, price, reason line and an **Add** button, as today.

## Bracket

The deck's bracket isn't recorded anywhere yet, so the starting value is a guess from Game Changers (`is:gamechanger`, 53 cards on 2026-11-03), checked with the deck's names in one batched search:

- no Game Changers: Core (2)
- 1–3: Upgraded (3)
- 4 or more: Optimized (4)

The guess can't tell 1 from 2 or 4 from 5, so the label says "estimated". A pick you change is saved with the deck, but not in share links. A bracket page with fewer than 50 decks shows all decks instead, with a note.

## Swaps and Cheaper

- These keep v1's rules: lowest keep score cut, a shared role preferred, lands only for lands, never cut the commander, basics or kept cards, and only improvements. The scores are now the EDHREC ones.
- When roles are unknown for a pair, they match on EDHREC category instead, so an artifact replaces an artifact. The reason says so ("Both artifacts").
- Cheaper replacements also accept a same-category match when roles are unknown.

## Fallback: wider Scryfall rules

Used when the commander isn't on EDHREC (403), EDHREC doesn't answer, or its reply isn't the expected shape. A notice says: "EDHREC has no data for this commander (or didn't answer), so these are based on card rules, not real decks."

- **Roles:** the four core roles plus `otag:` tutor, recursion, protection, counterspell, mana-rock, token-generator and sacrifice-outlet. Each tag is verified against Scryfall before it's used.
- **Themes:** v1's six plus artifacts matter, enchantments matter, spells matter, ETB/blink, landfall and equipment/auras. A theme the commander's own rules text names counts even below the 5-card minimum.
- **Scoring:** v1's formula.
- **Layout:** the same categories (by card type) and the same price filter. There are no gaps, bracket or theme controls, since those need EDHREC.

## Errors

- **EDHREC fails:** use the fallback with its notice; Find again retries EDHREC.
- **Scryfall lookup fails partly:** show what loaded and name the missing batch, as today. If it fails completely, show "Couldn't reach Scryfall".
- **Stale replies:** a bracket or theme change while loading uses the run number, as today. Only the newest pick draws.

## Testing

- **Fixtures:** real EDHREC replies recorded with the existing record script (`RECORD=1`):
  - Edgar main page, a bracket page, a theme page and the budget page
  - a 403, a partner redirect, and a page missing `cardlists`
- **Unit:** slug (accents, apostrophes, commas, partners, double-faced fronts), page parsing and validation, scoring including the Edgar cases above, keep score for absent cards, bracket estimate, gaps, category grouping without duplicates, fallback trigger, the new themes, and `otag` verification.
- **E2E:** Edgar flow shows Skullclamp under Utility Artifacts and Exquisite Blood under Enchantments. Theme and bracket changes reload the list. The price filter works. A 403 shows the fallback notice. Swap and undo still work.
- **Live:** `EDHREC_LIVE=1` checks the real page shape before review.

## Out of scope

- Individual decklists (Archidekt and Moxfield block browser calls)
- Combos (EDHREC has `combocounts`; a later idea)
