# Manager Review Desk (local project; formerly the Tether Review Desk, moved to C:\Dev\ManagerReviewDesk on 2026-11-01)

A small local site where the Product Owner (PO) answers open security, legal and decision items for the Tether app, one at a time. Agents here review the answers and keep the desk current. This folder is a git repository whose GitHub remote is PUBLIC, and the items describe open security and legal issues, so `data/` is git-ignored and must never be committed (see `.gitignore`). Only the server, the page, the tools and the agent definitions are committable. Never copy this folder's data into the Tether repo, never commit it anywhere, never publish it.

## Pieces
- `server.mjs` serves http://127.0.0.1:4100 (start with `start.cmd`; binds to 127.0.0.1 only). No dependencies.
- `public/index.html` is the page. `data/items.json` are the items. `data/state.json` holds the PO's responses and the agents' reviews.
- `tools/desk.mjs` is the agent CLI: `pending`, `items`, `show <id>`, `review <id> <in_review|reviewed|followup> "<note>" [by]`. Use it instead of editing `state.json` by hand.
- States the page shows: needs response, submitted (waiting for review), in review (agent working), reviewed (green), follow-up (agent has a question for the PO).

## The Tether project
The code and docs live at `C:\Dev\AIStudentNotesApp` (linked workspace "AIStudentNotesApp"; read its files directly, and talk to its agents with the switchyard tools `ask_workspace` / `notify_workspace`). Facts agents here need are in that repo: `docs/DECISIONS.md` (PO decisions, PO-xx), `docs/security/findings-register.md`, `docs/legal/legal-register.md`, `docs/RELEASE_GATES.md`, `docs/agents/project-playbook.md`.

## Rules for every agent here
1. Read-only on the Tether repo. Never edit, commit or push there; ask its Lead via `ask_workspace` / `notify_workspace` when something in that repo must change.
2. Never invent facts. Quote the file and line for anything you say about the Tether project; say what you could not verify.
3. A review is an honest reading of the PO's answer against the registers and decisions. Do not close a legal or security finding, and do not mark any release gate passed (G1 to G5). AI review never closes a human gate.
4. Do not change the PO's response text or the item text. Reviews go through `tools/desk.mjs review`.
5. Notes are written for the PO in plain language: short sentences, say what happened and what you need from them, no jargon pile-ups.
6. Everything stays local. No network calls except the local desk server and the switchyard tools.
