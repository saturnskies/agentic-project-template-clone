---
description: Optional Codex pack: Claude plans and reviews, Codex implements; what's in it, how to enable it, setup
status: current
updated: 2026-10-29
---
# Codex Pack (optional)

[← Tutorial index](../../tutorial/README.md)

A second coding agent for projects that have both Claude Code and the [Codex CLI](https://github.com/openai/codex). Claude designs, plans and reviews; Codex implements the plans on its own usage pool, so neither tool's limits become the bottleneck. Skip this pack if you only use Claude Code.

## What's in it

| File | Goes to | What it does |
|---|---|---|
| `AGENTS.md` | repo root | Codex's instructions: a short file that links to `CLAUDE.md`, the rules and the ADRs instead of copying them |
| `tools/codex-run.sh` | `tools/` | Runs `codex exec` in the workspace-write sandbox with a live log (`.codex-logs/latest.log`), the final report in its own file (`.codex-logs/result.md`), and Codex's exit status preserved |
| `tools/codex-gate.sh` | `tools/` | Run after each Codex task: fails with "blocked" when Codex exited 0 but left no changes, then reruns the tests itself instead of trusting the report. Never commits |
| `docs/decisions/ADR-NNN-claude-codex-roles.md` | `docs/decisions/` | The roles decision: who plans, who implements, review once per slice, Codex never commits, one writer at a time |

## Enable it

From the project root, in Git Bash or another POSIX shell:

```bash
cp packs/codex/AGENTS.md .
mkdir -p tools && cp packs/codex/tools/codex-*.sh tools/
last=$(ls docs/decisions | sed -n 's/^ADR-0*//p' | cut -d- -f1 | sort -n | tail -1)
n=$(printf '%03d' $(( ${last:-0} + 1 )))
sed -e "s/ADR-NNN/ADR-$n/" -e '/^<!-- Codex pack:/,/^$/d' packs/codex/docs/decisions/ADR-NNN-claude-codex-roles.md > "docs/decisions/ADR-$n-claude-codex-roles.md"
printf '\n# Codex run logs (tools/codex-run.sh)\n.codex-logs/\n' >> .gitignore
tools/doc-index.sh
```

Then:

1. Read the new ADR, adjust anything that doesn't fit, and set its `status` to `current`; rerun `tools/doc-index.sh`.
2. Add `AGENTS.md`, `tools/codex-run.sh` and `tools/codex-gate.sh` to CLAUDE.md's **Where Things Live** and to the **Built here** table in `docs/toolbox.md`.
3. Delete `packs/` once every pack you want is enabled, or keep it for later.

## Set up Codex

```bash
npm install -g @openai/codex
codex login
```

Then, inside Codex (`codex` in the project folder):

1. `/plugins` → search **Superpowers** → install. Codex then uses the same plan → TDD → verify workflow as Claude.
2. Codex reads `AGENTS.md`. Nothing else to configure.

**Windows sandbox:** Codex runs commands as a restricted Windows account (`CodexSandboxUsers`). If a tool your tests need fails with "Access is denied" inside Codex, grant that account read-and-execute on just those executables (`icacls <exe> /grant "$env:COMPUTERNAME\CodexSandboxUsers:RX"`, undo with `/remove`) and record the grant in the ADR. The group exists after Codex has run once. **Check:** `codex sandbox -- <tool> --version` prints the version.

## Hand work to Codex

Claude does this, but it's worth knowing what happens:

```bash
tools/codex-run.sh <brief-file> [effort] [model]   # each plan task names an effort
tools/codex-gate.sh <test command>                 # e.g. tools/codex-gate.sh npm test
```

Start each run from a clean working tree (commit or stash first): the gate reads any change as Codex's work, and refuses changes to the protected paths listed in `codex-gate.sh` (hooks, settings, the scripts themselves). The run's exit code only says Codex ran; whether the task worked is in `.codex-logs/result.md`, and the gate confirms it against the tests. Watch a run live with `tail -f .codex-logs/latest.log` (PowerShell: `Get-Content .codex-logs\latest.log -Wait`). Logs stay out of git. The block in `codex-run.sh` that turns off the Codex desktop app's plugins is optional; trim it if your Codex version rejects a key.

An unattended chain of tasks runs `codex-run.sh`, then `codex-gate.sh`, then commits only if the gate passed, and stops at the first failure. Plans run this way carry the routing table and measurements from CLAUDE.md's orchestrator protocol.

**One writer at a time:** don't let Codex edit files from its own terminal while a `codex-run.sh` run is going, and don't edit the same working tree from Claude meanwhile. Give Codex its own `git worktree` if both need to work at once.
