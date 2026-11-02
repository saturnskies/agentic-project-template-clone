---
description: Tutorial step 4: per-machine setup (git identity, user-level Claude settings)
status: current
updated: 2026-10-29
---
# Step 4 — Personal Setup

[← Tutorial index](README.md)

These settings live on your machine, not in the project, so they apply to every project you open.

## 1. Git identity

Commits need a name and email. Use GitHub's private no-reply address so your real email stays hidden: find it at **GitHub → Settings → Emails** (looks like `12345678+you@users.noreply.github.com`).

```bash
git config --global user.name "your-github-username"
git config --global user.email "12345678+you@users.noreply.github.com"
git config --global init.defaultBranch main
```

## 2. GitHub CLI

```bash
gh auth login
```

Choose **GitHub.com → HTTPS → Login with a web browser**. This lets `/go` open pull requests.

## 3. Personal Claude Code settings

Open (or create) your user settings file:

- Windows: `C:\Users\<you>\.claude\settings.json`
- macOS / Linux: `~/.claude/settings.json`

A good starting point:

```json
{
  "permissions": {
    "defaultMode": "auto"
  },
  "outputStyle": "Explanatory"
}
```

- **`defaultMode: "auto"`** — a safety classifier approves routine actions and asks you about risky ones, so Claude can work without constant prompts. It can only be turned on here, never by a project. The project's own guardrails (asking before `rm`, `git push`, installs; blocking `.env` reads and force-pushes) still apply.
- **`outputStyle: "Explanatory"`** — Claude explains its choices with ★ Insight boxes. Great while learning; remove it once you'd rather have shorter answers.

If the file already has content, **add these keys to it** rather than replacing the file.

## 4. The best-practice repo and its scout skill

Clone the reference repo next to your projects:

```bash
cd ~
git clone https://github.com/shanraisshan/claude-code-best-practice.git
```

Then install the **best-practice-scout** personal skill, which lets Claude search that repo's tips, workflows, and skill/agent collections and adapt pieces into whatever project you're in:

```bash
# from your project folder — Windows PowerShell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills\best-practice-scout" | Out-Null
Copy-Item tutorial\extras\best-practice-scout\SKILL.md "$env:USERPROFILE\.claude\skills\best-practice-scout\"
# macOS / Linux / Git Bash
mkdir -p ~/.claude/skills/best-practice-scout
cp tutorial/extras/best-practice-scout/SKILL.md ~/.claude/skills/best-practice-scout/
```

If you cloned the best-practice repo somewhere other than your home folder, update the path near the top of that `SKILL.md`.

## Check

Restart Claude Code, then ask: *"use best-practice-scout to find a skill for writing tests"*. It should read the best-practice README and offer a short list.

**Next:** [Step 5 — Your first session →](05-first-session.md)
