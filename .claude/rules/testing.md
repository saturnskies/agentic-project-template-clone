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
