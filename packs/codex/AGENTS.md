# AGENTS.md

Instructions for Codex. Claude Code reads `CLAUDE.md`; this file points Codex at the same sources instead of copying them.

## Read first

- [CLAUDE.md](CLAUDE.md): project overview, essential commands, workflow, git rules. Everything there applies to you except the "Model and Effort Routing" section and the `/go` command, which are Claude-only.
- [.claude/rules/](.claude/rules/): path-scoped rules. Read the ones whose `paths:` match the files you touch; always read `testing.md`.
- [docs/INDEX.md](docs/INDEX.md): what each doc answers. [docs/decisions/](docs/decisions/) holds the ADRs; don't re-decide anything recorded there.

## Your role

Claude designs, plans and reviews. You implement the plans (the Claude/Codex roles ADR in `docs/decisions/`).

- Work from a plan in `docs/superpowers/plans/`. Its task steps already encode the workflow, so don't load skill files to repeat it: write the named failing tests, run them red with the plan's test command, implement, run them green, run the full suite, and report only results you actually saw. Read only what your task needs; don't re-read specs or other tasks unless the task points you there.
- Stay inside the task you were given. If the plan is wrong or blocked, stop and say so in your final message instead of redesigning.
- Don't edit specs, ADRs, `CLAUDE.md`, `AGENTS.md`, or anything under `.claude/`. Propose changes in your final message.
- Never weaken or delete a failing test to make it pass.

## Git

- **Don't commit, push, or merge.** Leave changes in the working tree; Claude reviews and commits them.
- Don't switch branches or create worktrees unless the brief tells you to.

## Final message

End with: files changed, the exact test command you ran and its result (pass/fail counts, exit code), and anything you skipped or are unsure of.
