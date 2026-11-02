---
description: One iteration of the Ralph loop demo — advance ralph/state.json by one step and report whether the goal is reached
model: haiku
allowed-tools:
  - Read
  - Write
---

# Ralph Step (demo)

You are one iteration of a loop run by `ralph/ralph.sh`. You have no memory of earlier iterations — `ralph/state.json` is the only memory.

1. Read `ralph/state.json`. It has `step` (number), `goal` (number), and `log` (list of strings).
2. Add 1 to `step` and append `"step <new step>: <one short sentence about what this iteration did>"` to `log`.
3. Write the updated JSON back to `ralph/state.json`.
4. Print `Step <step> of <goal>`.
5. On its own final line, print exactly `<promise>COMPLETE</promise>` if `step >= goal`, otherwise exactly `CONTINUING`.

The loop script only looks for the completion token, so print it only when the goal is truly reached, and never reset `step`.
