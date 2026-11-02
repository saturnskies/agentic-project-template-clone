#!/bin/bash
# Ralph-style loop: run one slash command per fresh headless Claude session
# until it prints the completion token or the iteration cap is reached.
#
# Usage: ralph/ralph.sh <max-iterations> [command]
#   command defaults to /ralph-step (the demo in ralph/)
#
# Each iteration is a full Claude session and uses plan usage — keep caps low.

set -u

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX="${1:-}"
COMMAND="${2:-/ralph-step}"
DONE_TOKEN="<promise>COMPLETE</promise>"

if ! [[ "$MAX" =~ ^[0-9]+$ ]] || [ "$MAX" -lt 1 ] || [ "$MAX" -gt 20 ]; then
  echo "Usage: $0 <max-iterations 1-20> [command]" >&2
  exit 2
fi

cd "$PROJECT_ROOT" || exit 1

# Start from a fresh copy of the example state if there is none yet.
if [ "$COMMAND" = "/ralph-step" ] && [ ! -f ralph/state.json ]; then
  cp ralph/state.example.json ralph/state.json
fi

for ((i = 1; i <= MAX; i++)); do
  echo "=== Iteration $i/$MAX: $COMMAND ==="
  output=$(claude -p "$COMMAND" --output-format text 2>&1)
  status=$?
  echo "$output"

  if [ $status -ne 0 ]; then
    echo "Claude exited with status $status — stopping." >&2
    exit 1
  fi
  # Only an exact final line counts — prose that merely mentions the token must not end the loop.
  last_line=$(printf '%s\n' "$output" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1 | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ "$last_line" = "$DONE_TOKEN" ]; then
    echo "=== Complete after $i iteration(s) ==="
    exit 0
  fi
done

echo "=== Reached the cap of $MAX iterations without completing ===" >&2
exit 1
