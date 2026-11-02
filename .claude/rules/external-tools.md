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
