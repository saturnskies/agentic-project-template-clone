---
name: grilling
description: Stress-test a plan, decision, or idea by interviewing the user in rounds until every branch is settled. Use when the user says "grill me" or asks to pressure-test their thinking. Designing a new feature from scratch starts with superpowers:brainstorming instead.
---

<!-- Source: https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md (MIT License, Copyright (c) 2026 Matt Pocock). Adapted for this project. -->

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

## Design sessions

When the grilling designs something (a spec, not a quick sanity check), save as you go so nothing is lost if the session or usage runs out mid-way:

- Keep an **Open questions** list at the top of the spec in `docs/superpowers/specs/`; remove each item as it's settled.
- After each round, write its decisions straight into the spec body, each marked "Decided <yyyy-mm-dd>".
- Commit and push every round to a `design/<topic>` branch. A later session resumes from the spec's open questions, not from memory.

## Gotchas

- Superpowers' brainstorming runs before new work; grilling is for an existing plan, spec, or decision the user wants pressure-tested (e.g. a file in `docs/superpowers/plans/`). Read that artifact before round one
- <!-- Append grilling misfires seen in this project here -->
