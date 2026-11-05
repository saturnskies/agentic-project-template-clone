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
- **Build the new list after the `await`, not before.** `priced = [...priced, await price(card)]` spreads the old array first, so a removal, an Undo or another add made while pricing is silently reverted. Await into a variable, then re-find and build from the current state.
- **Keep empty live regions in the accessibility tree.** `display:none` on an empty `aria-live`, `role="status"` or `role="alert"` element means text added later may not be announced. Take an empty slot out of the layout with a 1px clipped, out-of-flow box instead, and check it with a test that looks at the DOM, not at what is visible.
- **Bump a run counter only when the action starts.** Bumping before an early return orphans the action still in flight: it sees itself as stale and never clears its "loading" state.
- **Close a modal `<dialog>` when its container is hidden or redrawn.** A modal left open in a hidden tab or a replaced view still blocks the whole page, unseen. Close open dialogs in the views you hide; redrawing removes them.
- **Timers and animations belong to a draw.** Give each screen draw an id and have a delayed step (a roll, a countdown) bail when the id has moved on, and lock the controls that could change state mid-step.
- **An overlap test must delay the step that can finish out of order.** Requests queued one at a time can't overtake each other; hold back a parallel step (lookups, not the serial page fetch), and prove the test fails with the guard removed.
- **A screen that stays mounted while hidden must not save its captured copy of shared data.** A deck screen still pricing in a hidden tab saved its old deck over a card another tab had added. Before saving, check the stored record has not moved on since this screen last saw it (an `updatedAt` or version); if it has, skip the save and let the app redraw the screen from the store when it is shown.
- **Form problems are said to assistive tech too.** Mark the field at fault `aria-invalid` and tie it to its message with `aria-describedby`; a pair of inputs (min and max) is a `role=group` with a name; a button whose label changes with its state does not also carry `aria-pressed` (two signals read the state twice).
