---
description: Swap from a card spec — tap a deck card, see similar cards other decks with the same commander play, flag the ones that beat it, swap in one tap
status: draft
updated: 2026-11-06
---

# Swap from a card: design spec

## Problem

The Swaps tab starts from the best cards to add and picks a weak card to cut for each. You can't start from a card you already doubt and ask "what do other decks with this commander play instead?"

## Goal

Tap any card in the deck, see cards that do a similar job and are popular in other decks with the same commander, with the better ones flagged. Swap with one tap, undo like today.

## Flow

1. Tapping a deck card's name opens a **card dialog** (same pattern as the printing picker): image, type, oracle text, price, and a **Find swaps** section. The existing Owned, Keep, printing and remove controls stay on the row.
2. The section lists similar cards from the commander's EDHREC page, best match first. No new network calls beyond what Find suggestions already loads: the page's ~290 cards already have Scryfall data (oracle text, price, legality). If suggestions haven't loaded, the dialog loads them first, with a loading line.
3. Each option shows: thumbnail, name (TCGplayer link), price and price difference against the card, reason line, a **Better fit** flag when it outscores the card, and a **Swap** button. Swap reuses `actions.swap(cutOracleId, add)` and the existing undo toast.
4. No EDHREC page: the v1 Scryfall pool (rules fallback) supplies the candidates, with a note that matching is approximate.

## Similarity

A pure function `similarity(card, candidate)` in `src/lib/similar.ts`, 0 to 1:

- **Text overlap (main signal):** oracle text with the card's own name replaced by `~`, reminder text (parentheses) removed, numbers and mana symbols normalized, split into words; Jaccard overlap of word pairs. Catches "sacrifice a creature: …" outlets and "whenever … dies" payoffs that role tags miss.
- **Role match:** shared role tags (ramp, card draw, removal, board wipe) add a fixed bonus.
- **Type match:** same main type adds a smaller bonus; a land only matches lands.
- **Threshold:** below a minimum similarity a candidate is not shown, so a swap never changes the deck's job.

Thresholds and weights are starting guesses, tuned against the recorded fixtures (see Testing).

## Ranking and the Better fit flag

- **Order:** similarity first, then candidate score (`inclusion + max(0, synergy) + owned bonus`, as in [recommendations spec](2026-11-03-recommendations-revamp.md#scoring)). Top 10, with **Show more** for 10 more.
- **Better fit:** candidate score > the deck card's keep score (`edhrecKeepScores`; a card the page doesn't list scores 0). Worse or equal options still show, unflagged, with a muted "Less played than {card}" note so the flag isn't the only signal.
- **Guarantees as elsewhere:** never banned, off-identity, already in the deck, unpriced or a basic land. Never offered for the commander or basic lands. A card marked Keep shows a note and no options unless the user unpins it.

## Where it lives

- `src/lib/similar.ts` — `similarity`, `similarTo(card, candidates, …)`; pure, unit-tested.
- `src/ui/cardDialog.ts` — the dialog; takes the deck card, the suggestion pool and `actions.swap`.
- `src/ui/deckView.ts` — card name becomes the dialog trigger.
- `src/ui/suggestions.ts` — exposes the scored pool (EDHREC or fallback) and loading state to the dialog, one source of truth.

## Out of scope

Multi-select swaps, saving "not interested" choices, similarity from card images or embeddings.

## Testing

- Unit: normalization (name to `~`, reminder text, numbers), overlap, role and type bonuses, the land rule, threshold, ordering, Better fit flag, Keep and commander guards.
- Fixtures: for Edgar Markov, Skullclamp's neighbors include other draw artifacts and not Sol Ring; checked against the recorded EDHREC page.
- E2E: tap a card, dialog opens, options appear from fixtures, flagged option swaps, deck updates, undo restores; fallback note when EDHREC answers nothing.
- Accessibility: dialog labelled and focus-trapped, Escape closes, 44 px targets on phone width.

## Open questions

1. Should the dialog also show *why* two cards matched (shared words or role)? Proposed: show the shared role or type only, not words.
2. Weight and threshold tuning needs real decks; propose a small calibration pass on 3 recorded commanders before merging.
