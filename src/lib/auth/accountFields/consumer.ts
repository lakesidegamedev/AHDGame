import { ObjectId, type Db, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { logger } from "@/lib/observability/logger";
import { cronLocksCollection } from "@/lib/db/repositories/cronLocks";
import { usersCollection } from "@/lib/db/repositories/users";
import { getActionAuditLogCollection } from "@/lib/db/collections/actionAuditLog";
import { invalidateCachedUser } from "@/lib/auth/userDocCache";
import { bridgeAccountChanges, isBridgeConfigured } from "@/lib/auth/centralLogin/bridgeClient";
import { getAccountFieldsMode, getUsernameMode } from "./mode";
import {
  normalizeFeedEmail,
  FORMER_USERNAME_DAYS,
  normalizeFeedUsername,
  parseAccountChangesPage,
  type AccountChange,
  type AccountChangesPage,
} from "./rules";

export const FEED_LOCK_ID = "account-fields-feed";
export const FEED_POLL_MS = 10_000;
export const FEED_LEASE_MS = 30_000;
export const FEED_PAGE_LIMIT = 200;
const MAX_PAGES_PER_POLL = 5;
const MAX_BACKOFF_MS = 5 * 60_000;

interface FeedState {
  _id: string;
  owner?: string;
  leaseUntil?: Date;
  cursor?: number;
  lastPollAt?: Date;
  lastError?: string | null;
  lastErrorAt?: Date | null;
}

export type FetchPage = (after: number, limit: number) => Promise<AccountChangesPage | null>;

export interface PollDeps {
  db: Db;
  owner: string;
  now?: () => Date;
  fetchPage?: FetchPage;
}

export type PollResult =
  | { status: "busy" }
  | { status: "error"; error: string }
  | { status: "ok"; applied: number; skipped: number; cursor: number };

async function defaultFetchPage(after: number, limit: number): Promise<AccountChangesPage | null> {
  const result = await bridgeAccountChanges(after, limit);
  return result.ok ? parseAccountChangesPage(result.data) : null;
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 11000;
}

async function acquireLease(db: Db, owner: string, now: Date): Promise<boolean> {
  try {
    const result = await cronLocksCollection<FeedState>(db).updateOne(
      { _id: FEED_LOCK_ID, $or: [{ leaseUntil: { $lte: now } }, { owner }] },
      { $set: { owner, leaseUntil: new Date(now.getTime() + FEED_LEASE_MS) } },
      { upsert: true }
    );
    return result.matchedCount === 1 || result.upsertedCount === 1;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

async function recordFeedError(db: Db, owner: string, message: string, now: Date): Promise<void> {
  await cronLocksCollection<FeedState>(db).updateOne(
    { _id: FEED_LOCK_ID, owner },
    { $set: { lastError: message, lastErrorAt: now } }
  );
}

type Users = ReturnType<typeof usersCollection<Document>>;

/**
 * Follows a central rename. `username` stays the lowercase sign-in key and
 * `displayName` carries the case. Other collections hold either what was
 * written at the time (logs, tickets) or read the name from this row, so this
 * row is the only write.
 */
async function applyUsernameChange(
  users: Users,
  change: AccountChange,
  _id: ObjectId,
  changedAt: Date
): Promise<ApplyOutcome> {
  const name = normalizeFeedUsername(change.username);
  if (!name) return { error: `seq ${change.seq}: invalid username in feed` };
  const user = await users.findOne({ _id }, { projection: { username: 1, displayName: 1 } });
  if (!user) return "ignored";
  const currentKey = typeof user.username === "string" ? user.username.toLowerCase() : "";
  const currentDisplay = typeof user.displayName === "string" ? user.displayName : "";
  if (currentKey === name.key && currentDisplay === name.display) return "unchanged";

  if (currentKey !== name.key) {
    const taken = await users.findOne(
      { username: name.key, _id: { $ne: _id } },
      { projection: { _id: 1 } }
    );
    if (taken) return { error: `seq ${change.seq}: username already held by another account` };
  }

  const update: Document = { $set: { username: name.key, displayName: name.display } };
  if (currentKey !== name.key && currentKey) {
    update.$push = {
      usernameHistory: { username: currentDisplay || currentKey, changedAt, source: "central" },
    };
  }
  try {
    const result = await users.updateOne({ _id, username: user.username }, update);
    if (result.matchedCount !== 1) return { error: `seq ${change.seq}: account changed, retry` };
  } catch (error) {
    if (isDuplicateKey(error)) {
      return { error: `seq ${change.seq}: username already held by another account` };
    }
    throw error;
  }
  invalidateCachedUser(change.ahdUserId);
  return "applied";
}

export type ApplyOutcome = "applied" | "unchanged" | "ignored" | { error: string };

/** Applies one change. Safe to replay: a repeat leaves the account as it is. */
export async function applyAccountChange(
  db: Db,
  change: AccountChange,
  now: Date
): Promise<ApplyOutcome> {
  const users = usersCollection<Document>(db);
  const _id = new ObjectId(change.ahdUserId);
  const changedAt = change.at > 0 ? new Date(change.at) : now;

  if (change.kind === "username") {
    if (getUsernameMode() !== "central") return "ignored";
    return applyUsernameChange(users, change, _id, changedAt);
  }
  if (change.kind !== "email" && change.kind !== "password") return "ignored";
  if (getAccountFieldsMode() !== "central") return "ignored";

  if (change.kind === "password") {
    const result = await users.updateOne(
      { _id },
      { $unset: { password: "" }, $max: { passwordSupersededAt: changedAt } }
    );
    if (result.matchedCount !== 1) return "ignored";
    invalidateCachedUser(change.ahdUserId);
    return result.modifiedCount === 1 ? "applied" : "unchanged";
  }

  const email = normalizeFeedEmail(change.email);
  if (!email) return { error: `seq ${change.seq}: invalid email in feed` };
  const user = await users.findOne({ _id }, { projection: { email: 1 } });
  if (!user) return "ignored";
  const previous = typeof user.email === "string" ? user.email : "";
  if (previous.trim().toLowerCase() === email) return "unchanged";

  const taken = await users.findOne({ email, _id: { $ne: _id } }, { projection: { _id: 1 } });
  if (taken) return { error: `seq ${change.seq}: email already held by another account` };

  try {
    const update: Document = { $set: { email } };
    if (previous) {
      update.$push = { emailHistory: { email: previous, changedAt, source: "central" } };
    }
    const result = await users.updateOne({ _id, email: user.email }, update);
    if (result.matchedCount !== 1) return { error: `seq ${change.seq}: account changed, retry` };
  } catch (error) {
    if (isDuplicateKey(error)) {
      return { error: `seq ${change.seq}: email already held by another account` };
    }
    throw error;
  }
  invalidateCachedUser(change.ahdUserId);
  return "applied";
}

/**
 * One poll under the lease. Cursor advances only past changes that were
 * applied or deliberately skipped; a guard error is recorded and the feed
 * moves on, a database failure stops the poll without advancing.
 */
export async function pollAccountChanges(deps: PollDeps): Promise<PollResult> {
  const { db, owner } = deps;
  const clock = deps.now ?? (() => new Date());
  const fetchPage = deps.fetchPage ?? defaultFetchPage;
  const locks = cronLocksCollection<FeedState>(db);

  if (!(await acquireLease(db, owner, clock()))) return { status: "busy" };

  const state = await locks.findOne({ _id: FEED_LOCK_ID });
  let cursor = typeof state?.cursor === "number" ? state.cursor : 0;
  let applied = 0;
  let skipped = 0;

  const finish = async (error: string | null): Promise<PollResult> => {
    const now = clock();
    await locks.updateOne(
      { _id: FEED_LOCK_ID, owner },
      {
        $set: {
          lastPollAt: now,
          ...(error ? { lastError: error, lastErrorAt: now } : {}),
        },
      }
    );
    return error ? { status: "error", error } : { status: "ok", applied, skipped, cursor };
  };

  const saveCursor = async (value: number): Promise<boolean> => {
    const result = await locks.updateOne(
      { _id: FEED_LOCK_ID, owner, leaseUntil: { $gt: clock() } },
      { $max: { cursor: value } }
    );
    return result.matchedCount === 1;
  };

  for (let pageNo = 0; pageNo < MAX_PAGES_PER_POLL; pageNo++) {
    const page = await fetchPage(cursor, FEED_PAGE_LIMIT);
    if (!page) return finish("account feed unavailable");

    let reached = cursor;
    for (const change of page.changes) {
      if (change.seq <= cursor) continue;
      let outcome: ApplyOutcome;
      try {
        outcome = await applyAccountChange(db, change, clock());
      } catch (error) {
        const message = `seq ${change.seq}: ${error instanceof Error ? error.name : "error"}`;
        if (reached > cursor && !(await saveCursor(reached))) return finish("lease lost");
        return finish(message);
      }
      if (typeof outcome === "object") {
        await recordFeedError(db, owner, outcome.error, clock());
        skipped++;
      } else if (outcome === "applied") applied++;
      else skipped++;
      reached = change.seq;
    }

    const target = Math.max(reached, page.next);
    if (target > cursor) {
      if (!(await saveCursor(target))) return finish("lease lost");
      cursor = target;
    }
    if (page.changes.length < FEED_PAGE_LIMIT) break;
  }

  return finish(null);
}

export interface AccountFieldsStatus {
  mode: string;
  usernameMode: string;
  usernameChangesLast30Days: number;
  cursor: number;
  lastPollAt: string | null;
  lastError: string | null;
  accountsWithoutLocalPassword: number;
  /** Sign-ins refused fail-closed (central check unavailable, no local password) in the last hour. */
  failClosedLastHour: number;
  /** The same per UTC hour for the last 24 hours, newest first, hours with refusals only. */
  failClosedByHour: { hour: string; count: number }[];
}

async function countRecentUsernameChanges(db: Db, since: Date): Promise<number> {
  const rows = await usersCollection<Document>(db)
    .aggregate<{ n: number }>([
      { $match: { "usernameHistory.changedAt": { $gte: since } } },
      { $unwind: "$usernameHistory" },
      { $match: { "usernameHistory.changedAt": { $gte: since } } },
      { $count: "n" },
    ])
    .toArray();
  return rows[0]?.n ?? 0;
}

export async function getAccountFieldsStatus(db: Db): Promise<AccountFieldsStatus> {
  const state = await cronLocksCollection<FeedState>(db).findOne({ _id: FEED_LOCK_ID });
  const accountsWithoutLocalPassword = await usersCollection<Document>(db).countDocuments({
    passwordSupersededAt: { $exists: true },
  });
  const since = new Date(Date.now() - FORMER_USERNAME_DAYS * 86_400_000);
  const usernameChangesLast30Days = await countRecentUsernameChanges(db, since);
  const failClosed = await countFailClosedRefusals(db, new Date());
  return {
    mode: getAccountFieldsMode(),
    usernameMode: getUsernameMode(),
    usernameChangesLast30Days,
    cursor: typeof state?.cursor === "number" ? state.cursor : 0,
    lastPollAt: state?.lastPollAt ? state.lastPollAt.toISOString() : null,
    lastError: state?.lastError ?? null,
    accountsWithoutLocalPassword,
    failClosedLastHour: failClosed.lastHour,
    failClosedByHour: failClosed.byHour,
  };
}

/**
 * Sign-ins refused because the central check was unavailable and the account has no local password
 * (login audit reason central_unavailable): the last hour, and per hour for the last 24 hours (UTC hour
 * starts, newest first, only hours with refusals). For the opening-day watch.
 */
export async function countFailClosedRefusals(
  db: Db,
  now: Date
): Promise<{ lastHour: number; byHour: { hour: string; count: number }[] }> {
  const col = await getActionAuditLogCollection(db);
  const match = { action: "auth.login", reason: "central_unavailable" };
  const lastHour = await col.countDocuments({
    ...match,
    ts: { $gte: new Date(now.getTime() - 3_600_000) },
  });
  const rows = await col
    .aggregate<{ _id: string; count: number }>([
      { $match: { ...match, ts: { $gte: new Date(now.getTime() - 24 * 3_600_000) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%dT%H:00Z", date: "$ts" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ])
    .toArray();
  return { lastHour, byHour: rows.map((r) => ({ hour: r._id, count: r.count })) };
}

declare global {
  var __ahdAccountFieldsConsumer: ReturnType<typeof setInterval> | undefined;
}

/** Starts the poller in the web process. Inert unless a mode is central and the bridge is set up. */
export function startAccountFieldsConsumer(): boolean {
  const following = getAccountFieldsMode() === "central" || getUsernameMode() === "central";
  if (!following || !isBridgeConfigured()) return false;
  if (globalThis.__ahdAccountFieldsConsumer) return false;

  const owner = `web-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  let running = false;
  let failures = 0;
  let skipUntil = 0;

  const tick = async (): Promise<void> => {
    if (running || Date.now() < skipUntil) return;
    running = true;
    try {
      const result = await pollAccountChanges({ db: await getDb(), owner });
      if (result.status === "error") throw new Error(result.error);
      failures = 0;
    } catch (error) {
      failures++;
      const wait = Math.min(MAX_BACKOFF_MS, FEED_POLL_MS * 2 ** Math.min(failures, 5));
      skipUntil = Date.now() + wait;
      logger.warn("account-fields", "poll failed", {
        failures,
        retryInSeconds: Math.round(wait / 1000),
        reason: error instanceof Error ? error.message : "unknown error",
      });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), FEED_POLL_MS);
  timer.unref?.();
  globalThis.__ahdAccountFieldsConsumer = timer;
  void tick();
  return true;
}
