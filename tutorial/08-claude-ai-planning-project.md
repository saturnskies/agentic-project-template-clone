---
description: Optional tutorial: claude.ai Planning Project for idea sessions; when to use it vs Claude Code
status: current
updated: 2026-10-29
---
# Optional — A claude.ai Planning Project

[← Tutorial index](README.md)

A **claude.ai Project** gives you a planning space for idea sessions — on the web or your phone — that knows your repo's docs. Claude Code builds; the claude.ai Project thinks.

## When to use which

| | Claude Code | claude.ai Project | Claude Code on the web (claude.ai/code) |
|---|---|---|---|
| Edits files, runs code, commits | ✅ | ❌ reads a snapshot of selected files | ✅ in the cloud, against your GitHub repo |
| Uses the project's agents, skills, hooks | ✅ | ❌ | ✅ |
| Works from any device | ❌ your computer | ✅ | ✅ |
| Best for | Building | Strategy, ideas, planning, writing, learning | Starting or checking coding tasks away from your computer |

## Create it

1. On [claude.ai](https://claude.ai), open **Projects** and create a new project (e.g. "<your project> — planning").
2. Add project knowledge from **GitHub** and select only the files that help with thinking, not the whole repo:
   - `README.md` and `CLAUDE.md`
   - `docs/INDEX.md`
   - `docs/research/`
   - `docs/decisions/` (once you have ADRs)
3. Paste the instructions below into the project's **instructions** field, replacing `<your project>`.
4. **Re-sync after big changes** — the project reads a snapshot and won't see new commits until you refresh it.

## Project instructions

```
You are my strategic partner for idea sessions on my Claude Code project
"<your project>". Be strategic about what's worth building and practical
about how it gets run, automated, and maintained.

How to work:
- Lead with a recommendation, then the 2–3 reasons that matter. Don't list
  every option; mention an alternative only if it's a close call.
- Judge every idea on: value (time or money saved per month), cost to build
  and run, risk (money, customer data, outside services it depends on), and
  how well it scales. End each assessment with one verdict: BUILD, PILOT,
  PARTIAL, DEFER, or DROP.
- Prefer the smallest version that proves the idea. Sandbox first, read-only
  first, and a human approves anything that moves money or sends messages.
- Challenge weak assumptions directly. Ask a question only when the answer
  would change your recommendation.
- Be concise. Bullets and short tables over paragraphs.

Boundaries:
- The GitHub repo is the source of truth. Use the attached docs (index,
  research, ADRs) and say when something isn't covered.
- No code. Add a "Hand-off to Claude Code" block only when we reach a real
  decision AND the work belongs in a separate Claude Code session (building
  code, running tests, using the repo's hooks or agents): the decision, why,
  the first concrete step, and which agent or skill to use (e.g.
  software-architect). Skip it for discussion, open questions, and anything
  you can do in this session yourself; offer to do that instead.
```

## Moving decisions back to the repo

1. When a planning chat ends with a **Hand-off to Claude Code** block, copy it. (Chats without a decision, or work Claude already did in the session, won't have one.)
2. Paste it into Claude Code in your project.
3. Ask Claude Code to record it — usually as an ADR in `docs/decisions/` (the `documentation-and-adrs` skill) — and start the first step.

## Keep it healthy

- **The repo is the single source of truth.** A decision that only lives in a chat will drift out of date — always bring it back as an ADR or doc.
- **Don't copy CLAUDE.md rules into the project instructions** — two copies of the same rules drift apart.
- **Your personal Claude Code setup** (auto mode, personal skills, status line) lives on your computer and isn't available in claude.ai or Claude Code on the web.
