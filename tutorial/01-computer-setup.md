---
description: Tutorial step 1: install Git, Node.js, Python, browser, terminal and Lightpanda on a new computer
status: current
updated: 2026-10-29
---
# Step 1 — Set Up Your Computer

[← Tutorial index](README.md)

Claude Code works by running real tools on your machine. Install these first so it never has to improvise around missing ones.

## What to install

| Tool | Why this project needs it | Required? |
|------|---------------------------|-----------|
| **Git** (includes Git Bash on Windows) | Version control; on Windows, Claude Code uses Git Bash as its shell, and this project's hooks and `ralph/ralph.sh` run in it | **Required** |
| **Node.js LTS** (22 or newer) | Runs the project's hooks and starts its MCP servers through `npx` | **Required** |
| **Google Chrome** | The Playwright MCP and Claude in Chrome drive it to test web pages | **Required** |
| **GitHub CLI (`gh`)** | Opens pull requests at the end of `/go` | **Required** |
| **WSL2 + Ubuntu + Lightpanda** (Windows) | The Lightpanda MCP, a fast text-only browser agents use before Chromium; it has no Windows build | Recommended |
| **Python 3.13** + **uv** | Scripts and data work; the Python stack if the project uses it | Recommended |
| **jq** | Lets Claude read JSON output without writing throwaway scripts | Recommended |
| **A modern terminal** — Windows Terminal + PowerShell 7 on Windows | Better shell; PowerShell 7 supports syntax Windows PowerShell 5.1 doesn't | Recommended |
| **VS Code** | Editor; the Claude Code extension shows Claude's edits as diffs | Optional |
| **Docker Desktop** | Local databases and containers — only if your project's stack needs them | Later |

## Windows

Open **PowerShell** (Start → type "PowerShell"). You don't need to run as Administrator. Paste one line at a time:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Google.Chrome -e
winget install --id GitHub.cli -e
winget install --id Python.Python.3.13 -e --scope user
winget install --id astral-sh.uv -e
winget install --id jqlang.jq -e
winget install --id Microsoft.WindowsTerminal -e
winget install --id Microsoft.PowerShell -e
winget install --id Microsoft.VisualStudioCode -e   # optional
```

Then do these two Windows-specific fixes:

1. **Turn off the fake `python` commands.** Windows ships placeholder `python.exe` / `python3.exe` that open the Microsoft Store instead of running Python. Go to **Settings → Apps → Advanced app settings → App execution aliases** and switch off **python.exe** and **python3.exe**.
2. **Close every terminal and open a new one.** Programs only see newly installed tools after a restart of the terminal (and of Claude Code).

> **Windows 10 users:** Windows 10 no longer receives free security updates. If your PC supports it, upgrade to Windows 11 before storing API keys or payment credentials on it.

### Lightpanda (via WSL2)

1. **Turn on virtualization in the BIOS.** Check first: in PowerShell, `(Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled` must print `True`. If it prints `False`, restart into the BIOS and enable **SVM Mode** (AMD) or **Intel VT-x / Virtualization Technology** (Intel).
2. **Install WSL and Ubuntu** in an Administrator PowerShell: `wsl --install --no-distribution`, reboot, then `wsl --install -d Ubuntu`.
3. **Create your Linux user in a window you can type in.** Ubuntu's first launch asks for a username and password. Run it from a terminal or the Start menu, never from inside Claude Code: a background run waits forever and freezes WSL (fix: `taskkill /F /IM wslservice.exe` as Administrator, or reboot).
4. **Install Lightpanda inside Ubuntu** (pinned release; check [releases](https://github.com/lightpanda-io/browser/releases) for newer):
   ```bash
   mkdir -p ~/.local/bin
   curl -fL -o ~/.local/bin/lightpanda https://github.com/lightpanda-io/browser/releases/download/1.0.1/lightpanda-x86_64-linux
   echo "551747e35c51ba107b5d5277eca4b48e077b2a3b40f09a047bf6670448bc35fd  $HOME/.local/bin/lightpanda" | sha256sum -c
   chmod +x ~/.local/bin/lightpanda
   ~/.local/bin/lightpanda version
   ```
   The checksum line must print `OK`; it is the SHA-256 GitHub publishes for 1.0.1. For a newer release, take the `digest` from the release's API page (`https://api.github.com/repos/lightpanda-io/browser/releases/tags/<version>`).

`.mcp.json` starts it through `wsl.exe -d Ubuntu`, so the distro must be named **Ubuntu** (check with `wsl -l -v`). On macOS or Linux, install the native binary from the same releases page and override the entry for yourself without touching the committed file: `claude mcp add lightpanda --scope local -e LIGHTPANDA_DISABLE_TELEMETRY=true -- ~/.local/bin/lightpanda mcp`. Skipping Lightpanda is fine: agents fall back to Playwright.

## macOS

Install [Homebrew](https://brew.sh) if you don't have it, then:

```bash
brew install git node python uv gh jq
brew install --cask google-chrome visual-studio-code   # VS Code optional
```

## Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y git curl jq python3 python3-venv
curl -LsSf https://astral.sh/uv/install.sh | sh          # uv
```

Install **Node.js LTS** from [nodejs.org](https://nodejs.org/en/download) (or with `nvm`), **Chrome** from [google.com/chrome](https://www.google.com/chrome/), and **gh** from [cli.github.com](https://cli.github.com/).

## Check

Open a **new** terminal and run:

```bash
git --version      # any recent version
node --version     # v22 or newer
gh --version
python --version   # 3.13 (on macOS/Linux: python3 --version)
uv --version
jq --version
```

Every command should print a version. If one says "not found", see [Troubleshooting](06-troubleshooting.md#a-tool-says-not-found-right-after-installing).

## Hardware notes

- **RAM:** 16 GB works; 32 GB is comfortable once you run Docker, a browser, and several Claude sessions at once.
- **Disk:** an SSD with 20 GB+ free.
- **GPU:** not needed — Claude runs in the cloud.
- **Microphone:** optional, for `/voice` dictation.
- **Virtualization:** only needed for Docker or WSL2. If they complain, enable virtualization (Intel VT-x / AMD SVM) in your BIOS.

**Next:** [Step 2 — Install Claude Code →](02-install-claude-code.md)
