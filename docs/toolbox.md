---
description: Tools agents can use today by need (built here, installed and tested, no-account web tools); how to add a vetted tool
status: current
updated: 2026-11-04
---
# Toolbox

Tools an agent can use today, sorted by the need that should make you reach for each one: what this repo has built, what's installed and tested, and web tools that need no account. Check here before adding a library, MCP server, or extension. If nothing fits, go to the [tool watchlist](tool-watchlist.md): vetted tools that aren't set up yet, tools ruled out, and where to search next. Research notes are dated snapshots, so re-check a source before relying on a detail that may have changed.

## Adding a tool

Any agent that vets a tool records it so later sessions can reuse it:

1. Vet it against primary sources (its own site, repo, licence, registry) and write the evidence to `docs/research/` with the `research` skill.
2. Put it in **this file** only once it's installed or configured (or needs no install) and you have exercised it. Otherwise it goes in the [watchlist](tool-watchlist.md) as a **Candidate** or **Ruled out**. Phrase the first column as the need that should trigger it.
3. Link the row to its research note, and keep secrets and API keys out of both files.
4. Commit the change on its own.

Each tool has one row in one file. When its status changes (installed, removed, superseded), move or edit that row rather than adding a second one.

## Built here

The repo's own scripts and modules. Reuse or extend these before reaching for an outside tool (see `.claude/rules/reuse-ladder.md`).

| Need | Script | Details |
|---|---|---|

## Ready now

Installed or configured, and exercised. Record the version and the exact command that worked.

| Need | Tool | How |
|---|---|---|
| Design, critique, audit or polish UI (hierarchy, type, color, a11y, UX copy) | `impeccable` skill (v4.8.0, Apache 2.0) | `/impeccable critique <target>`, `/impeccable audit`, `/impeccable polish`. Skill only; hooks and live mode deliberately off. Engine download not yet exercised here. See Gotchas in `.claude/skills/impeccable/SKILL.md` |

## Human tools

Tools the user runs; agents cannot drive them. Suggest one when it fits the user's task.

| Need | Tool | Notes |
|---|---|---|
