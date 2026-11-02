# agentic-project-template

A ready-to-use Claude Code project: workflow plugin, skills, agents, hooks, and MCP servers already configured following [claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice). Click **Use this template** to start your own project from it.

**New here?** Start with the [setup tutorial](tutorial/README.md) — it covers your computer, Claude Code, and this project from scratch.

> **After creating your copy:** rename the heading above, replace this intro with what your project does, and fill in the Project Overview and Essential Commands in `CLAUDE.md` once you've chosen a stack.

## Working with Claude Code

This repo is pre-configured following [claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice), with [Superpowers](https://github.com/obra/superpowers) as the workflow backbone.

| Piece | Location | Purpose |
|-------|----------|---------|
| Project memory | `CLAUDE.md` | Commands, architecture, conventions, model and effort routing (keep < 200 lines) |
| Scoped rules | `.claude/rules/` | Lazy-loaded only when matching files are touched: testing, shell, reuse ladder, external tools, Claude config |
| Team settings | `.claude/settings.json` | Permissions, output limits and subagent model (`env`), attribution, hooks, enabled plugins |
| Personal settings | `.claude/settings.local.json` | Git-ignored; copy from `settings.local.json.example` |
| Superpowers plugin | `enabledPlugins` in settings | Brainstorm → plan → TDD → review → finish (auto-triggered) |
| Plans & specs | `docs/superpowers/` | Written by Superpowers and plan mode |
| `/go` | `.claude/commands/` | Verify → review sized to the change (Docs / Normal / High-risk tiers) → simplify → lessons → template sync → PR |
| `/techdebt` | `.claude/skills/` | Forked-context debt scan |
| Security, docs/ADRs, frontend UI | `.claude/skills/` | Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT) — fill gaps Superpowers doesn't cover |
| grilling ("grill me"), `/wait-what`, `/handoff`, `/retro`, `/teach`, prototype, research | `.claude/skills/` | Adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) — thinking, session, building, and learning tools |
| Agents | `.claude/agents/` | Adapted from [agency-agents](https://github.com/msitarzewski/agency-agents) (MIT): software-architect, codebase-onboarding-engineer, minimal-change-engineer, reality-checker, ai-generated-code-auditor, codebase-archaeologist, devops-automator, mcp-builder |
| MCP servers | `.mcp.json` | Lightpanda (text browser, tried first; needs WSL on Windows), Playwright (headless), Context7, DeepWiki (pinned versions) — approve each the first time Claude Code opens the project. The `browsing` skill picks between them |
| Docs index | `docs/INDEX.md`, `tools/doc-index.sh` | Every doc carries front matter; the script builds the index and `--check` fails on a missing header or stale index |
| Toolbox | `docs/toolbox.md`, `docs/tool-watchlist.md` | Tools usable today by need, and vetted or ruled-out ones; empty until your project adds rows |
| Template sync | `docs/template-sync.md` | `/go` logs workflow improvements here so they can be ported back to this template |
| Long tasks | `/goal` (built in) | Keep Claude working across turns until a condition is met — the first choice for long-running work |
| Ralph loop | `ralph/` | When each step needs a fresh context: run a command repeatedly in new headless sessions until it reports done (demo: `ralph/ralph.sh 5`) |
| Codex pack (optional) | `packs/codex/` | Claude plans and reviews, Codex implements; the README says how to enable it |
| Tips for you | `tutorial/tips.md` | Session, context, effort, token, and prompting habits |
| Hooks | `.claude/hooks/` | Auto-format after edits; one-time verification nudge on Stop (requires Node) |

### Daily loop

1. Describe what you want — Superpowers brainstorms with you and writes a plan
2. Approve the plan → it implements task by task with TDD and review
3. `/go` → PR. Squash merge.
