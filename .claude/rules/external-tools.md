---
paths:
  - "scripts/**"
  - "src/**"
---

# External Tool Rules

For code that calls an outside program, server, or API:

- **Fixtures come from the real tool.** Before writing a fake, capture real replies (success, error, empty body, cancelled) and build the fake from those, noting the tool version. A fake built from assumptions agrees with the bug: an empty reply body or a `Duration: N/A` field slips straight through.
- **Run the live test before review.** If an opt-in live test (`<TOOL>_LIVE=1`) can run, it runs before review, and the PR says whether it did.
- **Every plan task lists its failure paths**, each with a test:
  - What is left on disk when a step fails: partial, empty, or rejected outputs are deleted, never left looking finished
  - Each reply the tool can give: empty, missing field, `N/A`, non-zero exit, timeout
  - Another job already running, or one starting between our check and our action
  - Reused names: nothing a log or record points to gets overwritten
- **Checks cover the whole input.** Validate everything a request or command could contain (every field, nested values), not just the shape of today's example.
- **Validate first, then fill in user text.** User text can contain anything, including strings that look like file names or flags. Every check runs before the job starts, so nothing raises after the expensive work is done.
- **One failed call never discards the others.** When several calls to an outside API run together (searches, batches), collect what succeeded, report what failed, and throw only if all failed. `Promise.all` over optional calls throws away good results on the first error.
- **Silent truncation exists.** Check a long request against the real API before relying on it; Scryfall quietly drops the end of a query past ~1,000 characters, which loses data without any error.
- **A failed variant falls back to the broader request, not to nothing.** When an optional refinement (a filter, bracket or theme page) fails or comes back empty, retry without it and say so; don't let one missing variant drop the whole source.
- **Follow a redirect only to the same resource.** Check that a redirect points at what was asked for (same id, same filters) before following it, or another item's data shows under this one's name.
- **A 200 does not mean the input was applied.** Scryfall answers an unknown keyword or a bad regex with 200 and a `warnings` list, drops that term, and returns every card (`(bogus:thing)` returned all 32,116 Commander cards). Show the reply's warnings, and run a live test that every term you build comes back with no warning.
