#!/bin/sh
# Run a Codex task with live, watchable output (see the Claude/Codex roles ADR).
# Usage: tools/codex-run.sh <brief-file> [effort] [model]
#   effort: minimal|low|medium|high|xhigh (model_reasoning_effort); omit for Codex's default
#   model: a Codex model slug; omit for the default in ~/.codex/config.toml
# Watch: tail -f .codex-logs/latest.log   (PowerShell: Get-Content .codex-logs\latest.log -Wait)
# Final report: .codex-logs/result.md. Exit status is Codex's.
set -u
[ -f "${1:-}" ] || { echo "usage: $0 <brief-file> [effort] [model]" >&2; exit 2; }
model="${3:-}"
case "$model" in
  *[!a-z0-9.-]*) echo "model must be a lowercase slug (letters, digits, dots, dashes)" >&2; exit 2 ;;
esac
effort_arg=""
case "${2:-}" in
  "") ;;
  minimal|low|medium|high|xhigh) effort_arg="model_reasoning_effort=$2" ;;
  *) echo "effort must be minimal, low, medium, high or xhigh" >&2; exit 2 ;;
esac
brief="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$(dirname "$0")/.." || exit 2

# Codex can write the workspace, so a symlink it left here would redirect this script's
# writes (which run outside the sandbox) to any file the user owns.
[ -L .codex-logs ] && { echo ".codex-logs is a symlink; remove it and rerun" >&2; exit 2; }
mkdir -p .codex-logs
log=.codex-logs/latest.log
# A stale report from an earlier run must never read as this run's result.
rm -f .codex-logs/result.md "$log"
# Lean runs: turn off the desktop app's plugins and node_repl for this run only (their tool
# definitions ride along on every request; a coding task needs none). Interactive Codex keeps them.
lean=""
for p in codex-app-tools@openai-bundled browser@openai-bundled unified-computer-use@openai-bundled \
  visualize@openai-bundled computer-use@openai-bundled documents@openai-primary-runtime \
  pdf@openai-primary-runtime spreadsheets@openai-primary-runtime presentations@openai-primary-runtime \
  template-creator@openai-primary-runtime; do
  lean="$lean -c plugins.\"$p\".enabled=false"
done
lean="$lean -c mcp_servers.node_repl.enabled=false"
# If your toolchain must write outside the repo (a settings or cache folder), add it here with
#   -c "sandbox_workspace_write.writable_roots=['<path>']"
# and record the exception and its risk in the roles ADR.
# The brief goes in on stdin ("-"): no flag parsing, no command-line length limit.
codex exec -s workspace-write \
  ${effort_arg:+-c "$effort_arg"} ${model:+-m "$model"} $lean \
  -C . -o .codex-logs/result.md - < "$brief" > "$log" 2>&1
status=$?
echo "=== EXIT $status ===" >> "$log"
cp "$log" ".codex-logs/$(date +%Y%m%d-%H%M%S).log"
exit $status
