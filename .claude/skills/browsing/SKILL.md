---
name: browsing
description: Use before reading, searching, screenshotting, or testing any web page with a browser MCP (Lightpanda, Playwright, Claude in Chrome), including inside the research skill. Picks the cheapest browser and lists sites that need Chromium or are blocked.
---

# Browsing

Two browser MCP servers, cheapest first:

- **Lightpanda** (`mcp__lightpanda__*`) is the default for reading, searching, extracting data, and simple form flows. Read in one call with `tree {url}` or `markdown {url, selector}` (they navigate too); use `goto` only before an action or `extract`. Whole-page `markdown` and `html` are the expensive reads.
- **Playwright** (`mcp__playwright__*`, headless Chromium) is the escalation: pixel-accurate screenshots, visual or layout checks, testing our own UI, and any site Lightpanda renders empty, broken, or stuck on a bot check.
- **Claude in Chrome** only when the task needs the user's own logged-in sessions.

If Lightpanda isn't connected (`/mcp`; it needs WSL on Windows), use Playwright for everything.

When a site needs Chromium, escalate once, then add it to the list below with the reason so later sessions go straight to Playwright.

## Sites that need Chromium

<!-- domain — reason (date) -->

## Sites blocked headlessly

Skip these in both servers; use the route named instead (the user's pasted text, Claude in Chrome, or an official API).

<!-- domain — what fails in each server, and the route that works (date) -->

## Gotchas

<!-- Append browsing misfires seen in this project here -->
