/**
 * End-state snapshot and diff for turn rehearsals.
 *
 *   npx tsx scripts/turn/end-state.ts snapshot --out clean.json
 *   npx tsx scripts/turn/end-state.ts snapshot --out failed.json
 *   npx tsx scripts/turn/end-state.ts diff clean.json failed.json
 *
 * The snapshot hashes every document of every collection (canonical JSON, volatile
 * fields removed) and records per-collection sums of top-level numeric fields, so a
 * double-applied money move shows up as a sum drift and a per-document hash change.
 * Sandbox databases only: the database name must start with `ahdspeed_` or `sandbox`.
 * Connection comes from MONGODB_URI and MONGODB_DB.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { MongoClient } from "mongodb";

const VOLATILE_KEYS = new Set([
  "updatedAt",
  "createdAt",
  "lastHeartbeatAt",
  "processingHeartbeat",
  "processingStartedAt",
  "processingAttempt",
]);
const SKIP_COLLECTIONS = new Set(["system.profile", "auditLog", "turnLogs", "turnPhaseTelemetry"]);
const SKIP_PREFIXES = ["system."];

type CollectionState = {
  count: number;
  sums: Record<string, number>;
  docs: Record<string, string>;
};
export type EndState = {
  db: string;
  takenAt: string;
  collections: Record<string, CollectionState>;
};

/** Stable JSON: sorted keys, dates as ISO, ObjectIds as hex, volatile fields dropped. */
export function canonical(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  const record = value as Record<string, unknown>;
  if (typeof record.toHexString === "function")
    return (record as { toHexString(): string }).toHexString();
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (VOLATILE_KEYS.has(key)) continue;
    out[key] = canonical(record[key]);
  }
  return out;
}

export function hashDoc(doc: Record<string, unknown>): string {
  return createHash("sha1")
    .update(JSON.stringify(canonical(doc)))
    .digest("hex")
    .slice(0, 16);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function snapshot(out: string): Promise<void> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB ?? uri?.match(/\/([^/?]+)(\?|$)/)?.[1];
  if (!uri || !dbName) throw new Error("MONGODB_URI and MONGODB_DB are required");
  if (!/^(ahdspeed_|sandbox)/.test(dbName)) throw new Error(`refusing non-sandbox db ${dbName}`);
  const client = await new MongoClient(uri).connect();
  try {
    const db = client.db(dbName);
    const state: EndState = { db: dbName, takenAt: new Date().toISOString(), collections: {} };
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (SKIP_COLLECTIONS.has(name) || SKIP_PREFIXES.some((p) => name.startsWith(p))) continue;
      const entry: CollectionState = { count: 0, sums: {}, docs: {} };
      for await (const doc of db.collection(name).find({})) {
        entry.count++;
        entry.docs[String(doc._id)] = hashDoc(doc);
        for (const [key, v] of Object.entries(doc))
          if (typeof v === "number" && Number.isFinite(v) && !VOLATILE_KEYS.has(key))
            entry.sums[key] = (entry.sums[key] ?? 0) + v;
      }
      state.collections[name] = entry;
    }
    writeFileSync(out, JSON.stringify(state));
    console.log(`wrote ${out}: ${Object.keys(state.collections).length} collections`);
  } finally {
    await client.close();
  }
}

export type DiffRow = { collection: string; kind: string; detail: string };

export function diffStates(a: EndState, b: EndState, tolerance = 1e-6): DiffRow[] {
  const rows: DiffRow[] = [];
  const names = new Set([...Object.keys(a.collections), ...Object.keys(b.collections)]);
  for (const name of [...names].sort()) {
    const x = a.collections[name];
    const y = b.collections[name];
    if (!x || !y) {
      rows.push({ collection: name, kind: "missing", detail: x ? "absent in B" : "absent in A" });
      continue;
    }
    if (x.count !== y.count)
      rows.push({ collection: name, kind: "count", detail: `${x.count} vs ${y.count}` });
    for (const key of new Set([...Object.keys(x.sums), ...Object.keys(y.sums)])) {
      const sa = x.sums[key] ?? 0;
      const sb = y.sums[key] ?? 0;
      if (Math.abs(sa - sb) > tolerance * Math.max(1, Math.abs(sa)))
        rows.push({ collection: name, kind: "sum", detail: `${key}: ${sa} vs ${sb}` });
    }
    const changed = Object.keys(x.docs).filter(
      (id) => y.docs[id] !== undefined && x.docs[id] !== y.docs[id]
    );
    const onlyA = Object.keys(x.docs).filter((id) => y.docs[id] === undefined).length;
    const onlyB = Object.keys(y.docs).filter((id) => x.docs[id] === undefined).length;
    if (changed.length || onlyA || onlyB)
      rows.push({
        collection: name,
        kind: "docs",
        detail: `${changed.length} changed, ${onlyA} only in A, ${onlyB} only in B; first changed ${changed.slice(0, 3).join(",")}`,
      });
  }
  return rows;
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "snapshot") return snapshot(arg("--out") ?? "end-state.json");
  if (cmd === "diff") {
    const rows = diffStates(
      JSON.parse(readFileSync(process.argv[3], "utf8")) as EndState,
      JSON.parse(readFileSync(process.argv[4], "utf8")) as EndState
    );
    for (const r of rows) console.log(`${r.collection}\t${r.kind}\t${r.detail}`);
    console.log(rows.length === 0 ? "IDENTICAL" : `${rows.length} difference(s)`);
    process.exitCode = rows.length === 0 ? 0 : 1;
    return;
  }
  console.error("usage: end-state.ts snapshot --out <file> | diff <a.json> <b.json>");
  process.exitCode = 2;
}

if (process.argv[1]?.endsWith("end-state.ts")) void main();
