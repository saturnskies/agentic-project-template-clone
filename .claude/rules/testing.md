---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/test/**"
  - "**/tests/**"
  - "**/test_*.py"
---

# Testing Rules

- Test behavior through public interfaces, not implementation details
- Each plan phase must add or update tests at the level it touches (unit, integration, end-to-end)
- Never weaken or delete a failing test to make a change pass — fix the code or ask
- A bug fix starts with a failing test that reproduces it
- A test runner that exits 0 must have run at least one test and loaded every test file: check for load or compile errors and a zero test count, not just the exit code. Some runners exit 0 when a test file fails to compile; wrap those in a script that fails on it
- Retrying assertions (Playwright `expect`) can pass on an in-between state. When a test checks that something does NOT happen (no duplicate, no warning), let the action settle first, and prove the test fails on the old code before trusting it
- When a behavior change moves what a test checks, re-pin the same kind of assertion at the new values (counts, first items) instead of dropping to range-only checks
- In Playwright, `route.fetch()` goes to the real network; build a modified reply from the recorded fixture instead
- A mutation check that still passes means the guard is redundant with something else (a browser default such as focus restore, or a second guard). Write the test for the case only the guard covers (focus after the opener is replaced), remove both guards together, or delete the redundant one.
