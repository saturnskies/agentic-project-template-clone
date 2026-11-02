---
paths:
  - "**/*.py"
  - "**/*.{js,ts,jsx,tsx}"
  - "**/*.{go,rs,java,kt,cs}"
---

# Reuse Ladder

Read the code the change touches first. Then, before writing new code, climb the ladder and stop at the first rung that solves it:

1. **Needed now?** The task or plan asks for it today, not "might need later".
2. **Already in the repo?** A shared helper or another module that already does it. If a helper almost fits, extend it rather than writing a second version.
3. **Standard library?** The language's own library before a dependency.
4. **Built into the tool, framework, or platform?** A flag or feature of the tool you're already calling (`<input type="date">` beats a calendar widget; a framework's built-in component beats a hand-rolled one).
5. **Installed or vetted?** An existing dependency, or one listed in `docs/toolbox.md` (then `docs/tool-watchlist.md`).
6. **Only then** write the smallest code that works, test-first as usual.

The ladder trims solutions, never safety: trust-boundary validation, failure paths, security, and accessibility stay in at every rung.

Name the rung that held in the reply, so the choice is visible. Anything deliberately left out goes in the plan's follow-ups or the relevant runbook.
