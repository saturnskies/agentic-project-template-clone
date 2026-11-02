---
name: techdebt
description: Use for a quick, prioritized tech-debt list — dead code, duplication, stale TODOs, half-finished migrations — or a cleanup list before a refactor. For a deep multi-session drift audit, use the codebase-archaeologist agent instead.
context: fork
agent: Explore
argument-hint: [path]
---

# Tech Debt Scan

Survey `$ARGUMENTS` (default: whole repo) and return a prioritized list. Runs in a forked context so the main session only receives the report.

## Look For

- Half-finished migrations — two patterns for the same concern (these actively mislead the model)
- Duplicated logic that should be one function
- Dead code, unused exports, stale TODOs
- Missing tests around frequently changed files (`git log --format= --name-only | sort | uniq -c | sort -rn | head`)

## Output

A table: `Item | Location | Impact | Effort | Suggested fix`, highest impact-to-effort first. No edits.

## Gotchas
<!-- Append false positives and missed categories here -->
