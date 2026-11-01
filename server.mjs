// Manager Review Desk: a tiny local server. No dependencies. Binds to 127.0.0.1 only.
// Data: ./data/items.json (items), ./data/state.json (your responses and agent reviews),
//       ./data/config.json (auto-review settings), ./data/runs.json + runs.log (auto-review history),
//       ./data/handoffs.json (decisions the Tether Lead must record).
// Auto-review: when you submit an answer, the server (after a short delay) starts one headless, tightly limited
// Claude run of the desk-reviewer agent, which reviews every pending answer. See README.md.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4100);
const f = (n) => path.join(root, "data", n);
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const writeJson = (p, v) => { const t = p + ".tmp"; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, p); };
const send = (res, code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type + "; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, no) => { let n = 0, b = []; req.on("data", (c) => { n += c.length; if (n > 200_000) { no(new Error("too large")); req.destroy(); } else b.push(c); }); req.on("end", () => ok(Buffer.concat(b).toString("utf8"))); });
const ids = () => new Set(readJson(f("items.json"), []).map((i) => i.id));
// Writes must come from this page: a custom header plus a same-origin Origin (a web page on another site cannot send both).
const sameOrigin = (req) => req.headers["x-desk"] === "1" && (!req.headers.origin || req.headers.origin === `http://127.0.0.1:${PORT}` || req.headers.origin === `http://localhost:${PORT}`);

// ---------- auto-review ----------
const DEFAULTS = { enabled: true, debounceSeconds: 15, maxRunsPerHour: 6, budgetUsd: 2, timeoutMinutes: 15, maxConsecutive: 3, tetherDir: "C:\\Dev\\AIStudentNotesApp" };
const cfg = () => ({ ...DEFAULTS, ...readJson(f("config.json"), {}) });
const claudeBin = () => { if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN; const p = path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"); return fs.existsSync(p) ? p : "claude"; };
const stateOf = (s, id) => { const r = s.responses[id]; if (!r) return "open"; const v = s.reviews[id]; return v && v.forVersion === r.submittedAt ? v.state : "submitted"; };
const pendingIds = () => { const s = readJson(f("state.json"), { responses: {}, reviews: {} }); return Object.keys(s.responses).filter((i) => stateOf(s, i) === "submitted"); };
let running = false, timer = null, consecutive = 0;
const runsFile = () => readJson(f("runs.json"), { runs: [] });
const recentRuns = () => runsFile().runs.filter((r) => r.counted !== false && Date.now() - Date.parse(r.startedAt) < 3600_000).length;
const autoStatus = () => { const c = cfg(), rs = runsFile().runs, last = rs[rs.length - 1] || null; return { enabled: c.enabled, running, pending: pendingIds().length, runsThisHour: recentRuns(), maxRunsPerHour: c.maxRunsPerHour, last: last && { startedAt: last.startedAt, endedAt: last.endedAt, ok: last.ok, note: last.note } }; };
function schedule(delayMs) {
  const c = cfg(); if (!c.enabled) return;
  clearTimeout(timer); timer = setTimeout(startRun, delayMs ?? c.debounceSeconds * 1000);
}
function record(run) { const r = runsFile(); r.runs.push(run); r.runs = r.runs.slice(-100); writeJson(f("runs.json"), r); }
function startRun() {
  const c = cfg();
  if (running || !c.enabled) return;
  const pend = pendingIds(); if (!pend.length) { consecutive = 0; return; }
  if (recentRuns() >= c.maxRunsPerHour) { const now = new Date().toISOString(); record({ startedAt: now, endedAt: now, ok: false, counted: false, note: `Skipped: the hourly limit of ${c.maxRunsPerHour} automatic runs is reached. Press Review now later.` }); return; }
  if (consecutive >= c.maxConsecutive) { consecutive = 0; return; }
  running = true; consecutive++;
  const startedAt = new Date().toISOString();
  const prompt = "Auto-review run, started by the desk server because the PO submitted an answer. Follow your agent definition: run `node tools/desk.mjs pending`, review every pending answer (mark in_review first, triage, write the result with `node tools/desk.mjs review`). You are in headless mode with limited tools: you cannot use notify_workspace. For any answer that is a decision the Tether project must record or act on, run `node tools/desk.mjs handoff <itemId> \"<message with the exact answer, the decision it implies and what you did NOT do>\"`. Read the Tether repo for facts; change nothing there. Finish with one line per answer.";
  const args = ["-p", prompt, "--agent", "desk-reviewer", "--add-dir", c.tetherDir, "--allowedTools", "Bash(node tools/desk.mjs:*)", "Read", "Grep", "Glob", "Agent", "--disallowedTools", "Write", "Edit", "WebFetch", "WebSearch", "--max-budget-usd", String(c.budgetUsd), "--no-session-persistence", "--output-format", "text"];
  let out = "", finished = false;
  const child = spawn(claudeBin(), args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const kill = setTimeout(() => { try { child.kill(); } catch {} }, c.timeoutMinutes * 60_000);
  const done = (ok, note) => {
    if (finished) return; finished = true; clearTimeout(kill); running = false;
    try { fs.appendFileSync(f("runs.log"), `\n=== ${startedAt} -> ${new Date().toISOString()} ok=${ok}\n${out.slice(-6000)}\n`); } catch {}
    record({ startedAt, endedAt: new Date().toISOString(), ok, note });
    if (pendingIds().length && ok) schedule(5000); else consecutive = 0;
  };
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  child.on("error", (e) => done(false, "Could not start Claude: " + e.message + ". Is it installed and signed in?"));
  child.on("close", (code) => {
    const left = pendingIds().length;
    done(code === 0 && left === 0, code === 0 ? (left ? `Finished but ${left} answer(s) are still pending.` : "Reviewed every pending answer.") : `Claude exited with code ${code}. ${out.trim().split("\n").slice(-1)[0] || ""}`.slice(0, 300));
  });
}

// ---------- read-only links into the Tether docs ----------
// Records (decision rows, findings, legal rows, gates) are found by their first table cell. Documents are served
// read-only, only .md files under <tetherDir>/docs, never anything else.
const REF_FILES = ["docs/DECISIONS.md", "docs/security/findings-register.md", "docs/legal/legal-register.md", "docs/RELEASE_GATES.md"];
let refCache = { t: 0, idx: {} };
function refIndex() {
  if (Date.now() - refCache.t < 5000) return refCache.idx;
  const idx = {}, base = cfg().tetherDir;
  for (const rel of REF_FILES) {
    let lines; try { lines = fs.readFileSync(path.join(base, rel), "utf8").split(/\r?\n/); } catch { continue; }
    lines.forEach((ln, i) => {
      const m = ln.match(/^\|\s*([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9.]+)+|G[1-5])\s*\|/);
      if (m && !idx[m[1].toLowerCase()]) idx[m[1].toLowerCase()] = { id: m[1], file: rel, line: i + 1, cells: ln.replace(/^\||\|\s*$/g, "").split(/\s\|\s/).map((c) => c.trim()) };
    });
  }
  refCache = { t: Date.now(), idx };
  return idx;
}
function safeDoc(rel) {
  const base = path.resolve(cfg().tetherDir, "docs");
  const full = path.resolve(cfg().tetherDir, String(rel || ""));
  if (!/\.md$/i.test(full) || !(full === base || full.startsWith(base + path.sep))) return null;
  try { const st = fs.statSync(full); if (!st.isFile() || st.size > 700_000) return null; } catch { return null; }
  return full;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/api/refs") return send(res, 200, { ids: Object.values(refIndex()).map((e) => e.id) });
    if (req.method === "GET" && url.pathname.startsWith("/api/ref/")) { const e = refIndex()[decodeURIComponent(url.pathname.slice(9)).toLowerCase()]; return e ? send(res, 200, e) : send(res, 404, { error: "unknown record" }); }
    if (req.method === "GET" && url.pathname === "/api/doc") { const rel = url.searchParams.get("path") || ""; const full = safeDoc(rel); if (!full) return send(res, 404, { error: "not available" }); return send(res, 200, { path: rel.replace(/\\/g, "/"), lines: fs.readFileSync(full, "utf8").split(/\r?\n/) }); }
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, fs.readFileSync(path.join(root, "public", "index.html"), "utf8"), "text/html");
    if (req.method === "GET" && url.pathname === "/api/state") { const s = readJson(f("state.json"), { responses: {}, reviews: {} }); return send(res, 200, { items: readJson(f("items.json"), []), responses: s.responses || {}, reviews: s.reviews || {}, auto: autoStatus() }); }
    if (req.method === "POST" && url.pathname === "/api/auto") {
      if (!sameOrigin(req)) return send(res, 403, { error: "forbidden" });
      const body = JSON.parse((await readBody(req)) || "{}");
      if (body.action === "run") { consecutive = 0; if (!running) startRun(); return send(res, 200, autoStatus()); }
      if (typeof body.enabled === "boolean") { const c = readJson(f("config.json"), {}); c.enabled = body.enabled; writeJson(f("config.json"), c); if (body.enabled && pendingIds().length) schedule(); return send(res, 200, autoStatus()); }
      return send(res, 400, { error: "bad request" });
    }
    const m = url.pathname.match(/^\/api\/(responses|reviews)\/([A-Za-z0-9_.-]{1,60})$/);
    if (m && (req.method === "PUT" || req.method === "POST")) {
      if (!sameOrigin(req)) return send(res, 403, { error: "forbidden" });
      if (!ids().has(m[2])) return send(res, 404, { error: "unknown item" });
      const body = JSON.parse((await readBody(req)) || "{}");
      const s = readJson(f("state.json"), { responses: {}, reviews: {} });
      if (m[1] === "responses") {
        const text = String(body.text || "").trim().slice(0, 20000);
        if (!text) return send(res, 400, { error: "empty" });
        s.responses[m[2]] = { itemId: m[2], text, submittedAt: new Date().toISOString() };
        writeJson(f("state.json"), s); consecutive = 0; schedule(); return send(res, 200, s.responses[m[2]]);
      }
      const states = ["in_review", "reviewed", "followup"];
      if (!states.includes(body.state)) return send(res, 400, { error: "bad state" });
      const r = s.responses[m[2]]; if (!r) return send(res, 409, { error: "no response to review" });
      s.reviews[m[2]] = { state: body.state, note: String(body.note || "").slice(0, 20000), by: String(body.by || "Agent review").slice(0, 80), at: new Date().toISOString(), forVersion: r.submittedAt };
      writeJson(f("state.json"), s); return send(res, 200, s.reviews[m[2]]);
    }
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, 500, { error: "server error" }); }
}).listen(PORT, "127.0.0.1", () => { console.log(`Manager Review Desk: http://127.0.0.1:${PORT}  (auto-review ${cfg().enabled ? "on" : "off"})`); if (cfg().enabled && pendingIds().length) schedule(10_000); });
