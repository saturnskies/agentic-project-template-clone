---
description: Tutorial step 5: what is in the project (Superpowers, hooks, agents, docs) and how a first session goes
status: current
updated: 2026-10-29
---
# Step 5 — Your First Session

[← Tutorial index](README.md)

## What's in the project

| Piece | Where | What it does for you |
|-------|-------|----------------------|
| **Superpowers** plugin | `.claude/settings.json` | Brainstorm → plan → test-driven build → review → finish, triggered automatically |
| **Skills** | `.claude/skills/` | Security, docs/ADRs, frontend UI, browsing, grilling, handoff, retro, teach, prototype, research, tech-debt scan |
| **Agents** | `.claude/agents/` | Specialists with their own context: architect, reality-checker, security auditor, minimal-change engineer, DevOps, MCP builder, and more |
| **Commands** | `.claude/commands/` | `/go` (verify → review → simplify → PR), `/ralph-step` (loop demo) |
| **Hooks** | `.claude/hooks/` | Auto-format after edits; a one-time "did you verify?" nudge before Claude finishes |
| **MCP servers** | `.mcp.json` | Lightpanda (fast text browser, tried first), Playwright (headless Chromium), Context7 (library docs), DeepWiki (GitHub repo docs) |
| **Docs** | `docs/` | `docs/INDEX.md` (a generated map of every doc), ADRs, research, the toolbox, and the template sync log |

## Try these in order

1. **Learn something:** `/teach Claude Code skills and agents` — a short interactive course saved in `learning/` (just for you, git-ignored).
2. **Pick a stack:** *"help me choose a stack for <your idea>"* — Superpowers brainstorms with you, `software-architect` compares options, and the decision is recorded as `docs/decisions/ADR-001`. Then ask Claude to fill in the **Essential Commands** table in `CLAUDE.md`.
3. **Stress-test the plan:** *"grill me on this plan"*.
4. **Build it:** approve the plan and let Superpowers work task by task.
5. **Finish:** `/go` — verification, an independent review, simplification, and a pull request.
6. **Improve the setup:** `/retro` after any session that went sideways.

## Daily habits

The short version of [`tips.md`](tips.md):

- **One task, one session.** `/clear` before each new task. Keep context under ~40% (`/context`), and `/compact` with a hint before it fills.
- Pick the effort for the task (`/effort`); Claude suggests one at the start.
- Rewind (double `Esc`) instead of piling on corrections.
- Ask for subagents only for big searches or reading jobs where you just need the conclusion.
- Commit often; keep PRs small.
- Run `/handoff` before switching sessions mid-task.

## Going further

- **A second coding agent:** the optional [Codex pack](../packs/codex/README.md) lets Claude plan and review while Codex implements.
- **Idea sessions away from your computer:** set up a [claude.ai planning project](08-claude-ai-planning-project.md) and bring its decisions back as ADRs.
- **Long-running work:** use `/goal` first — Claude keeps going until the condition you give it is met. If a job needs a fresh context on every step, see the Ralph loop in [`ralph/README.md`](../ralph/README.md).
- **More patterns:** the [claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) README — or just ask the `best-practice-scout` skill.
