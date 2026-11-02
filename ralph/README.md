# Ralph Loop Demo

> **Try `/goal` first.** Claude Code's built-in `/goal` keeps a session working until a condition is met and covers most long-running tasks with no setup. Use this loop when each step needs a **fresh context** — very long jobs where a growing conversation would degrade quality, or batch work over many items.

A minimal, original take on the [Ralph Wiggum loop](https://github.com/shanraisshan/ralph-wiggum-self-evolving-loop) pattern: a shell script runs the same slash command over and over, each time in a **fresh** headless Claude session, until the command prints a completion token.

```
ralph/ralph.sh 5
  └─ loop (max 5):
       claude -p "/ralph-step"      ← new session, no memory
         reads  ralph/state.json    ← the only memory between iterations
         does one step, writes state back
         prints <promise>COMPLETE</promise> when done, else CONTINUING
       script stops on the token, on an error, or at the cap
```

## Run it

```bash
rm -f ralph/state.json   # start over (the script copies state.example.json)
ralph/ralph.sh 5       # goal is 3, so it should finish on iteration 3
cat ralph/state.json     # see what each iteration logged
```

`ralph/state.json` is git-ignored: it's runtime state, and leaving it untracked keeps the verification Stop hook from firing on every iteration.

## Using the pattern for real work

Swap `/ralph-step` for your own command: `ralph/ralph.sh 10 /my-command`. A good loop command:

- Reads its progress from a file, does **one** small unit of work, and writes progress back.
- Has an honest, checkable completion condition, so it prints the token only when the work is really done.
- Prints the token as the **entire last line**. The script ignores the token anywhere else, because Claude's prose can mention it — an earlier version of this demo stopped one iteration early when an explanatory note quoted the token.
- Commits after each iteration, so a bad iteration is easy to revert.
- Is safe to run unattended: no pushes, payments, or sends without a human.

Each iteration costs a full session of plan usage. The script refuses caps above 20.

The original repo goes further: each iteration also **edits its own agent prompt** based on results (the "self-evolving" part) and checks its work with five parallel verifier agents.
