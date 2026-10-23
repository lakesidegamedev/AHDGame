/**
 * MongoDB command monitoring → GlitchTip.
 *
 * Attaching to the driver's command-monitoring events instruments EVERY query
 * in one place, with zero changes to the ~1000 call sites:
 *
 *  - a `db` breadcrumb per command (command + collection + durationMS), so the
 *    trail before any captured exception shows exactly which queries ran;
 *  - a captured warning for slow queries (a stable title so they group, with
 *    the duration in `extra`), surfacing N+1 / missing-index hotspots;
 *  - a breadcrumb for failed commands so a DB fault is visible in context even
 *    when the throwing call site captures the error generically.
 *
 * Breadcrumbs land on the active Sentry request-isolation scope, so they are
 * automatically grouped per request. The command document is never recorded —
 * only the command name and target collection — to avoid leaking query
 * arguments (credentials, tokens, PII).
 */
import * as Sentry from "@sentry/nextjs";
import type { MongoClient } from "mongodb";
import type { Span } from "@sentry/nextjs";
import { calculateObjectSize } from "bson";
import {
  recordDocumentsReturned,
  recordRoundTrip,
  recordWriteCommand,
  roundTripProfilingEnabled,
} from "@/lib/observability/mongoRoundTrips";
import { isSingleplayer } from "@/lib/singleplayer";

/** Driver chatter that carries no diagnostic value — never instrumented. */
const IGNORED_COMMANDS = new Set([
  "hello",
  "ismaster",
  "ping",
  "endSessions",
  "killCursors",
  "buildInfo",
  "getParameter",
  "saslStart",
  "saslContinue",
  "authenticate",
  "getnonce",
  "logout",
  "listCollections",
  "listIndexes",
]);

// Hard cap on unmatched command events per client.
const MAX_PENDING = 2000;

/**
 * Write commands whose effect we count per phase. `bulkWrite` is deliberately
 * absent: the Node driver expands it into insert/update/delete commands, so
 * counting it here would double-count.
 */
const WRITE_COMMANDS = new Set(["insert", "update", "delete", "findAndModify", "findandmodify"]);

// Span-status codes (see @sentry/core SpanStatus): 1 = OK, 2 = ERROR.
const SPAN_STATUS_OK = 1 as const;
const SPAN_STATUS_ERROR = 2 as const;

/**
 * Per-requestId span, opened on commandStarted and ended on succeeded/failed.
 * This turns each Mongo command into a `db.query` span nested under the active
 * request/turn transaction, so the trace waterfall shows individual queries
 * (name + collection + duration) alongside the existing breadcrumbs.
 */

export function collectionFromCommand(
  commandName: string,
  command: Record<string, unknown>
): string {
  // Most commands name their collection as the command's own value
  // (`{find: "corporations"}`). `getMore` does not: its value is the cursor
  // id, and the collection sits in a separate field. Without this branch every
  // paginated batch was attributed to "unknown" — and since large result sets
  // are exactly the ones that paginate, that was most of the documents the
  // turn deserializes.
  const target = command[commandName];
  if (typeof target === "string") return target;
  const named = command.collection;
  return typeof named === "string" ? named : "unknown";
}

/** Documents in a find/getMore/aggregate reply batch; empty for anything else. */
function replyBatch(reply: unknown): unknown[] {
  const cursor = (reply as { cursor?: { firstBatch?: unknown[]; nextBatch?: unknown[] } })?.cursor;
  if (!cursor) return [];
  return cursor.firstBatch ?? cursor.nextBatch ?? [];
}

/**
 * BSON size of a reply batch. Re-serializing every returned document is far
 * too expensive for the hot path, so this only runs under the profiler, where
 * bytes are the metric that ranks singleplayer cost: a 31KB NPP and a 150-byte
 * position are both "one document".
 */
function batchBytes(batch: unknown[]): number {
  let bytes = 0;
  for (const doc of batch) {
    if (doc && typeof doc === "object")
      bytes += calculateObjectSize(doc as Record<string, unknown>);
  }
  return bytes;
}

/** What the monitor remembers about a write between commandStarted and
 * commandSucceeded: how many statements were sent, plus insert payload bytes
 * when BSON accounting is on. */
export interface PendingWrite {
  statements: number;
  bytes: number;
}

/**
 * Write metadata for a command, computed once on `commandStarted`.
 *
 * Counting documents here, not just commands, is the point: a `bulkWrite` of
 * 6,000 sectors is one command but 6,000 document writes and tens of thousands
 * of index entries. Round trips alone cannot see the disk cost.
 *
 * Byte accounting only runs under AHD_TURN_ROUNDTRIP_PROFILE=1. Sizing every
 * inserted document on the production hot path would cost more than it
 * measures; document counts are always cheap.
 */
export function writeCommandInfo(
  commandName: string,
  command: Record<string, unknown>,
  sizeBytes = false
): PendingWrite | undefined {
  if (!WRITE_COMMANDS.has(commandName)) return undefined;
  if (commandName === "insert") {
    const documents = Array.isArray(command.documents)
      ? (command.documents as unknown[])
      : ([] as unknown[]);
    let bytes = 0;
    if (sizeBytes) {
      for (const doc of documents) {
        if (doc && typeof doc === "object")
          bytes += calculateObjectSize(doc as Record<string, unknown>);
      }
    }
    return { statements: documents.length, bytes };
  }
  if (commandName === "update") {
    return { statements: Array.isArray(command.updates) ? command.updates.length : 0, bytes: 0 };
  }
  if (commandName === "delete") {
    return { statements: Array.isArray(command.deletes) ? command.deletes.length : 0, bytes: 0 };
  }
  return { statements: 1, bytes: 0 };
}

/**
 * Documents a successful write command actually wrote, from its reply.
 *
 * `nModified` rather than `n` for updates: an update that matches but changes
 * nothing costs a read, not a write. Upserts count as writes.
 */
export function writeReplyCount(commandName: string, reply: unknown, fallback: number): number {
  const r = reply as
    { n?: number; nModified?: number; value?: unknown; upserted?: unknown[] } | undefined;
  switch (commandName) {
    case "insert":
      return typeof r?.n === "number" ? r.n : fallback;
    case "update": {
      const upserted = Array.isArray(r?.upserted) ? r.upserted.length : 0;
      if (typeof r?.nModified === "number") return r.nModified + upserted;
      return typeof r?.n === "number" ? r.n : fallback;
    }
    case "delete":
      return typeof r?.n === "number" ? r.n : 0;
    case "findAndModify":
    case "findandmodify":
      return r?.value != null ? 1 : 0;
    default:
      return 0;
  }
}

let attachedClients = new WeakSet<MongoClient>();

/**
 * Whether to instrument commands at all. Off under an explicit opt-out, and
 * off in singleplayer: nothing collects the breadcrumbs there (Sentry is
 * disabled without a hosting marker), and first-run world creation issues
 * tens of thousands of commands on a player's machine, where per-command
 * bookkeeping is pure cost on the critical path.
 */
export function mongoMonitorWanted(env: Record<string, string | undefined> = process.env): boolean {
  if (env.OBSERVABILITY_DB_MONITOR === "false") return false;
  return !isSingleplayer(env);
}

/** Local simulation counters do not depend on remote observability. */
export function mongoCommandMonitoringWanted(): boolean {
  return (
    process.env.AHD_TURN_ROUNDTRIP_MONITOR === "1" ||
    process.env.AHD_TURN_ROUNDTRIP_PROFILE === "1" ||
    (process.env.NODE_ENV !== "test" && mongoMonitorWanted())
  );
}

/**
 * Attach command-monitoring listeners to a MongoClient. Idempotent and a no-op
 * under ordinary tests. Simulations explicitly enable local counters.
 * The client must be created with `monitorCommands: true`.
 */
export function attachMongoCommandMonitor(client: MongoClient): void {
  if (attachedClients.has(client) || !mongoCommandMonitoringWanted()) return;
  attachedClients.add(client);
  const remoteTelemetry = process.env.NODE_ENV !== "test" && mongoMonitorWanted();
  const pendingCommands = new Map<number, { collection: string; write?: PendingWrite }>();
  const pendingSpans = new Map<number, Span>();

  client.on("commandStarted", (event) => {
    if (IGNORED_COMMANDS.has(event.commandName)) return;
    if (pendingCommands.size >= MAX_PENDING) {
      pendingCommands.clear();
      // Drop orphaned spans alongside the commands they map to, so a storm
      // of unmatched events can't leak unfinished spans either.
      for (const span of pendingSpans.values()) span.end();
      pendingSpans.clear();
    }
    const collection = collectionFromCommand(
      event.commandName,
      event.command as Record<string, unknown>
    );
    const write = writeCommandInfo(
      event.commandName,
      event.command as Record<string, unknown>,
      roundTripProfilingEnabled()
    );
    pendingCommands.set(event.requestId, write ? { collection, write } : { collection });
    // Per-phase round-trip attribution (AHD_TURN_ROUNDTRIP_PROFILE=1). A
    // boolean check when off.
    recordRoundTrip(collection);

    // Only materialize a DB span when we're already inside a RECORDING trace
    // (a sampled request/turn transaction). This is the single most important
    // safety valve here: the game issues thousands of Mongo commands per turn,
    // so creating a span for every one — 98% of which belong to unsampled
    // traces and would just be dropped — would allocate needlessly on the
    // hottest path and, on the 2% of sampled turns, bloat the transaction with
    // thousands of child spans. Gating on the active span means DB spans appear
    // exactly in the traces you'd want to inspect, and never otherwise. The
    // breadcrumbs + slow-query capture below run unconditionally, as before.
    const active = remoteTelemetry ? Sentry.getActiveSpan() : undefined;
    if (active?.isRecording()) {
      pendingSpans.set(
        event.requestId,
        Sentry.startInactiveSpan({
          name: `db.${event.commandName}.${collection}`,
          op: "db.query",
          attributes: { "db.operation": event.commandName, "db.collection": collection },
        })
      );
    }
  });

  client.on("commandSucceeded", (event) => {
    if (IGNORED_COMMANDS.has(event.commandName)) return;
    const pending = pendingCommands.get(event.requestId);
    const collection = pending?.collection ?? "unknown";
    pendingCommands.delete(event.requestId);

    // Documents returned, for the round-trip profiler. Round trips rank what
    // production pays (latency per call); documents rank what singleplayer
    // pays (deserialization per document), and one aggregate returning 61k
    // documents is a single round trip.
    const batch = replyBatch(event.reply);
    recordDocumentsReturned(
      collection,
      batch.length,
      roundTripProfilingEnabled() ? batchBytes(batch) : 0
    );

    // Write volume, for the same per-phase breakdown. Counted on success so a
    // failed command that writes nothing does not inflate the phase.
    if (pending?.write) {
      recordWriteCommand(
        collection,
        writeReplyCount(event.commandName, event.reply, pending.write.statements),
        pending.write.bytes
      );
    }

    const span = pendingSpans.get(event.requestId);
    if (span) {
      pendingSpans.delete(event.requestId);
      span.setStatus({ code: SPAN_STATUS_OK });
      span.end();
    }

    if (remoteTelemetry)
      Sentry.addBreadcrumb({
        category: "db",
        type: "query",
        level: "info",
        message: `${event.commandName} ${collection}`,
        data: { durationMS: event.duration, collection },
      });

    // Slow queries are a perf signal, not an error. They are captured above as
    // an info breadcrumb (with durationMS) so they enrich any real error that
    // follows in the same session — we deliberately do NOT mint a standalone
    // GlitchTip issue per (command, collection), which flooded the error
    // tracker with non-actionable "Slow Mongo query" noise.
  });

  client.on("commandFailed", (event) => {
    if (IGNORED_COMMANDS.has(event.commandName)) return;
    const pending = pendingCommands.get(event.requestId);
    const collection = pending?.collection ?? "unknown";
    pendingCommands.delete(event.requestId);

    const span = pendingSpans.get(event.requestId);
    if (span) {
      pendingSpans.delete(event.requestId);
      span.setStatus({
        code: SPAN_STATUS_ERROR,
        message: (event.failure as Error | undefined)?.message,
      });
      span.end();
    }

    if (remoteTelemetry)
      Sentry.addBreadcrumb({
        category: "db",
        type: "query",
        level: "error",
        message: `FAILED ${event.commandName} ${collection}`,
        data: {
          durationMS: event.duration,
          collection,
          error: (event.failure as Error | undefined)?.message,
        },
      });
  });
}

/** Test-only: reset module state between cases. */
export function __resetMongoMonitorForTest(): void {
  attachedClients = new WeakSet<MongoClient>();
}
