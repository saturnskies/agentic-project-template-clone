#!/bin/sh
# Gate a finished Codex run before anything is committed, so an unattended chain stops
# instead of testing or committing the old code.
# Usage: tools/codex-gate.sh <test command...>   e.g. tools/codex-gate.sh npm test
# Exit 0: Codex left changes and the tests pass. Exit 1: blocked or failing. Commits nothing.
set -u
[ $# -gt 0 ] || { echo "usage: $0 <test command...>" >&2; exit 2; }
cd "$(dirname "$0")/.." || exit 2
mkdir -p .codex-logs
# Codex exiting 0 only means it ran. No changes usually means it stopped blocked;
# its reason is in result.md. Untracked files count as changes.
if [ -z "$(git status --porcelain)" ]; then
  printf '%s\n' "codex-gate: Codex left no changes (blocked? see .codex-logs/result.md)" >&2
  exit 1
fi
# Files that run outside Codex's sandbox (hooks, settings, these scripts) are off limits;
# a change there needs a human, not a green gate. This list is the one home for them:
# add any other path your project runs unsandboxed (git hooks, CI config).
protected="$(git status --porcelain -- .claude .mcp.json AGENTS.md tools/codex-run.sh tools/codex-gate.sh)"
if [ -n "$protected" ]; then
  printf '%s\n' "codex-gate: Codex changed protected files; review by hand:" "$protected" >&2
  exit 1
fi
# Rerun the tests here instead of trusting the report. No pipe after the command,
# so $? is the test command's own status.
"$@" > .codex-logs/gate-tests.txt 2>&1
status=$?
if [ $status -ne 0 ]; then
  printf '%s\n' "codex-gate: tests failed (exit $status, see .codex-logs/gate-tests.txt); changes left uncommitted" >&2
  exit 1
fi
printf '%s\n' "codex-gate: changes present and tests pass"
