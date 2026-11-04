---
paths:
  - "src/ui/**"
---

# UI State Rules

For screen code with async actions (fetching, pricing, swapping):

- **Re-find state after an `await`.** A row or card object captured when the screen drew can be replaced while the action waits. Look it up again by a stable id (an Oracle ID) and bail out if it is gone, rather than trusting the captured object.
- **One action of a kind at a time.** Disabling only the clicked button lets a second button start the same change; guard the action itself.
- **Ignore replies from an older request.** Give each user-started load a run number and drop results whose run is no longer current, so a slow earlier reply can't overwrite a newer one.
- **Redraw everything a change feeds.** When a toggle changes data another panel reads (owned cards → cheaper replacements), refresh that panel too.
- **Bump a run counter only when the action starts.** Bumping before an early return orphans the action still in flight: it sees itself as stale and never clears its "loading" state.
- **An overlap test must delay the step that can finish out of order.** Requests queued one at a time can't overtake each other; hold back a parallel step (lookups, not the serial page fetch), and prove the test fails with the guard removed.
