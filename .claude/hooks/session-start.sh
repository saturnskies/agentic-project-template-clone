#!/bin/bash
# Cloud sessions start in a fresh container: install the Superpowers plugin
# (the project's workflow backbone, enabled in .claude/settings.json).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

plugin="superpowers@claude-plugins-official"
installed="$HOME/.claude/plugins/installed_plugins.json"

# Idempotent: skip when already installed
if grep -q "\"$plugin\"" "$installed" 2>/dev/null; then
  exit 0
fi

claude plugin install "$plugin"
