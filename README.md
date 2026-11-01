# Manager Review Desk (local only)

Run `start.cmd` (needs Node). Opens http://127.0.0.1:4100. Binds to 127.0.0.1 only.
Items: data/items.json. Your answers and agent reviews: data/state.json.
This folder is its own git repository (GitHub: ManagerReviewDesk, which is PUBLIC). The `data/` folder (items, your answers, agent reviews, hand-offs, run logs) describes open security and legal issues and is **git-ignored: never commit or push it**. Commit only the server, the page, the tools and `.claude/agents`.

## Auto-review
When you submit an answer, the server waits 15 seconds (so several answers batch), then starts one headless Claude run of the `desk-reviewer` agent. That run reviews every pending answer and writes the result onto the page. It is limited on purpose:
- tools: `node tools/desk.mjs ...`, Read, Grep, Glob, Agent only (no file edits, no web); the Tether repo is readable, not writable;
- spend cap per run (`budgetUsd`, default 2), 15-minute timeout, at most 6 automatic runs per hour, at most 3 back-to-back;
- the run sends decisions for the Tether Lead to `data/handoffs.json` (`node tools/desk.mjs handoffs`); the Lead reads them when a session is open.
Settings are in `data/config.json` (`enabled`, `debounceSeconds`, `maxRunsPerHour`, `budgetUsd`, `timeoutMinutes`, `maxConsecutive`). The page shows the status, a "Turn auto-review off/on" button and "Review now". History: `data/runs.json` and `data/runs.log`.
Needs: the desk server running (start.cmd), and Claude Code installed and signed in on this computer. If either is missing, answers stay "waiting for review" and the page says why.
