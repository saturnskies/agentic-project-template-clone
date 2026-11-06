---
description: Swap from a card design — tap a deck card, see similar cards from decks with the same commander that fit the deck's mechanics, with popularity and a plain comparison side by side, and swap in one tap
status: current
updated: 2026-11-06
---

# Swap from a card: design

## Intent

The Swaps tab starts from the best cards to add and picks a weak card to cut. The owner's real moments start the other way round: "this mana rock isn't as good as another mana rock", "this dual land is slower than another dual land", "this elf makes +1/+1 counters, but another elf does it more efficiently". They hold a card they doubt and want to see better cards that do the same job. This serves the app's main purpose: improve the decks you own or are building.

## Goals

- Tap any card in the deck and see cards that do a similar job, drawn from decks with the same commander.
- Every option **fits the deck's mechanics**: it supports the deck's tribe or themes, or fills the same role the doubted card fills, never a card that changes what the deck does.
- Each option shows two things side by side, both wanted by the owner: the **popularity** among decks with this commander, and a **plain comparison** with the card you hold, with the card text shown next to your card's text.
- **Quick:** the dialog opens at once and options appear without a wait once suggestions are loaded.
- Swap in one tap with the existing undo.

## Non-goals

- Multi-select swaps, "not interested" memory, images or embeddings for similarity.
- A comparison that explains every rules-text difference (see Comparison).
- Replacing the Swaps and Cheaper tabs, which stay as they are.

## Anti-goals (a failure even if it technically works)

- An option that does a different job from the card you tapped.
- An option that doesn't fit the deck's mechanics (an off-tribe creature offered for a tribal deck's lord).
- A wait or spinner each time the dialog opens.
- A claim of "better" the app can't back. Where it can't state a difference, it says nothing rather than guess.

## What the owner decided

- **Entry:** tap a card's name in the deck list; a dialog opens (same pattern as the printing picker). The Owned, Keep, printing and remove controls stay on the row.
- **Layout (mockup "A"):** your card pinned on top, with cost, price, text and popularity. Options listed below it, each with name (TCGplayer link), cost, price, popularity, the comparison line, card text, and a Swap button.
- **Popularity and comparison both shown.** When no clear difference can be stated, show popularity and the text side by side only. The card stays in the list.
- **Show all similar, flag the better ones:** cards less played than yours still appear, unflagged. A **Better fit** flag marks cards more played than yours for this commander.
- **Keep:** a card marked Keep can still be tapped and gets options and a working Swap. Keep only keeps it out of the automatic cut suggestions (Swaps and Cheaper).
- **No EDHREC page for the commander:** use the Scryfall rules fallback and say matching is approximate.

## Constraints

- Static site, no server: Scryfall and EDHREC are called from the browser through the existing clients (`src/scryfall/`, `src/edhrec/`), with the existing request spacing and 24 h cache. No new EDHREC or Scryfall call path.
- The v1 guarantees hold: never a card that's banned, off the deck's colors, already in the deck, unpriced, or a basic land. A land is only matched to lands. Nothing is offered for the commander or basic lands.
- Suggestion data comes from the existing recommendations flow ([spec](2026-11-03-recommendations-revamp.md)); one source of truth for the scored pool.

## Design

### Flow

1. Tapping a card opens the dialog with the card pinned on top.
2. If suggestions are already loaded, options show immediately from the in-memory pool. If not, the dialog starts the same load as Find suggestions, shows a loading line, and fills in when it arrives. A failed load keeps the dialog usable and says so.
3. Swap calls the existing `actions.swap(cutOracleId, add)` and the existing undo toast. The dialog closes on swap.

### Choosing options

Candidates are the EDHREC page's cards (about 290, already with Scryfall text, price and legality), or the v1 pool without a page. For each candidate:

1. **Similar job:** a similarity from 0 to 1, computed locally. Main signal is overlap of normalised rules text (own name replaced by `~`, reminder text removed, numbers and mana symbols normalised); a bonus for shared role tags (ramp, card draw, removal, board wipe); a smaller bonus for the same main type. A land only matches lands. Below a minimum similarity the card isn't shown.
2. **Fits the deck:** the candidate must not drift from the deck's profile (`deckProfile`: tribe and themes). It fits if it is of the deck's tribe or matches one of its themes, or shares a role with the tapped card, or its text similarity is above a high bar. The last clause is needed because role tags (Scryfall `otag`, via `deckRoles`) cover only ramp, card draw, removal and board wipe, and are looked up for the 60 best candidates only. A dual land or an elf has no role tag, so for them text similarity carries the match.
3. **Order:** similarity first, then the commander score (`inclusion + max(0, synergy) + owned bonus`). Top 10, with **Show more** for 10 more.
4. **Better fit flag:** the candidate's commander score is higher than the tapped card's (`edhrecKeepScores`; a card the page doesn't list scores 0).

### Comparison

A plain line such as "Costs 1 less · enters untapped instead of tapped" for differences the data states reliably: mana cost, enters tapped or untapped, mana produced, power and toughness, loses or gains a stated ability (only when the text for it is identical on one side). Free-text differences such as "adds two counters instead of one" are not claimed. A pure function `compare(card, candidate)` returns zero or more short phrases; none means popularity and text only.

### Speed

- No extra requests for opening the dialog once the pool is loaded; similarity and comparison are pure functions over the loaded cards. Target: options render in under 100 ms for a 100-card deck on a mid-range phone (my call; checked in a test with a timer on the pure functions).
- The pool loads on the first dialog open or first Find suggestions, whichever comes first, and is reused by both (my call; preloading on deck open would add EDHREC requests the owner never asked for).

### Where it lives

- `src/lib/similar.ts` — `similarity`, `compare`, `similarTo`; pure, unit-tested.
- `src/ui/cardDialog.ts` — the dialog.
- `src/ui/deckView.ts` — the card name becomes the trigger.
- `src/ui/suggestions.ts` — exposes the scored pool and its loading state to the dialog.

## Left to the builder

- Weights, minimum similarity and the exact fit rule: starting guesses, tuned against recorded fixtures (Edgar Markov, Atraxa, and a mana-rock and dual-land heavy deck) so mana rocks and dual lands produce sensible lists. Report the tuning numbers in the plan's checkboxes.
- Dialog styling within the existing picker look; 44 px touch targets at phone width; focus trap and Escape to close.

## Testing

- Unit: text normalisation, overlap, role and type bonuses, the land rule, deck-fit filter, ordering, Better fit flag, comparison phrases, Keep allowed, commander and basic lands excluded.
- Fixture check: Skullclamp's neighbours are other draw artifacts and not Sol Ring; a mana rock's list contains other mana rocks only.
- E2E: tap card, dialog opens, options appear from fixtures, Swap changes the deck, undo restores; the no-EDHREC fallback note; a Keep card shows options.

## Calls made while writing this (mine, not the owner's; change any of them)

- **Role tags exist, partly.** `src/scryfall/roles.ts` tags four roles through Scryfall `otag` searches, and `src/ui/suggestions.ts` looks them up for the deck and the 60 best candidates. This design reuses them and does not build a new tagger; dual lands, elves and the like are matched by text similarity and the deck profile.
- **The pool is the whole EDHREC page.** `res.candidates` holds every page card as a full Scryfall card, so mana cost, produced mana, power and toughness and text are all there for `compare`. The scored pool and loading state live inside the suggestions panel's closure today and need exposing to the dialog (a small refactor, first task of the plan).
- **No Scryfall page for the commander (fallback):** the dialog shows what the v1 pool contains for that card's job, with "No similar cards found for this deck yet." when none. No extra searches keyed to the tapped card, which keeps the dialog fast.
- **Better fit** means the candidate's commander score beats the tapped card's by at least 0.1. A tapped card the page doesn't list (under about 4% of decks) shows "Not on this commander's page" and every option may be flagged, which is true to the data.
- **Double-faced and split cards:** compare the front face's text and type line; a modal land-spell counts as a land only when its front face is a land.
- **Fixtures:** record one extra commander with many mana rocks and dual lands (for example an artifact-heavy one) into its own flow's fixture map only, so the pinned e2e totals of the other flows don't move.
- **After a swap:** the dialog closes and the pool is rescored against the new deck (`edhrecScored` already takes the deck's card ids), so the swapped-in card no longer appears as an option. The pool stays loaded across tab changes within the same deck view.
