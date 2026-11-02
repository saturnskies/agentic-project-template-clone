---
description: User guide to driving Claude Code: sessions, context, model and effort choice, cost habits
status: current
updated: 2026-10-29
---
# Claude Code Tips (for you, not for Claude)

How to drive sessions well. These are habits for the person at the keyboard, so they live here instead of CLAUDE.md. Curated from the Tips & Tricks section of [claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice#-tips-and-tricks-83), which links every tip to its source (mostly the Claude Code team).

## Starting work

- **Plan first.** Describe what you want and let Superpowers brainstorm; or press `Shift+Tab` into plan mode for smaller changes.
- **Get interviewed.** Start with a rough idea and say *"grill me"* — answer the rounds before anything gets built.
- **Write specific asks.** The more ambiguity you remove up front, the better the result.
- **Prototype instead of debating.** Building several throwaway versions is cheap; ask for a prototype when you're unsure what you want.
- **Second opinion on plans.** Ask the `software-architect` agent, or a fresh session, to review a plan as a staff engineer.

## Managing context

- **New task = new session.** Related follow-ups can stay; unrelated work deserves a fresh start (`/clear`).
- **Watch the meter.** `/context` shows usage. Quality drops as context fills — aim to stay under ~40%, wrap up around 60%.
- **Compact with a hint.** `/compact focus on the checkout flow, drop the test debugging` beats waiting for autocompact.
- **Rewind instead of correcting.** Double-`Esc` or `/rewind` back to before a failed attempt, then re-prompt with what you learned — failed attempts left in context keep confusing Claude.
- **Hand off cleanly.** Before a fresh session, run `/handoff` so the next one starts with a summary.
- **Use subagents to keep context clean.** Ask *"use subagents"* for searching and research — only the conclusion comes back.

## Prompting

- **Don't micromanage bugs.** Paste the error and say "fix" — Claude usually finds it.
- **Challenge the work.** *"Prove to me this works"* or *"grill me on these changes before the PR"*.
- **Ask for the elegant redo.** After a mediocre fix: *"knowing everything you know now, scrap this and implement the elegant solution."*
- **Think harder when it matters.** Include `ultrathink` for hard problems; adjust effort with `/model`.
- **Share screenshots** whenever something looks wrong.

## Sessions & workflow

- **Name important sessions** with `/rename`, come back with `/resume`.
- **Finish with `/go`** — verify, review, simplify, PR.
- **Run `/retro`** after a session that went sideways, so the fix lands in CLAUDE.md, a hook, or a skill's Gotchas.
- **Keep PRs small** and squash merge.
- **Commit often** — at least hourly.
- **Recurring jobs:** `/loop` for local monitoring while your machine is on; `/schedule` for cloud routines that run when it's off.
- **Long tasks:** start with `/goal` — Claude keeps working across turns until the condition you set is met. For jobs that need a fresh context on every step, use the Ralph loop (`ralph/ralph.sh`, demo in `ralph/`).

## Choosing model and effort

- **Model:** Opus is the default for the main session — keep it for planning, design, and debugging. Claude routes its own helper agents (Sonnet for most, Haiku for lookups, Opus for security and architecture), using the table in CLAUDE.md.
- **Effort** decides how hard Claude thinks, and it's the biggest cost lever you control. Claude can't change it for you, so it suggests one at the start of each session:

  | Task | Effort |
  |---|---|
  | Questions, docs, runbooks, renames, small edits | `/effort low` or `medium` |
  | Normal feature work, tests | `/effort medium` or `high` |
  | Hard debugging, design, anything where mistakes are expensive | `/effort high` or `xhigh` |

- **Output style:** `default` for daily work. `/output-style explanatory` adds a teaching note to every reply — good when learning something new, but it makes every answer longer.

## Spending fewer tokens

- New task, new session (`/clear`) — the biggest single saving. Everything in a session is re-sent on every turn.
- Ask for subagents only when the output is big and you only need the conclusion ("search the codebase for…", "read these 10 pages and summarize"). Small tasks are cheaper done directly.
- Don't ask for multi-agent reviews of docs or idea discussions; `/go` already sizes review to the change.
- Disable MCP servers you aren't using in this project with `/mcp` (each one adds tool names to every session).
- Check `/usage` before big or parallel jobs.
- Run `/skill-doctor` and `/context` occasionally to see what's taking up space before you even type.

## Debugging & tools

- **Let Claude see the web** — agents read pages with Lightpanda first and switch to Playwright only when needed (the `browsing` skill). Playwright runs headless; remove `--headless` in `.mcp.json` to watch it.
- **Background long-running commands** (dev servers, watchers) so their logs stay readable.
- **`/doctor`** when Claude Code itself misbehaves.
- **`/usage`** to check plan limits; **`/permissions`** to tune what runs without asking.

## Daily

- **Update Claude Code** regularly, and skim the [changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md).
- **Voice input:** `/voice` is often faster than typing long prompts.
