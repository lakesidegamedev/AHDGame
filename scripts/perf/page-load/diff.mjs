/**
 * Compare two benchmark runs written by bench/run.mjs.
 * Usage: node scripts/perf/page-load/diff.mjs bench/results/baseline.json bench/results/after.json
 */
import { readFile } from "node:fs/promises";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error("usage: node scripts/perf/page-load/diff.mjs <before.json> <after.json>");
  process.exit(1);
}
const before = JSON.parse(await readFile(beforePath, "utf8"));
const after = JSON.parse(await readFile(afterPath, "utf8"));
const byRoute = new Map(after.results.map((r) => [r.route, r]));

const rows = [];
for (const b of before.results) {
  const a = byRoute.get(b.route);
  if (!a) continue;
  const loadDelta = a.load - b.load;
  rows.push({
    route: b.route,
    beforeLoad: b.load,
    afterLoad: a.load,
    loadDelta,
    loadPct: b.load ? (loadDelta / b.load) * 100 : 0,
    beforeTtfb: b.ttfb,
    afterTtfb: a.ttfb,
    ttfbPct: b.ttfb ? ((a.ttfb - b.ttfb) / b.ttfb) * 100 : 0,
    beforeFcp: b.fcp,
    afterFcp: a.fcp,
    fcpPct: b.fcp ? ((a.fcp - b.fcp) / b.fcp) * 100 : 0,
    beforeJs: b.jsKB,
    afterJs: a.jsKB,
  });
}

rows.sort((a, b) => a.loadPct - b.loadPct);
const fmt = (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
console.log("route".padEnd(52) + "load before→after      Δload   Δttfb   Δfcp   jsKB");
for (const r of rows) {
  console.log(
    r.route.padEnd(52) +
      `${String(r.beforeLoad).padStart(5)}→${String(r.afterLoad).padEnd(5)}  ${fmt(r.loadPct).padStart(7)} ${fmt(r.ttfbPct).padStart(7)} ${fmt(r.fcpPct).padStart(6)}  ${r.beforeJs}→${r.afterJs}`
  );
}
const avg = (key) => rows.reduce((s, r) => s + r[key], 0) / rows.length;
const improved = rows.filter((r) => r.loadDelta < 0).length;
console.log(
  `\nroutes=${rows.length} improved=${improved} mean Δload=${avg("loadPct").toFixed(1)}% median Δload=${(() => {
    const s = rows.map((r) => r.loadPct).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)].toFixed(1);
  })()}% mean Δttfb=${avg("ttfbPct").toFixed(1)}%`
);
