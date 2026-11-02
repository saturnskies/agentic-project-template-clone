---
paths:
  - "**/*.sh"
---

# Shell Script Rules

- Scripts run under Git Bash on Windows and under dash or bash on Linux and in CI or agent sandboxes; test with `sh` and, when it's installed, `dash`
- A script whose output is compared or checked sets `LC_ALL=C` before any `sort`: a UTF-8 locale orders `toolbox.md` and `tool-watchlist.md` differently and the check reports a false "stale" (`tools/doc-index.sh`)
- Print data with `printf '%s\n'`, not `echo`: dash's `echo` expands backslashes, so the same input renders differently per shell
- Loop over paths one per line (`IFS=<newline>`, `set -f`), not `for f in $(cmd)` with the default IFS, which splits paths with spaces
- A gate that lists files with `git ls-files` adds `-co --exclude-standard`: tracked-only skips the new, unstaged file an agent just wrote and reports "clean"
- Commit new scripts executable: `git update-index --chmod=+x <file>`, then a plain `git commit` (with a path, `git commit -- <file>` rereads the mode from disk and drops the bit on Windows). Git Bash ignores the bit, so a 100644 script runs here and fails with "Permission denied" on Linux, macOS, and CI
- Check a command's exit code without a pipe after it: `$?` after `cmd | tail` is `tail`'s status, so a failing gate reads as exit 0
