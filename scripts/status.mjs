// Regenerates the status files from STATUS.json and status/findings.csv.
// Outputs: docs/STATUS.md (human-readable, opens nicely on GitHub mobile) and the status/*.csv files.
// Run: npm run status
import { readFileSync, writeFileSync } from "node:fs";

const s = JSON.parse(readFileSync("STATUS.json", "utf8"));
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

writeFileSync("status/milestones.csv", csv([["phase_id", "phase", "milestone", "state"],
  ...s.phases.flatMap((p) => p.milestones.map((m) => [p.id, `${p.id}. ${p.name}`, m.name, m.state]))]));
writeFileSync("status/needs_patrick.csv", csv([["priority", "item", "recommendation"],
  ...s.needsPatrick.map((n, i) => [i + 1, n.item, n.recommendation])]));
writeFileSync("status/tests.csv", csv([["suite", "passing", "failing"], ["all", s.tests.passing, s.tests.failing]]));

// findings.csv: id,agent,severity,area,finding,status (quoted fields allowed)
function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"' && f === "") q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); f = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
let findings = [];
try { findings = parseCsv(readFileSync("status/findings.csv", "utf8")).slice(1); } catch { /* none yet */ }
// findings.csv is append-only: a later row for the same id replaces the earlier one (latest status wins).
const latest = new Map();
for (const r of findings) { latest.delete(r[0]); latest.set(r[0], r); }
const open = [...latest.values()].filter((r) => r[5] && r[5] !== "fixed");

const icon = { done: "Done", in_progress: "In progress", in_review: "In review", parked: "Parked", todo: "To do" };
const phaseLine = (p) => {
  const done = p.milestones.filter((m) => m.state === "done").length;
  return `| ${p.id}. ${p.name} | ${icon[p.state] ?? p.state} | ${done} of ${p.milestones.length} |`;
};
const current = s.phases.find((p) => p.id === s.currentPhase);
const md = [
  `# Revisit status`,
  ``,
  `Updated ${s.lastUpdated}. Generated from STATUS.json by \`npm run status\`; don't edit by hand.`,
  ``,
  `**Tests:** ${s.tests.passing} passing, ${s.tests.failing} failing · **Current phase:** ${current ? `${current.id}. ${current.name}` : s.currentPhase} · **Open review findings:** ${open.length}`,
  ``,
  `## Needs Patrick`,
  ``,
  ...(s.needsPatrick.length ? s.needsPatrick.map((n, i) => `${i + 1}. **${n.item}**  \n   Recommended: ${n.recommendation}`) : ["Nothing right now."]),
  ``,
  `## Phases`,
  ``,
  `| Phase | State | Milestones done |`,
  `| --- | --- | --- |`,
  ...s.phases.map(phaseLine),
  ``,
  ...(current ? [`## ${current.id}. ${current.name}`, ``, ...current.milestones.map((m) => `- **${icon[m.state] ?? m.state}:** ${m.name}`), ``] : []),
  `## Open review findings`,
  ``,
  ...(open.length ? [`| ID | Agent | Severity | Finding | Status |`, `| --- | --- | --- | --- | --- |`,
    ...open.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${String(r[4]).replace(/\|/g, "\\|")} | ${r[5]} |`)] : ["None."]),
  ``,
  ...(s.flags?.length ? [`## Flags`, ``, ...s.flags.map((f) => `- ${typeof f === "string" ? f : JSON.stringify(f)}`), ``] : []),
].join("\n");
writeFileSync("docs/STATUS.md", md);
console.log(`docs/STATUS.md and status/*.csv regenerated (${open.length} open findings).`);
