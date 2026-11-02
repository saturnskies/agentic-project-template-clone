---
description: Finish a task — verify, review, simplify, then open a PR, using the Superpowers skills in order
allowed-tools:
  - Skill
  - Bash
  - Read
  - Edit
---

# Go

Take the current change from "I think it works" to a reviewed PR by chaining the Superpowers skills. Size the review to the change: review agents cost tokens, and a separate context finds bugs, not a larger number of agents.

## Execution Contract

Stop and report to the user — do not open a PR — if verification fails or review returns a critical issue you cannot fix.

## Pick the tier first

Look at `git diff --stat main...HEAD` and the files touched, then state the tier in one line.

| Tier | When | Review | Simplify |
|---|---|---|---|
| **Docs** | Only Markdown/text: docs, runbooks, research notes | None — run the inline checks only | None |
| **Normal** | Code, config, or scripts, with no high-risk area | One review subagent (default model) | One inline pass, no agents |
| **High-risk** | Touches auth, secrets, payments, personal data, permissions/hooks/settings, or LLM calls on untrusted input | Review subagent plus the `ai-generated-code-auditor` agent on Opus | `simplify` skill as written |

When unsure between two tiers, take the higher one.

## Steps

1. Use the Skill tool to invoke `superpowers:verification-before-completion` with the commands from CLAUDE.md, including `tools/doc-index.sh --check` in every tier. For the **Docs** tier, also check that relative links resolve, required sections exist, and no secret-shaped strings were added.
2. **Normal and High-risk only:** use the Skill tool to invoke `superpowers:requesting-code-review` against the diff from main. Fix critical and important findings, then repeat step 1.
3. **Normal:** review the diff yourself for reuse and simplification and apply the fixes. **High-risk:** use the Skill tool to invoke `simplify`. Repeat step 1 if anything changed.
4. **Lessons:** for each bug class that review or verification found (a pattern of mistake, not a one-off typo), add one line where the next session will load it: a `.claude/rules/` file for code habits, the relevant runbook's gotchas for tool behaviour, or this file's Gotchas for process. List the lessons in the PR description. Done when every bug class has a home or is named as a one-off.
5. **Template sync:** in a project made from the template, if the diff touches `.claude/`, `tutorial/`, CLAUDE.md's workflow sections, or generic toolbox rows, add a row to `docs/template-sync.md` saying whether it belongs in the template core, a pack, or is local. Skip silently otherwise, and always in the template repo itself.
6. Use the Skill tool to invoke `superpowers:finishing-a-development-branch` and choose the PR option. Commit one file per commit (per CLAUDE.md). Name the tier in the PR description.

## Gotchas

- Running review and simplify agents on a docs-only change spends tokens and finds nothing a link check wouldn't. That's why the Docs tier exists.
