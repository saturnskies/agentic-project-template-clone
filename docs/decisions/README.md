---
description: How to write ADRs: naming, front matter, status rules, never rewrite accepted ADRs
status: current
updated: 2026-10-29
---
# Architecture Decision Records

One file per significant decision — stack, framework, database, hosting, integrations, anything expensive to reverse. Read these before re-deciding something.

## Naming

`ADR-NNN-short-title.md`, numbered in order, never reused:

- `ADR-001-choose-stack.md`
- `ADR-002-hosting.md`

## Format

Use the template in the `documentation-and-adrs` skill (`.claude/skills/documentation-and-adrs/SKILL.md`): front matter (`description`, `status`, `updated`), then **Context**, **Decision**, **Alternatives Considered**, **Consequences**.

## Rules

- **`status`** in the front matter is `draft` (proposed), `current` (accepted), or `superseded` with `superseded_by: ADR-NNN`. Run `tools/doc-index.sh` after any change so `docs/INDEX.md` stays current.
- **Never delete or rewrite an accepted ADR.** When a decision changes, write a new ADR and mark the old one `superseded`.
- **Link, don't copy.** If a Superpowers spec in `docs/superpowers/specs/` holds the design detail, link to it from the ADR.
- **Decisions made elsewhere land here.** A verdict from an agent such as `software-architect`, or a hand-off from a claude.ai planning project becomes an ADR.
