---
paths:
  - ".claude/**"
  - "CLAUDE.md"
---

# Claude Config Rules

- Keep CLAUDE.md under 200 lines; move path-specific guidance into `.claude/rules/` with `paths:` frontmatter
- Harness-enforced behavior (permissions, attribution, formatting) belongs in `settings.json` or hooks, not prose
- Skill `description` is a trigger for the model ("when should I fire?"), not a summary
- Skills are folders: put long reference material in `references/` and helpers in `scripts/` for progressive disclosure
- Every skill keeps a `## Gotchas` section; append Claude's failure points as they're found
- Give goals and constraints, not step-by-step railroading; don't state what Claude already does by default
- Prefer feature-specific subagents with preloaded skills over generic roles ("backend engineer")
- A hook that runs a command on the edited file's path treats that path as untrusted: never spawn it with `shell: true`. On Windows that passes it to cmd.exe unescaped, so `x&calc&.go` runs `calc`. Run `.cmd` tools' JavaScript entry with `process.execPath` instead, as `.claude/hooks/format.js` does for prettier
- Never put an MCP tool that fetches any URL (a browser's `markdown`, `tree`, `goto`) in `permissions.allow`: injected text could make Claude send repo contents to an attacker's URL with no prompt. Allow-list only tools with a fixed destination
- In agent definitions, name tools explicitly (e.g., "use the Agent tool") — avoid vague verbs like "launch"
