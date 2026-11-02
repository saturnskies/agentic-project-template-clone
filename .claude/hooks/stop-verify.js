#!/usr/bin/env node
// SessionStart (--baseline): snapshot the working tree for this session.
// Stop: when this session changed code files since its snapshot, nudge Claude
// once to confirm verification. Nudges at most once per distinct change set,
// so it never loops and never fires for changes left over from earlier sessions.

const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stateFile = path.join(projectDir, ".claude", "hooks", ".state", "sessions.json");
const MAX_SESSIONS = 20;

const git = (cmd) => execSync(cmd, { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

// Code files with uncommitted changes (docs and plans don't need test verification).
function changedFiles() {
  return git("git status --porcelain")
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter((f) => f && !f.endsWith(".md") && !f.startsWith("docs/"));
}

// Fingerprint of the working tree: tracked diffs plus size/mtime of untracked files.
function fingerprint(files) {
  const untracked = git("git ls-files --others --exclude-standard")
    .split("\n")
    .filter(Boolean)
    .map((f) => {
      try {
        const s = fs.statSync(path.join(projectDir, f));
        return `${f}:${s.size}:${s.mtimeMs}`;
      } catch {
        return f;
      }
    });
  return crypto.createHash("sha1").update(git("git diff HEAD") + files.join("\n") + untracked.join("\n")).digest("hex");
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  const ids = Object.keys(state).sort((a, b) => (state[b].at || 0) - (state[a].at || 0));
  for (const id of ids.slice(MAX_SESSIONS)) delete state[id];
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const event = JSON.parse(input || "{}");
    const id = event.session_id || "unknown";
    const state = loadState();
    const files = changedFiles();
    const current = fingerprint(files);

    if (process.argv.includes("--baseline")) {
      state[id] = { baseline: current, lastNudge: "", at: Date.now() };
      saveState(state);
      return;
    }

    if (event.stop_hook_active || files.length === 0) return;
    const session = state[id] || { baseline: "", lastNudge: "" };
    if (current === session.baseline || current === session.lastNudge) return;

    state[id] = { ...session, lastNudge: current, at: Date.now() };
    saveState(state);

    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          `You changed ${files.length} file(s) this session (${files.slice(0, 5).join(", ")}). ` +
          "Before finishing: confirm the tests/verification from CLAUDE.md were run and passed, " +
          "or state explicitly what was not verified and why.",
      })
    );
  } catch {
    // Not a git repo or git unavailable — don't interfere.
  }
});
