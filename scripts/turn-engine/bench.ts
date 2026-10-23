/**
 * Turn-engine benchmark and parity harness.
 *
 * Runs one turn on v1 and the SAME turn on v2, each from an identical restored
 * copy of the same database snapshot, then compares:
 *
 *   - per-phase wall time and Mongo round trips;
 *   - every document either engine wrote, by collection, order-insensitively
 *     (updates by `_id`, inserts as a multiset, deletes as a set);
 *   - per-currency cash, deposit, loan, bond and treasury totals;
 *   - the turn's ledger trial balance.
 *
 * Both copies must be at the same turn boundary before the run; the harness
 * refuses to start otherwise, because a diff between different starting worlds
 * proves nothing.
 *
 *   npx tsx scripts/turn-engine/bench.ts \
 *     --v1-uri mongodb://127.0.0.1:27041/a-house-divided \
 *     --v2-uri mongodb://127.0.0.1:27042/a-house-divided \
 *     --out /tmp/turn-engine-bench
 *
 * Local databases only. Results are written to `--out` and are NOT meant to be
 * committed: they can contain player data.
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { MongoClient } from "mongodb";

import {
  TIMESTAMP_FIELDS,
  assertLocalMongoUri,
  canonicalKey,
  diffDocs,
  type MoneyTotals,
  type TrialBalanceResult,
} from "./lib";

interface WriteReport {
  inserts: unknown[];
  /** Ids of documents this run inserted (the only ones safe to mask). */
  insertIds: string[];
  insertsMissing: number;
  updates: Record<string, Record<string, unknown>>;
  deletes: string[];
}

interface RunResult {
  engine: "v1" | "v2";
  turn: number;
  startedFrom: { currentTurn: number; lastTurnProcessed: string | null };
  durationMs: number;
  processTurnResult: { success: boolean; message: string; warnings: string[] };
  turnLog: {
    durationMs: number;
    outcome: string | null;
    turnEngine: string | null;
    engineVersion: string | null;
    v2Phases: string[] | null;
    build: unknown;
  } | null;
  phaseStatuses: Record<
    string,
    {
      status: string;
      message?: string | null;
      roundTrips: number | null;
      ms: number | null;
      topCollections: unknown;
    }
  >;
  writes: Record<string, WriteReport>;
  money: MoneyTotals;
  trialBalance: TrialBalanceResult;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requireArg(flag: string): string {
  const value = argValue(flag);
  if (!value) throw new Error(`missing ${flag}`);
  return value;
}

function runEngine(input: {
  uri: string;
  engine: "v1" | "v2";
  outPath: string;
  settleMs: number;
  trace?: string;
}): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        resolve("scripts/turn-engine/run-turn.ts"),
        "--uri",
        input.uri,
        "--engine",
        input.engine,
        "--out",
        input.outPath,
        "--settle-ms",
        String(input.settleMs),
        ...(input.trace ? ["--trace", input.trace] : []),
      ],
      { stdio: "inherit", env: process.env }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${input.engine} run exited with ${code}`));
    });
  });
}

async function readRun(path: string): Promise<RunResult> {
  return JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as RunResult;
}

async function startingState(uri: string): Promise<{
  currentTurn: number;
  lastTurnProcessed: string | null;
  configEngine: string | null;
}> {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();
    const state = await db
      .collection<{ _id: string; currentTurn: number; lastTurnProcessed: Date }>("gameState")
      .findOne({ _id: "current" }, { projection: { currentTurn: 1, lastTurnProcessed: 1 } });
    const config = await db
      .collection<{ _id: string; turnEngineVersion?: string }>("gameConfig")
      .findOne({ _id: "default" }, { projection: { turnEngineVersion: 1 } });
    return {
      currentTurn: Number(state?.currentTurn ?? -1),
      lastTurnProcessed: (state?.lastTurnProcessed as Date | undefined)?.toISOString() ?? null,
      configEngine: (config?.turnEngineVersion as string | undefined) ?? null,
    };
  } finally {
    await client.close();
  }
}

// Runtime ids are 24-hex ObjectIds or 32-hex uuids without dashes; a
// settlement key can embed either, sometimes with a truncated tail after the
// first 24 characters, so the whole run is masked at once.
const HEX24_RE = /[0-9a-f]{24,32}/gi;

/**
 * Runtime-generated ids, and only those.
 *
 * An id is generated when one run inserted a document carrying it and the other
 * run inserted none with that id: new documents get runtime ObjectIds and those
 * ids are embedded in other documents (`subjectId`, `refs`, settlement keys),
 * so comparing them directly would report every reference as a difference while
 * saying nothing about the outcome.
 *
 * Deliberately NOT "any id present in only one run's documents": a pre-existing
 * entity that one engine touched and the other did not must stay visible, and
 * that is exactly what the insert sets distinguish. Inserted documents are
 * still compared by content (a multiset with `_id` removed), so masking their
 * ids cannot hide a missing or different insert.
 */
function runtimeIds(left: RunResult, right: RunResult): Set<string> {
  const leftIds = insertedIds(left);
  const rightIds = insertedIds(right);
  const generated = new Set<string>();
  for (const id of leftIds) if (!rightIds.has(id)) generated.add(id);
  for (const id of rightIds) if (!leftIds.has(id)) generated.add(id);
  return generated;
}

function insertedIds(run: RunResult): Set<string> {
  const ids = new Set<string>();
  for (const collection of Object.values(run.writes)) {
    for (const id of collection.insertIds ?? []) ids.add(String(id).toLowerCase());
  }
  return ids;
}

/**
 * Drop wall-clock fields from an already-canonicalised document.
 *
 * Runs are captured at different times and the capture format is what the
 * comparison sees, so the strip has to be applied here as well as at capture:
 * that keeps `--compare-only` valid on artifacts written before a timestamp
 * field was added to the list.
 */
function stripWallClock(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripWallClock);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (TIMESTAMP_FIELDS.has(key)) continue;
      out[key] = stripWallClock(item);
    }
    return out;
  }
  return value;
}

function maskIds(run: RunResult, ids: Set<string>): void {
  const mask = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (ids.size === 0) return value;
      return value.replace(HEX24_RE, (match) =>
        ids.has(match.toLowerCase()) ? "<runtime-id>" : match
      );
    }
    if (Array.isArray(value)) return value.map(mask);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        out[key] = mask(item);
      }
      return out;
    }
    return value;
  };
  for (const collection of Object.values(run.writes)) {
    const updates: Record<string, Record<string, unknown>> = {};
    for (const [key, doc] of Object.entries(collection.updates)) {
      updates[key] = stripWallClock(mask(doc)) as Record<string, unknown>;
    }
    collection.updates = updates;
    collection.inserts = collection.inserts.map((doc) => stripWallClock(mask(doc)));
  }
}

/**
 * Acceptance for one side, checked independently. A merged phase map lets one
 * side's success overwrite the other's failure, and a turn that reports
 * `success: false` or left a phase unfinished never produced a world worth
 * comparing.
 */
function acceptanceFailures(run: RunResult, label: string): string[] {
  const failures: string[] = [];
  if (!run.processTurnResult.success) {
    failures.push(`${label}: processTurn reported failure (${run.processTurnResult.message})`);
  }
  for (const [phase, status] of Object.entries(run.phaseStatuses)) {
    const message = String(status.message ?? "").toLowerCase();
    if (status.status === "failed") failures.push(`${label}: phase ${phase} failed`);
    if (status.status === "notReached" || status.status === "pending") {
      failures.push(`${label}: phase ${phase} was never reached (${status.status})`);
    }
    if (status.status === "running") failures.push(`${label}: phase ${phase} never finished`);
    if (message.includes("timed out")) failures.push(`${label}: phase ${phase} timed out`);
  }
  return failures;
}

interface Difference {
  collection: string;
  kind: "update" | "insert" | "delete";
  id?: string;
  detail: string;
}

function compareWrites(
  v1: RunResult,
  v2: RunResult
): {
  differences: Difference[];
  collections: number;
  documentsCompared: number;
} {
  const differences: Difference[] = [];
  const collections = new Set([...Object.keys(v1.writes), ...Object.keys(v2.writes)]);
  let documentsCompared = 0;

  for (const collection of [...collections].sort()) {
    const left = v1.writes[collection];
    const right = v2.writes[collection];
    if (!left || !right) {
      differences.push({
        collection,
        kind: "update",
        detail: left ? "only v1 wrote this collection" : "only v2 wrote this collection",
      });
      continue;
    }

    const updateIds = new Set([...Object.keys(left.updates), ...Object.keys(right.updates)]);
    for (const id of updateIds) {
      documentsCompared += 1;
      const leftDoc = left.updates[id] ?? null;
      const rightDoc = right.updates[id] ?? null;
      if (!leftDoc || !rightDoc) {
        differences.push({
          collection,
          kind: "update",
          id,
          detail: leftDoc ? "document missing from v2" : "document missing from v1",
        });
        continue;
      }
      const fieldDiffs = diffDocs(leftDoc, rightDoc);
      if (fieldDiffs.length > 0) {
        differences.push({ collection, kind: "update", id, detail: fieldDiffs.join("; ") });
      }
    }

    const leftInserts = new Map<string, number>();
    for (const doc of left.inserts) {
      const key = canonicalKey(doc);
      leftInserts.set(key, (leftInserts.get(key) ?? 0) + 1);
    }
    const rightInserts = new Map<string, number>();
    for (const doc of right.inserts) {
      const key = canonicalKey(doc);
      rightInserts.set(key, (rightInserts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of leftInserts) {
      documentsCompared += count;
      const other = rightInserts.get(key) ?? 0;
      if (other !== count) {
        differences.push({
          collection,
          kind: "insert",
          detail: `insert multiset ${count} vs ${other}: ${key.slice(0, 200)}`,
        });
      }
    }
    for (const [key, count] of rightInserts) {
      if ((leftInserts.get(key) ?? 0) === 0) {
        differences.push({
          collection,
          kind: "insert",
          detail: `only v2 inserted ${count}: ${key.slice(0, 200)}`,
        });
      }
    }
    if (left.insertsMissing !== right.insertsMissing) {
      differences.push({
        collection,
        kind: "insert",
        detail: `inserts deleted before capture: ${left.insertsMissing} vs ${right.insertsMissing}`,
      });
    }

    const deletes = new Set([...left.deletes, ...right.deletes]);
    for (const id of deletes) {
      const inLeft = left.deletes.includes(id);
      const inRight = right.deletes.includes(id);
      if (inLeft !== inRight) {
        differences.push({
          collection,
          kind: "delete",
          id,
          detail: inLeft ? "only v1 deleted" : "only v2 deleted",
        });
      }
    }
  }

  return { differences, collections: collections.size, documentsCompared };
}

function compareMoney(v1: MoneyTotals, v2: MoneyTotals): Difference[] {
  const differences: Difference[] = [];
  for (const bucket of Object.keys(v1) as (keyof MoneyTotals)[]) {
    const currencies = new Set([...Object.keys(v1[bucket]), ...Object.keys(v2[bucket])]);
    for (const currency of [...currencies].sort()) {
      const left = v1[bucket][currency] ?? 0;
      const right = v2[bucket][currency] ?? 0;
      if (Math.abs(left - right) > 0.01) {
        differences.push({
          collection: `money.${bucket}`,
          kind: "update",
          detail: `${currency}: ${left} vs ${right}`,
        });
      }
    }
  }
  return differences;
}

function phaseTable(v1: RunResult, v2: RunResult): string {
  const phases = new Set([...Object.keys(v1.phaseStatuses), ...Object.keys(v2.phaseStatuses)]);
  const rows = [...phases]
    .map((phase) => {
      const left = v1.phaseStatuses[phase];
      const right = v2.phaseStatuses[phase];
      return {
        phase,
        v1Ms: left?.ms ?? 0,
        v2Ms: right?.ms ?? 0,
        v1Rt: left?.roundTrips ?? 0,
        v2Rt: right?.roundTrips ?? 0,
      };
    })
    .filter((row) => row.v1Ms > 0 || row.v2Ms > 0)
    .sort((a, b) => b.v1Ms - a.v1Ms);

  const lines = [
    "phase                        v1 ms    v2 ms   v1 rt   v2 rt   rt cut",
    "-----------------------------------------------------------------------",
  ];
  for (const row of rows.slice(0, 25)) {
    const cut = row.v1Rt > 0 ? `${(100 - (row.v2Rt / row.v1Rt) * 100).toFixed(1)}%` : "-";
    lines.push(
      `${row.phase.padEnd(28)} ${String(Math.round(row.v1Ms)).padStart(7)} ${String(
        Math.round(row.v2Ms)
      ).padStart(
        8
      )} ${String(row.v1Rt).padStart(7)} ${String(row.v2Rt).padStart(7)} ${cut.padStart(8)}`
    );
  }
  const v1Rt = Object.values(v1.phaseStatuses).reduce((sum, p) => sum + (p.roundTrips ?? 0), 0);
  const v2Rt = Object.values(v2.phaseStatuses).reduce((sum, p) => sum + (p.roundTrips ?? 0), 0);
  lines.push(
    `${"TOTAL (turn log)".padEnd(28)} ${String(Math.round(v1.durationMs)).padStart(7)} ${String(
      Math.round(v2.durationMs)
    ).padStart(8)} ${String(v1Rt).padStart(7)} ${String(v2Rt).padStart(7)} ${(v1Rt > 0
      ? `${(100 - (v2Rt / v1Rt) * 100).toFixed(1)}%`
      : "-"
    ).padStart(8)}`
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const v1Uri = requireArg("--v1-uri");
  const v2Uri = requireArg("--v2-uri");
  const outDir = resolve(requireArg("--out"));
  const settleMs = Number(argValue("--settle-ms") ?? "4000");
  const trace = argValue("--trace");
  // Control run: both copies run v1. Quantifies the turn's own nondeterminism
  // (seeded RNG aside, fire-and-forget writes and id generation are not fully
  // ordered), which is the floor any v1-vs-v2 diff has to be judged against.
  const control = process.argv.includes("--control");
  // Re-run the comparison from saved runs without advancing another turn.
  const compareOnly = process.argv.includes("--compare-only");
  assertLocalMongoUri(v1Uri, "the v1 benchmark turn");
  assertLocalMongoUri(v2Uri, "the v2 benchmark turn");
  mkdirSync(outDir, { recursive: true });

  if (!compareOnly) {
    const [left, right] = await Promise.all([startingState(v1Uri), startingState(v2Uri)]);
    if (
      left.currentTurn !== right.currentTurn ||
      left.lastTurnProcessed !== right.lastTurnProcessed
    ) {
      throw new Error(
        `The two copies are not the same starting world: v1 turn ${left.currentTurn} ` +
          `(${left.lastTurnProcessed}) vs v2 turn ${right.currentTurn} (${right.lastTurnProcessed}). ` +
          "Restore both from the same snapshot."
      );
    }
    console.log(
      `[bench] starting from turn ${left.currentTurn}, last processed ${left.lastTurnProcessed}`
    );
  }

  const v1Path = join(outDir, "v1.json.gz");
  const v2Path = join(outDir, "v2.json.gz");
  if (!compareOnly) {
    await runEngine({ uri: v1Uri, engine: "v1", outPath: v1Path, settleMs, trace });
    await runEngine({
      uri: v2Uri,
      engine: control ? "v1" : "v2",
      outPath: v2Path,
      settleMs,
      trace,
    });
    if (control) console.log("[bench] CONTROL: both copies ran the v1 engine");
  }

  const v1 = await readRun(v1Path);
  const v2 = await readRun(v2Path);

  // Kill runtime-id noise before comparing: see `runtimeIds`.
  const generated = runtimeIds(v1, v2);
  maskIds(v1, generated);
  maskIds(v2, generated);

  const parity = compareWrites(v1, v2);
  const moneyDiffs = compareMoney(v1.money, v2.money);
  const differences = [...parity.differences, ...moneyDiffs];

  // A timed-out phase keeps the writes it already committed and is not retried,
  // so two timed-out runs can differ for reasons that have nothing to do with
  // the engine. Surface it as a failed comparison instead of a parity result.
  const acceptance = [...acceptanceFailures(v1, "v1"), ...acceptanceFailures(v2, "v2")];

  // Warnings are how a degraded turn explains itself. A warning on one side and
  // not the other means the engines did not run the same turn, even when the
  // documents happen to agree.
  const warningDiff = (() => {
    const left = [...v1.processTurnResult.warnings].sort();
    const right = [...v2.processTurnResult.warnings].sort();
    const onlyLeft = left.filter((warning) => !right.includes(warning));
    const onlyRight = right.filter((warning) => !left.includes(warning));
    return [...onlyLeft.map((w) => `v1 only: ${w}`), ...onlyRight.map((w) => `v2 only: ${w}`)];
  })();

  const byCollection = new Map<string, number>();
  for (const difference of differences) {
    byCollection.set(difference.collection, (byCollection.get(difference.collection) ?? 0) + 1);
  }

  console.log(`\n${phaseTable(v1, v2)}\n`);
  console.log(
    `[bench] turn v1 ${(v1.durationMs / 1000).toFixed(1)}s vs v2 ${(v2.durationMs / 1000).toFixed(
      1
    )}s (${((v2.durationMs / v1.durationMs) * 100).toFixed(1)}% of v1)`
  );
  console.log(
    `[bench] engines: v1=${v1.turnLog?.turnEngine}/${v1.turnLog?.engineVersion} ` +
      `v2=${v2.turnLog?.turnEngine}/${v2.turnLog?.engineVersion} ` +
      `v2 phases=${(v2.turnLog?.v2Phases ?? []).join(",") || "none"}`
  );
  console.log(
    `[bench] parity: ${parity.collections} collections, ${parity.documentsCompared} documents, ` +
      `${differences.length} difference(s)`
  );
  console.log(
    `[bench] trial balance: v1 ${v1.trialBalance.entries} entries / ` +
      `${v1.trialBalance.unbalanced} unbalanced / max residual ${v1.trialBalance.maxAbsResidual}; ` +
      `v2 ${v2.trialBalance.entries} entries / ${v2.trialBalance.unbalanced} unbalanced / ` +
      `max residual ${v2.trialBalance.maxAbsResidual}`
  );
  for (const [collection, count] of [...byCollection].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${collection}: ${count}`);
  }
  for (const difference of differences.slice(0, 40)) {
    console.log(
      `  - ${difference.collection} ${difference.kind}${difference.id ? ` ${difference.id}` : ""}: ${
        difference.detail
      }`
    );
  }

  writeFileSync(
    join(outDir, "summary.json"),
    JSON.stringify(
      {
        startedFrom: v1.startedFrom,
        v1: {
          durationMs: v1.durationMs,
          turnLog: v1.turnLog,
          trialBalance: v1.trialBalance,
          money: v1.money,
        },
        v2: {
          durationMs: v2.durationMs,
          turnLog: v2.turnLog,
          trialBalance: v2.trialBalance,
          money: v2.money,
        },
        parity: {
          collections: parity.collections,
          documentsCompared: parity.documentsCompared,
          differences,
          acceptance,
          warningDiff,
        },
      },
      null,
      2
    )
  );

  for (const failure of acceptance) console.log(`[bench] ${failure}`);
  for (const warning of warningDiff.slice(0, 20)) console.log(`[bench] warning ${warning}`);
  const ok =
    differences.length === 0 &&
    v1.trialBalance.unbalanced === 0 &&
    v2.trialBalance.unbalanced === 0 &&
    acceptance.length === 0 &&
    warningDiff.length === 0;
  console.log(ok ? "\n[bench] PASS" : "\n[bench] FAIL");
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
