---
description: Claude designs and reviews, Codex implements via codex exec; integration flags, shared AGENTS.md workflow
status: draft
updated: 2026-10-29
---
# ADR-NNN: Claude designs and reviews, Codex implements through `codex exec`

<!-- Codex pack: copy to docs/decisions/, replace NNN with the next ADR number in the file name and title, review each line, then set status to current. -->

## Context
The project uses both Claude Code and the Codex CLI and wants to use both without one tool's usage limits becoming the bottleneck. Claude holds the project's design history, skills and workflow. Codex has its own usage pool. Both run on the same machine and the same working tree.

## Decision
- **Roles:** Claude does design, specs, plans and review. Codex writes code and tests from Claude's plans.
- **Integration:** Claude calls `codex exec` through `tools/codex-run.sh` (`-s workspace-write -C <repo> -o <result-file>`), passing a brief that names the plan and task. Read-only questions use `-s read-only`. Never `--dangerously-bypass-approvals-and-sandbox`.
- **Shared workflow:** Codex has the Superpowers plugin installed and reads [AGENTS.md](../../AGENTS.md), which points to `CLAUDE.md` and `.claude/rules/` instead of copying them. Project skills in `.claude/skills/` stay Claude's.
- **Review gate per slice, not per task:** Codex verifies each task itself (TDD, the plan's test command). `tools/codex-gate.sh` reruns the tests after each run and stops when Codex left no changes. Claude reviews once per slice before the PR, plus any change to architecture or any task Codex reports as blocked.
- **Commits:** Codex leaves changes uncommitted. Claude reviews, runs the tests, and commits per file.
- **One writer at a time:** Claude and Codex never edit the same working tree at once. Take turns, or give Codex its own worktree.

## Alternatives Considered

### Codex through an MCP server
- Rejected unless a stable `codex mcp-server` exists in the installed CLI version: `codex exec` does the same job with no extra server.

### Claude reviews every task
- Rejected: it spends Claude usage re-checking what the tests already prove. A tight plan with exact test commands, plus one review per slice, catches the same problems.

### A separate skill and agent tree for Codex
- Rejected: two copies of the same rules drift. Superpowers ships for both tools, and `AGENTS.md` links to the shared docs.

## Consequences
- Plans must name exact test commands and expected results, because they're what Codex checks itself against.
- Reviewing only once per slice means a bad task can sit unreviewed until the slice ends. Small slices limit that risk.
- If Codex's `exec` flags change in a later CLI version, update `tools/codex-run.sh` and this ADR.
- **Sandbox exceptions:** list here every writable root added to `tools/codex-run.sh` and every file permission granted to Codex's sandbox account, with the risk each one carries.
