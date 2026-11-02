#!/usr/bin/env node
// PostToolUse hook: auto-format the file Claude just edited.
// Stack-agnostic — picks a formatter based on what the project has installed,
// and silently does nothing if none is configured. Never blocks Claude.
// Runs every formatter without a shell, so the edited path (untrusted) is never parsed by
// cmd.exe or sh: prettier through node and its own bin script, the rest as real executables.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const exists = (p) => fs.existsSync(path.join(projectDir, p));

function prettierBin() {
  try {
    const dir = path.join(projectDir, "node_modules/prettier");
    const bin = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).bin;
    return path.join(dir, typeof bin === "string" ? bin : bin.prettier);
  } catch {
    return null;
  }
}

function formatterFor(file) {
  const ext = path.extname(file).toLowerCase();
  const prettierExts = [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", ".md", ".html", ".yml", ".yaml"];

  if (prettierExts.includes(ext)) {
    const bin = prettierBin();
    return bin ? [process.execPath, [bin, "--write", file]] : null;
  }
  if (ext === ".py" && (exists("pyproject.toml") || exists("ruff.toml"))) return ["ruff", ["format", file]];
  if (ext === ".go") return ["gofmt", ["-w", file]];
  if (ext === ".rs" && exists("Cargo.toml")) return ["rustfmt", [file]];
  return null;
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const file = JSON.parse(input).tool_input?.file_path;
    if (!file || !fs.existsSync(file)) return;
    const fmt = formatterFor(file);
    if (!fmt) return;
    execFileSync(fmt[0], fmt[1], { cwd: projectDir, stdio: "ignore" });
  } catch {
    // Formatter missing or failed — formatting is best-effort, never fail the edit.
  }
});
