---
description: Tutorial step 2: install Claude Code with the native installer, sign in, verify
status: current
updated: 2026-10-29
---
# Step 2 — Install Claude Code

[← Tutorial index](README.md) · Source: [official setup docs](https://code.claude.com/docs/en/setup)

## Install

Use the **native installer** — it updates itself automatically.

**Windows (PowerShell — your prompt starts with `PS C:\`):**

```powershell
irm https://claude.ai/install.ps1 | iex
```

**Windows (CMD — prompt starts with `C:\` and no `PS`):**

```batch
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

**macOS, Linux, WSL:**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

The installer shows no progress while it downloads. When it finishes, **open a new terminal**.

Alternatives (these don't auto-update): `winget install Anthropic.ClaudeCode` on Windows, `brew install --cask claude-code` on macOS.

## Verify

```bash
claude --version   # prints something like 2.1.302 (Claude Code)
claude doctor      # checks the install and your settings without starting a session
```

## Sign in

```bash
claude
```

Choose **Claude.ai account**, sign in in the browser that opens, and return to the terminal. A Pro, Max, Team, or Enterprise plan is required.

## Learn the basics (5 minutes)

Inside a Claude Code session:

| Key / command | What it does |
|---------------|--------------|
| `Shift+Tab` | Cycle permission modes (normal → accept edits → plan mode → auto) |
| `Esc` / double `Esc` | Stop Claude / rewind to an earlier point |
| `/help` | All commands |
| `/context` | How full the conversation is |
| `/compact <hint>` | Summarize the conversation to free space |
| `/clear` | Start fresh |
| `! <command>` | Run a shell command yourself, with the output landing in the chat |

New to the terminal? Anthropic's [terminal guide](https://code.claude.com/docs/en/terminal-guide) walks through it. The best-practice repo's [Day 1 guide](https://github.com/shanraisshan/claude-code-best-practice/tree/main/tutorial/day1) explains prompts vs. agents vs. skills.

**Next:** [Step 3 — Get the project →](03-get-the-project.md)
