/**
 * Run exactly ONE turn with a chosen engine and record everything the parity
 * harness needs: per-phase time and round trips, every document the turn
 * wrote, the resulting money totals and the turn's trial balance.
 *
 * Spawned by `bench.ts`, one child process per engine, because the app's Mongo
 * client is a process-wide singleton: two engines cannot share one process.
 *
 * Local databases only.
 */

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { MongoClient, Collection, type Db, type Document } from "mongodb";

import {
  TELEMETRY_COLLECTIONS,
  assertLocalMongoUri,
  canonicalDoc,
  readMoneyTotals,
  readTrialBalance,
} from "./lib";

type EngineArg = "v1" | "v2";

interface ChangeRecord {
  collection: string;
  id: unknown;
  kind: "insert" | "update" | "delete";
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

function seedRandom(): void {
  let state = 0x9e3779b9;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function idKey(value: unknown): string {
  if (value && typeof value === "object" && "toHexString" in value) {
    return (value as { toHexString(): string }).toHexString();
  }
  return String(value);
}

/**
 * Optional call-site tracing: counts driver calls per application frame for the
 * named collections. Used to find the N+1 behind a phase that is over its
 * round-trip budget, without guessing from the collection totals.
 */
function installCallSiteTrace(collections: string): void {
  const watch = new Set(
    collections
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const counts = new Map<string, number>();
  const site = (): string => {
    const stack = (new Error().stack ?? "").split("\n").slice(2);
    const frames = stack
      .filter((line) => line.includes("/src/") && !line.includes("node_modules"))
      .slice(0, 3);
    return (
      frames
        .map((frame) =>
          frame
            .trim()
            .replace(/^at /, "")
            .replace(/.*\/worktrees\/[^/]+\//, "")
        )
        .join(" <- ") || "(no app frame)"
    );
  };
  const methods = [
    "find",
    "findOne",
    "aggregate",
    "updateOne",
    "updateMany",
    "countDocuments",
    "bulkWrite",
    "insertOne",
    "insertMany",
    "findOneAndUpdate",
    "distinct",
  ] as const;
  for (const method of methods) {
    const original = (Collection.prototype as any)[method];
    (Collection.prototype as any)[method] = function (this: Collection, ...args: unknown[]) {
      if (watch.has(this.collectionName)) {
        const key = `${this.collectionName}.${method} @ ${site()}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return original.apply(this, args);
    };
  }
  process.on("exit", () => {
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
    console.log("\n[callsites] top call sites on watched collections:");
    for (const [key, count] of rows) console.log(String(count).padStart(7), key);
  });
  console.log(`[bench] tracing call sites for ${[...watch].join(",")}`);
}

/**
 * Track every write the turn makes, without touching the game code.
 *
 * A change stream is exact: it reports the collection and document key of every
 * insert, update, replace and delete, which is precisely the set the diff has
 * to compare. `fullDocument` is left at its default because the final document
 * is read once at the end, after the turn settles.
 */
async function startWriteCapture(db: Db): Promise<{
  changes: ChangeRecord[];
  ready: Promise<void>;
  stop: () => Promise<void>;
}> {
  const changes: ChangeRecord[] = [];
  const stream = db.watch([], { maxAwaitTimeMS: 500 });
  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  void (async () => {
    for await (const change of stream) {
      const collection = (change as { ns?: { coll?: string } }).ns?.coll;
      if (!collection) continue;
      const operation = (change as { operationType?: string }).operationType ?? "";
      const key = (change as { documentKey?: { _id?: unknown } }).documentKey?._id;
      if (key === undefined) continue;
      if (collection === "__bench_cursor_probe") {
        resolveReady();
        continue;
      }
      if (TELEMETRY_COLLECTIONS.has(collection)) continue;
      if (operation === "insert") changes.push({ collection, id: key, kind: "insert" });
      else if (operation === "delete") changes.push({ collection, id: key, kind: "delete" });
      else if (operation === "update" || operation === "replace") {
        changes.push({ collection, id: key, kind: "update" });
      }
    }
  })().catch((error) => {
    console.error("[bench] change stream failed", error);
  });

  // Prove the cursor is open before the turn starts: a stream opened lazily by
  // its first `next()` would otherwise miss the first writes of the turn.
  await db.collection<{ at: Date }>("__bench_cursor_probe").insertOne({ at: new Date() });
  await Promise.race([ready, sleep(15_000)]);
  await db.collection("__bench_cursor_probe").deleteMany({});

  return {
    changes,
    ready,
    stop: async () => {
      await stream.close();
    },
  };
}

async function main(): Promise<void> {
  const uri = requireArg("--uri");
  const engine = requireArg("--engine") as EngineArg;
  const outPath = requireArg("--out");
  const settleMs = Number(argValue("--settle-ms") ?? "4000");
  if (engine !== "v1" && engine !== "v2") throw new Error(`unknown engine ${engine}`);
  assertLocalMongoUri(uri, "a benchmark turn");

  // The app validates these on first use; the bench must not need a deployment's
  // secrets to run against a local copy.
  process.env.MONGODB_URI = uri;
  process.env.AUTH_SECRET ||= "local-turn-benchmark-secret";
  process.env.ADMIN_REGISTRATION_KEY ||= "local-turn-benchmark-key";
  process.env.CRON_SECRET ||= "local-turn-benchmark-secret";
  process.env.DISABLE_DEV_BACKGROUND ||= "1";
  (process.env as Record<string, string | undefined>).NODE_ENV ||= "production";
  // A restored copy on a shared box runs the turn with cold caches and a
  // change stream attached, so the production 4-minute phase budget can trip
  // on work that fits inside it on the real host. A timed-out phase commits
  // part of its work and turns the comparison into noise, so the bench raises
  // the budget to its documented maximum instead of comparing two partial turns.
  process.env.TURN_PHASE_TIMEOUT_MS ||= "1800000";

  const capture = new MongoClient(uri);
  await capture.connect();
  const db = capture.db();

  const state = await db
    .collection<{
      _id: string;
      currentTurn: number;
      lastTurnProcessed: Date;
      isProcessing?: boolean;
    }>("gameState")
    .findOne(
      { _id: "current" },
      { projection: { currentTurn: 1, lastTurnProcessed: 1, isProcessing: 1 } }
    );
  if (!state) throw new Error("gameState.current is missing on this copy");
  if (state.isProcessing) {
    throw new Error(
      "This copy still holds a processing lock. Recreate it from the snapshot; a bench run " +
        "must start from a clean turn boundary."
    );
  }
  const startedFrom = {
    currentTurn: state.currentTurn as number,
    lastTurnProcessed: (state.lastTurnProcessed as Date | undefined)?.toISOString() ?? null,
  };

  // Selection is config-driven for real turns, and the bench is the only thing
  // allowed to flip it — on this local copy only. v1 runs UNSET so it exercises
  // the default path every live world is on today.
  const gameConfig = db.collection<{ _id: string; turnEngineVersion?: string }>("gameConfig");
  if (engine === "v1") {
    await gameConfig.updateOne({ _id: "default" }, { $unset: { turnEngineVersion: "" } });
  } else {
    await gameConfig.updateOne({ _id: "default" }, { $set: { turnEngineVersion: "v2" } });
  }

  const writes = await startWriteCapture(db);

  const trace = argValue("--trace");
  if (trace) installCallSiteTrace(trace);

  // Determinism, so the two engines are compared on equal footing:
  //
  //  - `Math.random()` is seeded. A few turn phases (Supreme Court tenure,
  //    covert nuclear programmes) still draw from it; unseeded, two runs of the
  //    SAME engine differ and a parity diff proves nothing.
  //  - Runtime ObjectIds are not seeded here (the driver generates them from a
  //    process-unique value), so `bench.ts` normalises the ids that exist in
  //    only one run before diffing. See `generatedIds` there.
  seedRandom();

  const { processTurn } = await import("@/lib/turnSystem");
  const startedAt = Date.now();
  const result = await processTurn();
  const durationMs = Date.now() - startedAt;

  await sleep(settleMs);
  await writes.stop();

  const turn = startedFrom.currentTurn + 1;
  const turnLog = (await db
    .collection<Document & { turn: number }>("turnLogs")
    .findOne({ turn }, { sort: { createdAt: -1 } })) as Document | null;

  const phaseStatuses: Record<string, unknown> = {};
  const statuses = (turnLog?.phaseStatuses ?? {}) as Record<string, Document>;
  for (const [phase, status] of Object.entries(statuses)) {
    const started = status.startedAt ? new Date(status.startedAt as Date).getTime() : null;
    const completed = status.completedAt ? new Date(status.completedAt as Date).getTime() : null;
    phaseStatuses[phase] = {
      status: status.status,
      message: status.message ?? null,
      roundTrips: status.roundTrips ?? null,
      ms: started != null && completed != null ? completed - started : null,
      topCollections: status.topCollections ?? null,
      substeps: status.substeps ?? null,
    };
  }

  // Collapse the change log to the final state of every written document.
  const byCollection = new Map<
    string,
    { insertIds: unknown[]; updateIds: unknown[]; deleteIds: unknown[] }
  >();
  for (const change of writes.changes) {
    const entry = byCollection.get(change.collection) ?? {
      insertIds: [],
      updateIds: [],
      deleteIds: [],
    };
    if (change.kind === "insert") entry.insertIds.push(change.id);
    else if (change.kind === "update") entry.updateIds.push(change.id);
    else entry.deleteIds.push(change.id);
    byCollection.set(change.collection, entry);
  }

  const writeReport: Record<string, unknown> = {};
  for (const [collection, entry] of [...byCollection].sort(([a], [b]) => a.localeCompare(b))) {
    const inserts = new Set(entry.insertIds.map(idKey));
    const updates = new Set(entry.updateIds.map(idKey).filter((key) => !inserts.has(key)));
    const deletes = new Set(entry.deleteIds.map(idKey).filter((key) => !inserts.has(key)));

    const coll = db.collection(collection);
    const docsById = new Map<string, Record<string, unknown>>();
    const ids = [...inserts, ...updates];
    if (ids.length > 0) {
      const rawIds = [
        ...new Map(
          writes.changes
            .filter((change) => change.collection === collection && change.kind !== "delete")
            .map((change) => [idKey(change.id), change.id])
        ).values(),
      ];
      const found = await coll.find({ _id: { $in: rawIds as never[] } }).toArray();
      for (const doc of found) {
        docsById.set(idKey(doc._id), doc as Record<string, unknown>);
      }
    }

    const insertedDocs: unknown[] = [];
    let insertsMissing = 0;
    for (const key of inserts) {
      const doc = docsById.get(key);
      if (!doc) {
        insertsMissing += 1;
        continue;
      }
      insertedDocs.push(canonicalDoc(collection, doc, { dropId: true }));
    }
    const updatedDocs: Record<string, unknown> = {};
    for (const key of updates) {
      const doc = docsById.get(key);
      if (!doc) {
        deletes.add(key);
        continue;
      }
      updatedDocs[key] = canonicalDoc(collection, doc);
    }
    writeReport[collection] = {
      inserts: insertedDocs,
      insertsMissing,
      updates: updatedDocs,
      deletes: [...deletes],
    };
  }

  const payload = {
    engine,
    turn,
    startedFrom,
    durationMs,
    processTurnResult: {
      success: result.success,
      message: result.message,
      warnings: result.warnings,
    },
    turnLog: turnLog
      ? {
          durationMs: turnLog.durationMs,
          outcome: turnLog.outcome ?? null,
          turnEngine: turnLog.turnEngine ?? null,
          engineVersion: turnLog.engineVersion ?? null,
          v2Phases: turnLog.v2Phases ?? null,
          build: turnLog.build ?? null,
        }
      : null,
    phaseStatuses,
    writes: writeReport,
    money: await readMoneyTotals(db),
    trialBalance: await readTrialBalance(db, turn),
  };

  await mkdir(dirname(outPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(outPath);
    stream.on("error", reject);
    stream.on("finish", () => resolve());
    stream.end(gzipSync(Buffer.from(JSON.stringify(payload))));
  });

  console.log(
    `[bench] ${engine} turn ${turn}: ${(durationMs / 1000).toFixed(1)}s, ` +
      `${Object.keys(writeReport).length} collections written, trial balance ` +
      `${payload.trialBalance.unbalanced === 0 ? "green" : "RED"}`
  );

  await capture.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
