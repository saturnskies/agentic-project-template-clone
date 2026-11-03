---
description: Uses EDHREC's unofficial per-commander JSON (inclusion, synergy, themes, brackets, average deck) as the main recommendation signal, called from the browser, with Scryfall rules as the fallback
status: draft
updated: 2026-11-03
---
# ADR-005: EDHREC commander data for recommendations

## Context

v1 suggestions come only from Scryfall: about 8 searches (tribe, themes, four roles), ranked by popularity across all of Commander. Cards decks with that commander actually play but that match none of those searches are never offered. The owner saw this with artifacts and enchantments outside the deck's tribe or main mechanic. The owner wants recommendations based on real decks with the same commander.

The site is static with no server ([ADR-001](ADR-001-swapsmith-stack-and-hosting.md)), so any deck data must be callable from the browser and from the Android app ([ADR-003](ADR-003-android-apk-capacitor.md)). Design detail is in the [recommendations revamp spec](../superpowers/specs/2026-11-03-recommendations-revamp.md).

## Decision

- **Main signal:** EDHREC's commander pages at `https://json.edhrec.com/pages/commanders/<slug>…json`, fetched from the browser. They send `access-control-allow-origin: *`, on errors too (checked 2026-11-03). Each page combines every deck EDHREC knows for that commander and gives each card's inclusion and synergy. It also has the commander's themes, bracket and budget pages, and the average deck's type counts.
- **Prices and legality stay on Scryfall.** EDHREC supplies names and deck statistics only.
- **Fallback:** wider Scryfall rules when EDHREC has no page (403), doesn't answer, or changes its reply shape. The UI says which source a list came from.
- **Being polite:** one request about every second, never in parallel, and replies cached 24 h. Each list credits and links EDHREC.
- **Code home:** `src/edhrec/` is the only code that calls EDHREC. It reuses the Scryfall client's queue, retry and cache, given a different base URL and spacing.

## Alternatives Considered

### Individual decklists from Archidekt or Moxfield ("top 100 decks")
- Pros: real lists the owner could inspect
- Cons: Archidekt only lets `localhost:3000` call its API, and Moxfield answers 403, so the browser can't call either. It would also take 100 requests per commander, against far fewer decks than EDHREC combines.
- Rejected: can't be called from a static site

### Scryfall rules only (wider roles and themes)
- Pros: official, stable API and fully testable offline
- Cons: still guesses fit from rules text. It can't know what this commander's decks play, which is the owner's complaint.
- Rejected as the main signal; kept as the fallback

### A small proxy server or a scheduled scrape into the repo
- Pros: could reach sources that block browsers, and could shield the app from EDHREC changes
- Cons: adds a server or a CI job to run and pay for. A scrape goes stale and would need a list of commanders to fetch.
- Rejected: against ADR-001's no-server, zero-cost goal while EDHREC allows browser calls

## Consequences

- Recommendations reflect real decks for the commander, including off-tribe artifacts, enchantments and lands.
- The endpoint is unofficial and could change or close without notice. The fallback keeps suggestions working, and the opt-in live test (`EDHREC_LIVE=1`) catches shape changes before review.
- Find suggestions makes one more cross-origin request. EDHREC's cookie-free JSON host doesn't need the service worker changed, since cross-origin requests pass through it.
- If EDHREC asks apps to stop using the endpoint, or blocks it, this ADR is superseded and the fallback becomes the only source.
