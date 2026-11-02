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
