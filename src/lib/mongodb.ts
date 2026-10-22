import { prepareManagedMongo } from "@/lib/singleplayer/prepareManagedMongo";
import { MongoClient, Db } from "mongodb";
import { getValidatedEnv } from "@/lib/env";
import {
  attachMongoCommandMonitor,
  mongoCommandMonitoringWanted,
} from "@/lib/observability/mongoMonitor";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export const DEFAULT_MONGODB_DB_NAME = "a-house-divided";

type MongoDbNameEnv = {
  MONGODB_URI?: string;
  MONGO_URL?: string;
  MONGODB_DB?: string;
  MONGO_DB_NAME?: string;
};

export function extractMongoDbNameFromUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;

  const match = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^/]+@)?[^/]+\/([^?/]*)/i);
  const dbName = match?.[1]?.trim();
  if (!dbName) return undefined;

  return decodeURIComponent(dbName);
}

export function resolveMongoDbName(env: MongoDbNameEnv): string {
  const explicitDbName = env.MONGODB_DB?.trim() || env.MONGO_DB_NAME?.trim();
  if (explicitDbName) return explicitDbName;

  return extractMongoDbNameFromUri(env.MONGODB_URI || env.MONGO_URL) ?? DEFAULT_MONGODB_DB_NAME;
}

export const DEFAULT_MONGODB_SOCKET_TIMEOUT_MS = 60_000;
const MIN_SOCKET_TIMEOUT_MS = 10_000;
const MAX_SOCKET_TIMEOUT_MS = 15 * 60_000;

/**
 * Per-operation socket timeout. 60s suits the web server: a player request should
 * fail fast rather than hang. Turn phases are different: a single aggregation on
 * a busy disk can legitimately run past a minute, and with the driver's one read
 * retry a 60s timeout aborts the phase at ~120s (turn 373's bankingTurn, 2026-10-22).
 * MONGODB_SOCKET_TIMEOUT_MS lets the turn worker raise it; clamped to 10s-15min.
 */
export function resolveMongoSocketTimeoutMs(env: Record<string, string | undefined>): number {
  const raw = Number(env.MONGODB_SOCKET_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MONGODB_SOCKET_TIMEOUT_MS;
  return Math.min(MAX_SOCKET_TIMEOUT_MS, Math.max(MIN_SOCKET_TIMEOUT_MS, Math.round(raw)));
}

function getClientPromise(): Promise<MongoClient> {
  const uri =
    process.env.NODE_ENV === "test" ? process.env.MONGODB_URI : getValidatedEnv().MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local for local development or your deployment environment variables."
    );
  }

  // Reuse a single client across invocations in all environments to avoid
  // exhausting connection pool limits on Vercel serverless functions.
  if (!global._mongoClientPromise) {
    // If connect() rejects once, we must not cache that rejection forever — the same
    // worker would then throw on every subsequent getDb() until cold restart (refresh
    // often gets a fresh isolate, which masked the bug as "first load 500, retry OK").
    const client = new MongoClient(uri, {
      maxPoolSize: 15, // Raised from 5 — a single page load fires 7+ parallel auth requests
      minPoolSize: 5, // Keep warm connections alive for Railway proxy (prevents ECONNRESET)
      maxIdleTimeMS: 0, // Never idle-timeout pooled connections; proxy handles its own lifecycle
      serverSelectionTimeoutMS: 10_000, // Fail fast in serverless rather than blocking for 30 s
      // Prevent individual operations from hanging indefinitely; the turn worker raises it.
      socketTimeoutMS: resolveMongoSocketTimeoutMs(process.env),
      monitorCommands: mongoCommandMonitoringWanted(),
    });
    // Instrument every query (breadcrumbs + slow-query/failure capture) centrally.
    attachMongoCommandMonitor(client);
    global._mongoClientPromise = (async () => {
      if (process.env.SINGLEPLAYER === "1" && process.env.SINGLEPLAYER_MANAGED_MONGO === "1")
        await prepareManagedMongo(uri);
      return client.connect();
    })().catch((err) => {
      global._mongoClientPromise = undefined;
      throw err;
    });
  }
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const dbName =
    process.env.NODE_ENV === "test"
      ? resolveMongoDbName(process.env as MongoDbNameEnv)
      : resolveMongoDbName(getValidatedEnv());

  try {
    const client = await getClientPromise();
    return client.db(dbName);
  } catch {
    // One immediate retry after clearing stale state (transient Atlas / cold connect).
    global._mongoClientPromise = undefined;
    const client = await getClientPromise();
    return client.db(dbName);
  }
}

/**
 * Return the pooled `MongoClient` when the caller needs to open a session /
 * transaction. Most routes only need `getDb()`; reach for this helper when
 * multiple cross-collection writes must commit atomically (e.g. corp HQ
 * relocation's currency conversion touching `corporations` + `corporateSectors`).
 *
 * Transactions require a replica set or sharded cluster. Use the topology
 * probe to establish support for the target deployment. Standalone mongods
 * do not support transactions; callers should handle the
 * `TransactionNotSupported` (code 20) MongoServerError gracefully (fall back
 * to sequential writes or surface as an unrecoverable error depending on the
 * correctness requirement).
 */
export async function getMongoClient(): Promise<MongoClient> {
  return getClientPromise();
}

/** Re-export for convenience; same as mongodb.Db. */
export type { Db };

export default getClientPromise;
