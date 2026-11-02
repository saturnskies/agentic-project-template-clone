---
description: Troubleshooting: tool not found after install, PATH, python opens Microsoft Store, login, permissions
status: current
updated: 2026-10-29
---
# Troubleshooting

[← Tutorial index](README.md) · Official guide: [Troubleshoot installation and login](https://code.claude.com/docs/en/troubleshoot-install)

## A tool says "not found" right after installing

Programs read your `PATH` when they start. Close **all** terminals (and Claude Code) and open a new one. On Windows, if it still fails, sign out of Windows and back in.

## `python` opens the Microsoft Store (Windows)

Turn off the placeholders: **Settings → Apps → Advanced app settings → App execution aliases** → switch off **python.exe** and **python3.exe**. Use `py` meanwhile — it always runs the real Python.

## "Ignoring permissions.allow entries … this workspace has not been trusted"

Open `claude` in the project folder interactively once and accept the trust prompt. Until then, the project's allow-list is ignored and you'll see more permission prompts.

## A commit fails with "Author identity unknown"

Set your identity — see [Step 4](04-personal-setup.md#1-git-identity).

## `git push` is rejected over email privacy

GitHub blocks pushes that would expose a private email. Use your no-reply address (GitHub → Settings → Emails) for `user.email`.

## `/go` fails at the pull request step

Install and sign in to the GitHub CLI: `gh auth login`.

## A shell script fails with `$'\r': command not found`

The script got Windows line endings. The project's `.gitattributes` prevents this for `*.sh` files; to repair a script checked out before that rule existed, delete it and restore it from git: `rm ralph/ralph.sh && git checkout -- ralph/ralph.sh`.

## MCP servers don't show up

Run `/mcp`. If a server is listed but not connected, check that `node --version` works in a new terminal, then restart Claude Code. Servers in `.mcp.json` need your approval the first time.

## Docker or WSL2 won't start

Enable hardware virtualization (Intel VT-x / AMD SVM) in your BIOS/UEFI settings.

## Anything else

- `claude doctor` — read-only health check of the install and your settings
- `/doctor` inside a session
- Ask Claude: *"use best-practice-scout to find guidance on <problem>"*
