// CLI for agents (and you) to work with the desk without hand-writing HTTP calls.
//   node tools/desk.mjs pending                 list responses that still need a review
//   node tools/desk.mjs show <id>               item + your response + any review
//   node tools/desk.mjs review <id> <in_review|reviewed|followup> "<note>" [by]
//   node tools/desk.mjs items                   list all items with their state
// The server must be running (start.cmd). It writes through the same API the page uses.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.DESK_URL || "http://127.0.0.1:4100";
const read = async () => { const r = await fetch(base + "/api/state"); if (!r.ok) throw new Error("desk server not reachable at " + base); return r.json(); };
const stateOf = (s, id) => { const r = s.responses[id]; if (!r) return "open"; const v = s.reviews[id]; return v && v.forVersion === r.submittedAt ? v.state : "submitted"; };
const [cmd, id, state, note, by] = process.argv.slice(2);
const s = await read();
const title = (i) => (s.items.find((x) => x.id === i) || {}).title || "";
if (cmd === "pending") {
  const rows = Object.keys(s.responses).filter((i) => { const st = stateOf(s, i); return st === "submitted"; });
  console.log(rows.length ? rows.map((i) => `${i}\t${s.responses[i].submittedAt}\t${title(i)}`).join("\n") : "nothing pending");
} else if (cmd === "items") {
  console.log(s.items.map((i) => `${i.id}\t${i.sev}\t${stateOf(s, i.id)}\t${i.title}`).join("\n"));
} else if (cmd === "show") {
  const it = s.items.find((x) => x.id === id); if (!it) { console.error("unknown id"); process.exit(1); }
  console.log(JSON.stringify({ item: it, state: stateOf(s, id), response: s.responses[id] || null, review: s.reviews[id] || null }, null, 1));
} else if (cmd === "review") {
  if (!["in_review", "reviewed", "followup"].includes(state)) { console.error("state must be in_review, reviewed or followup"); process.exit(1); }
  const r = await fetch(base + "/api/reviews/" + encodeURIComponent(id), { method: "POST", headers: { "Content-Type": "application/json", "X-Desk": "1" }, body: JSON.stringify({ state, note: note || "", by: by || "Desk reviewer" }) });
  console.log(r.ok ? "ok" : "failed " + r.status);
} else if (cmd === "block" || cmd === "unblock") {
  // Mark an item as parked on purpose until a later point (shown as "Blocked until ..." on the page).
  //   node tools/desk.mjs block <id> "production"      node tools/desk.mjs unblock <id>
  const ip = path.join(root, "data", "items.json");
  const all = JSON.parse(fs.readFileSync(ip, "utf8"));
  const it = all.find((x) => x.id === id);
  if (!it) { console.error("unknown id"); process.exit(1); }
  if (cmd === "block") { if (!state) { console.error("give the point it waits for, e.g. production"); process.exit(1); } it.blockedUntil = String(state).slice(0, 80); } else delete it.blockedUntil;
  fs.writeFileSync(ip, JSON.stringify(all, null, 1));
  console.log(cmd === "block" ? `${id} blocked until ${it.blockedUntil}` : `${id} unblocked`);
} else if (cmd === "handoff") {
  // Headless reviewers cannot message the Tether Lead; they leave a hand-off here and the Lead picks it up.
  if (!s.items.find((x) => x.id === id)) { console.error("unknown id"); process.exit(1); }
  const hp = path.join(root, "data", "handoffs.json");
  const h = fs.existsSync(hp) ? JSON.parse(fs.readFileSync(hp, "utf8")) : { handoffs: [] };
  h.handoffs.push({ n: h.handoffs.length + 1, itemId: id, message: String(state || "").slice(0, 4000), at: new Date().toISOString(), status: "open", answer: s.responses[id] ? s.responses[id].text : null });
  fs.writeFileSync(hp, JSON.stringify(h, null, 1));
  console.log("handoff recorded");
} else if (cmd === "handoffs") {
  const hp = path.join(root, "data", "handoffs.json");
  const h = fs.existsSync(hp) ? JSON.parse(fs.readFileSync(hp, "utf8")) : { handoffs: [] };
  const open = h.handoffs.filter((x) => x.status === "open");
  console.log(open.length ? open.map((x) => `#${x.n}\t${x.itemId}\t${x.at}\n  answer: ${x.answer}\n  ${x.message}`).join("\n") : "no open handoffs");
} else if (cmd === "handoff-done") {
  const hp = path.join(root, "data", "handoffs.json");
  const h = JSON.parse(fs.readFileSync(hp, "utf8"));
  const x = h.handoffs.find((y) => String(y.n) === String(id));
  if (!x) { console.error("unknown handoff"); process.exit(1); }
  x.status = "done"; x.doneNote = String(state || "");
  fs.writeFileSync(hp, JSON.stringify(h, null, 1));
  console.log("ok");
} else { console.error("usage: pending | items | show <id> | review <id> <state> <note> [by] | handoff <id> <message> | handoffs | handoff-done <n> [note]"); process.exit(1); }
