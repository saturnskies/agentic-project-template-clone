---
description: Tutorial step 3: create your repo from the template, clone it, first open
status: current
updated: 2026-10-29
---
# Step 3 — Get the Project

[← Tutorial index](README.md)

## Create your own copy

1. Open the template repository — [github.com/adolladivinity/agentic-project-template](https://github.com/adolladivinity/agentic-project-template) — and click **Use this template → Create a new repository**. (It's private: ask the owner to add you as a collaborator first.)
2. Pick a name, choose **Private** (recommended), and create it.
3. Clone it (replace the URL with yours):

```bash
cd ~                       # or wherever you keep projects
git clone https://github.com/<you>/<your-repo>.git
cd <your-repo>
```

> The first `git push` or `git clone` of a private repo opens a browser window to sign in to GitHub. Git remembers you after that.

## Open it in Claude Code the first time

```bash
claude
```

Claude Code will ask a few one-time questions. Answer them like this:

| Prompt | Answer | Why |
|--------|--------|-----|
| **Trust this folder?** | Yes | Until you trust it, the project's permission settings are ignored |
| **Use MCP servers from `.mcp.json`** (Playwright, Lightpanda, Context7, DeepWiki) | Approve each | Browsing, browser testing, and up-to-date library docs |
| **Install the Superpowers plugin** (if offered) | Yes | It's the project's workflow backbone |

If Superpowers isn't offered, install it yourself from the project folder:

```bash
claude plugin install superpowers@claude-plugins-official --scope project
```

## Personal settings for this project

The project ships an example of per-person settings that git ignores:

```bash
# Windows PowerShell
Copy-Item .claude\settings.local.json.example .claude\settings.local.json
# macOS / Linux / Git Bash
cp .claude/settings.local.json.example .claude/settings.local.json
```

Edit it to taste — it's yours alone and never committed.

## Check

Inside Claude Code, run:

- `/mcp` — playwright, lightpanda, context7 and deepwiki listed as connected (lightpanda fails until [its WSL setup](01-computer-setup.md#lightpanda-via-wsl2) is done)
- `/plugin` — superpowers installed
- `/agents` — the project's agents listed (software-architect, reality-checker, …)

**Next:** [Step 4 — Personal setup →](04-personal-setup.md)
