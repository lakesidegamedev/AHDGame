/**
 * Per-request MongoDB attribution for a locally running build.
 *
 * Turns the database profiler on for the benchmark clone, issues one page
 * request, then aggregates what the request ran: operations per collection,
 * total/median/max duration and any multi-op bursts (N+1 signatures).
 *
 * Usage: node scripts/perf/page-load/db-profile.mjs <baseUrl> <route> [--db=<name>] [--storage=<state.json>]
 *
 * `--storage` replays the cookie jar from `login-state.mjs`, so authenticated
 * pages (/profile, /actions, /portfolio) can be profiled too.
 */
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const base = (process.argv[2] || "http://127.0.0.1:3100").replace(/\/$/, "");
const route = process.argv[3] || "/login";
const dbNameArg = process.argv.find((a) => a.startsWith("--db="));
const dbName = dbNameArg ? dbNameArg.slice(5) : "ahd_sim_pageload_perf_20261022";
const storageArg = process.argv.find((a) => a.startsWith("--storage="));
const storagePath = storageArg ? storageArg.slice("--storage=".length) : "";

const requestHeaders = { "user-agent": "Mozilla/5.0 Chrome/120" };
if (storagePath) {
  const state = JSON.parse(await readFile(storagePath, "utf8"));
  requestHeaders.cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

const client = new MongoClient("mongodb://127.0.0.1:27018/?directConnection=true", {
  serverSelectionTimeoutMS: 10_000,
});
await client.connect();
const db = client.db(dbName);
const profile = db.collection("system.profile");

await db.command({ profile: 0 }).catch(() => {});
await profile.drop().catch(() => {});
await db.command({ profile: 2, slowms: 0, sampleRate: 1.0 });

const started = Date.now();
const res = await fetch(base + route, { headers: requestHeaders, redirect: "manual" });
const body = await res.text();
const elapsed = Date.now() - started;

// Give the profiler a beat to flush the final entries.
await new Promise((r) => setTimeout(r, 400));

const rows = await profile
  .find(
    { ns: { $not: /system\.profile/ }, op: { $nin: ["command"] } },
    {
      projection: {
        ns: 1,
        op: 1,
        millis: 1,
        "command.find": 1,
        "command.aggregate": 1,
        planSummary: 1,
      },
    }
  )
  .toArray();

const byNs = new Map();
for (const r of rows) {
  const key = `${r.ns}`;
  const cur = byNs.get(key) ?? { n: 0, ms: 0, max: 0, plans: new Set() };
  cur.n++;
  cur.ms += r.millis || 0;
  cur.max = Math.max(cur.max, r.millis || 0);
  if (r.planSummary) cur.plans.add(r.planSummary);
  byNs.set(key, cur);
}

console.log(
  `route=${route} status=${res.status} bytes=${body.length} wall=${elapsed}ms dbOps=${rows.length} dbMs=${rows.reduce((s, r) => s + (r.millis || 0), 0).toFixed(1)}`
);
const sorted = [...byNs].sort((a, b) => b[1].ms - a[1].ms);
for (const [ns, v] of sorted) {
  console.log(
    `  ${String(v.n).padStart(3)}x ${String(Math.round(v.ms)).padStart(5)}ms max=${String(Math.round(v.max)).padStart(4)}ms ${ns}${v.plans.size ? " [" + [...v.plans].join(";") + "]" : ""}`
  );
}

await db.command({ profile: 0 });
await profile.drop().catch(() => {});
await client.close();
