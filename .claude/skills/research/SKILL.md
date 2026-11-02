---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

<!-- Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/research/SKILL.md (MIT License, Copyright (c) 2026 Matt Pocock). Adapted for this project. -->

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it to `docs/research/<yyyy-mm-dd>-<topic-slug>.md` unless the repo already keeps such notes elsewhere, and say where it went. Start the file with front matter (`description`, `status: current`, `updated`; see CLAUDE.md Conventions) and run `tools/doc-index.sh`.

## Budget

A research agent's cost is mostly turns × context size: every turn re-reads everything read so far. Without a cap, an agent re-opens the same few pages turn after turn, and a note that needs a dozen reads can cost millions of tokens.

- Put a hard cap in the brief: "at most N page reads, and never read the same URL twice". A soft "aim for" gets ignored.
- If a read comes back empty or cut off, try one other method (a different selector, `tree`, or WebFetch), then move on and record the gap in the note. Don't retry the same page.
- Stop as soon as every listed question has a cited answer.
- Model: gathering runs on `haiku`, `low`. For a small question (about 5 pages or fewer), the haiku agent writes the note itself. For a bigger one, it saves raw cited excerpts to the scratchpad, and one `sonnet`, `medium` agent writes the note from them without browsing.

## Gotchas

- Run the agent with `run_in_background` on the Agent tool so the main session keeps working
- For library and framework docs, the context7 MCP tools (if available) are a primary source; for Claude Code itself, check the local claude-code-best-practice repo first via the `best-practice-scout` skill
- If the research settles a decision, hand the finding to `documentation-and-adrs` so it becomes an ADR rather than only a notes file
- If the research vets a tool, service, or library, add or update its row in `docs/toolbox.md` or `docs/tool-watchlist.md` per the toolbox's "Adding a tool" steps, so later sessions find it by need
