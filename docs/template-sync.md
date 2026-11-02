---
description: Workflow improvements to send back to agentic-project-template; how /go logs rows and core/pack/local triage
status: current
updated: 2026-10-29
---
# Template Sync

This repo was created from [agentic-project-template](https://github.com/adolladivinity/agentic-project-template). Improvements to the workflow (skills, agents, rules, hooks, `/go`, the tutorial) are found here, mid-project, and drift away from the template unless something sends them back. This log is that something.

## How it works

1. **Log it at `/go`.** When a PR touches `.claude/`, `tutorial/`, `CLAUDE.md`'s workflow sections, or the toolbox's generic rows, `/go` adds a row below: what changed and where it belongs.
2. **Decide where it goes:** **core** (every project), **pack** (an optional pack under the template's `packs/`, such as `packs/codex/`), or **local** (this project only, nothing to send back).
3. **Template sync review:** every few weeks, or before starting a new project from the template, open a session in the template repo, read the open **core** and **pack** rows from each project's log, port them in one PR (generalised: no project names, paths, or tools), and mark the rows synced with the template PR number.

Only the review changes the template. Never edit the template directly from a project session.

## Log

| Date | Change | Files | Belongs in | Synced |
|---|---|---|---|---|
| 2026-11-02 | New path rule for async UI state (re-find after await, guard concurrent actions, drop stale replies); external-tools rule: partial results from parallel calls, silent truncation; testing rule: retrying assertions can pass on in-between states | `.claude/rules/ui-state.md`, `.claude/rules/external-tools.md`, `.claude/rules/testing.md` | core (ui-state could be a frontend pack) | |
