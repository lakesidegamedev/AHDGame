import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import {
  closeOrphanedTurnRequest,
  getTurnWorkerStatus,
  inProcessTurnRefusal,
  isTurnWorkerOnline,
  markTurnWorkerProcess,
  recordTurnWorkerHeartbeat,
  requestTurns,
  runTurnRequestTick,
  TURN_WORKER_HEARTBEAT_STALE_MS,
} from "./turnWorkerHandoff";
import { queueAdminTurns } from "./queueAdminTurns";

// Minimal in-memory collection: only the operators the hand-off uses.
type Doc = Record<string, unknown>;
const get = (doc: Doc, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (v, k) => (v == null || typeof v !== "object" ? undefined : (v as Doc)[k]),
      doc
    );
function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Doc[]).some((c) => matches(doc, c));
    const value = get(doc, key);
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Doc;
      if ("$ne" in c) return (value ?? null) !== c.$ne;
      if ("$exists" in c) return (value !== undefined) === c.$exists;
    }
    if (cond === null) return value == null;
    return value instanceof Date && cond instanceof Date
      ? value.getTime() === cond.getTime()
      : value === cond;
  });
}
function setPath(doc: Doc, path: string, value: unknown) {
  const keys = path.split(".");
  let target = doc;
  for (const k of keys.slice(0, -1)) target = (target[k] ??= {}) as Doc;
  target[keys.at(-1)!] = value;
}
function fakeDb(seed: Record<string, Doc[]> = {}) {
  const data: Record<string, Doc[]> = { turnWorkerControl: [], gameState: [], ...seed };
  const collection = (name: string) => {
    const rows = (data[name] ??= []);
    return {
      findOne: async (filter: Doc) => {
        const found = rows.find((d) => matches(d, filter));
        return found ? structuredClone(found) : null;
      },
      updateOne: async (filter: Doc, update: { $set: Doc }, opts?: { upsert?: boolean }) => {
        let doc = rows.find((d) => matches(d, filter));
        if (!doc && opts?.upsert) rows.push((doc = { _id: filter._id }));
        if (!doc) return { matchedCount: 0, modifiedCount: 0 };
        for (const [k, v] of Object.entries(update.$set)) setPath(doc, k, v);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOneAndUpdate: async (filter: Doc, update: { $set: Doc }) => {
        const doc = rows.find((d) => matches(d, filter));
        if (!doc) return null;
        for (const [k, v] of Object.entries(update.$set)) setPath(doc, k, v);
        return structuredClone(doc);
      },
    };
  };
  return { db: { collection } as unknown as Db, data };
}

const T0 = new Date("2026-10-22T18:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("inProcessTurnRefusal", () => {
  it("refuses a turn inside the web server when the worker owns turns", () => {
    expect(inProcessTurnRefusal({ CRON_OWNER: "worker", NEXT_RUNTIME: "nodejs" })).toMatch(
      /turn worker/
    );
  });
  it("lets the turn worker itself run turns", () => {
    const env: Record<string, string | undefined> = { CRON_OWNER: "worker" };
    markTurnWorkerProcess(env);
    expect(inProcessTurnRefusal({ ...env, NEXT_RUNTIME: "nodejs" })).toBeNull();
  });
  it("lets scripts and repair tooling run turns (no Next runtime)", () => {
    expect(inProcessTurnRefusal({ CRON_OWNER: "worker" })).toBeNull();
  });
  it("changes nothing where web still owns turns", () => {
    expect(inProcessTurnRefusal({ NEXT_RUNTIME: "nodejs" })).toBeNull();
  });
});

describe("worker heartbeat", () => {
  it("is online within the stale window and offline after it", () => {
    expect(isTurnWorkerOnline(T0, at(TURN_WORKER_HEARTBEAT_STALE_MS))).toBe(true);
    expect(isTurnWorkerOnline(T0, at(TURN_WORKER_HEARTBEAT_STALE_MS + 1))).toBe(false);
    expect(isTurnWorkerOnline(null, T0)).toBe(false);
  });
});

describe("turn requests", () => {
  it("allows one open request at a time", async () => {
    const { db } = fakeDb();
    await recordTurnWorkerHeartbeat(db, { now: T0, startedAt: T0, build: "abc" });
    const first = await requestTurns(db, { count: 2, requestedBy: "admin", now: T0 });
    expect(first.ok).toBe(true);
    const second = await requestTurns(db, { count: 1, requestedBy: "admin", now: T0 });
    expect(second).toMatchObject({ ok: false, request: { count: 2 } });
  });

  it("claims and runs every queued turn in order, then closes the request", async () => {
    const { db } = fakeDb();
    await recordTurnWorkerHeartbeat(db, { now: T0, startedAt: T0, build: "abc" });
    await requestTurns(db, { count: 3, requestedBy: "admin", now: T0 });
    let turn = 371;
    const processTurn = vi.fn(async () => ({ success: true, turn: ++turn, message: "ok" }));
    const done = await runTurnRequestTick({
      db,
      processTurn,
      startedAt: T0,
      build: "abc",
      now: () => T0,
    });
    expect(processTurn).toHaveBeenCalledTimes(3);
    expect(done).toMatchObject({ outcome: "succeeded", completed: 3 });
    expect((await getTurnWorkerStatus(db, T0)).request).toMatchObject({
      completed: 3,
      outcome: "succeeded",
    });
    // Closed, so a new request is accepted.
    expect((await requestTurns(db, { count: 1, requestedBy: "admin", now: T0 })).ok).toBe(true);
  });

  it("stops at the first turn that does not advance and records why", async () => {
    const { db } = fakeDb();
    await recordTurnWorkerHeartbeat(db, { now: T0, startedAt: T0, build: null });
    await requestTurns(db, { count: 3, requestedBy: "admin", now: T0 });
    const processTurn = vi
      .fn()
      .mockResolvedValueOnce({ success: true, turn: 372, message: "ok" })
      .mockResolvedValueOnce({ success: false, turn: 0, message: "Repair required" });
    const done = await runTurnRequestTick({
      db,
      processTurn,
      startedAt: T0,
      build: null,
      now: () => T0,
    });
    expect(processTurn).toHaveBeenCalledTimes(2);
    expect(done).toMatchObject({ outcome: "failed", completed: 1 });
    expect(done?.message).toMatch(/Turn 2 of 3 did not run: Repair required/);
  });

  it("leaves the request queued while a scheduled turn holds a live lock", async () => {
    const { db } = fakeDb({
      gameState: [{ _id: "current", isProcessing: true, processingHeartbeatAt: at(-10_000) }],
    });
    await recordTurnWorkerHeartbeat(db, { now: T0, startedAt: T0, build: null });
    await requestTurns(db, { count: 1, requestedBy: "admin", now: T0 });
    const processTurn = vi.fn();
    expect(
      await runTurnRequestTick({ db, processTurn, startedAt: T0, build: null, now: () => T0 })
    ).toBeNull();
    expect(processTurn).not.toHaveBeenCalled();
    expect((await getTurnWorkerStatus(db, T0)).request?.claimedAt).toBeNull();
  });

  it("does not wait on a stale lock; processTurn's recovery takes it over", async () => {
    const { db } = fakeDb({
      gameState: [
        {
          _id: "current",
          isProcessing: true,
          processingHeartbeatAt: at(-TURN_WORKER_HEARTBEAT_STALE_MS - 1),
        },
      ],
    });
    await recordTurnWorkerHeartbeat(db, { now: T0, startedAt: T0, build: null });
    await requestTurns(db, { count: 1, requestedBy: "admin", now: T0 });
    const processTurn = vi.fn(async () => ({ success: true, turn: 372, message: "ok" }));
    await runTurnRequestTick({ db, processTurn, startedAt: T0, build: null, now: () => T0 });
    expect(processTurn).toHaveBeenCalledTimes(1);
  });

  it("closes a request a dead worker had claimed", async () => {
    const { db } = fakeDb();
    await recordTurnWorkerHeartbeat(db, { now: T0, startedAt: T0, build: null });
    await requestTurns(db, { count: 1, requestedBy: "admin", now: T0 });
    // The worker claims, then "dies" mid-turn: the turn never returns.
    void runTurnRequestTick({
      db,
      processTurn: () => new Promise(() => {}),
      startedAt: T0,
      build: null,
      now: () => T0,
    });
    await vi.waitFor(async () =>
      expect((await getTurnWorkerStatus(db, T0)).request?.claimedAt).not.toBeNull()
    );
    expect(await closeOrphanedTurnRequest(db, at(1000))).toBe(true);
    expect((await getTurnWorkerStatus(db, at(1000))).request).toMatchObject({ outcome: "failed" });
  });
});

describe("queueAdminTurns", () => {
  it("refuses loudly when no worker is alive instead of queueing", async () => {
    const { db } = fakeDb();
    const res = await queueAdminTurns(db, { count: 1, requestedBy: "admin", now: T0 });
    expect(res.status).toBe(503);
    expect((await getTurnWorkerStatus(db, T0)).request).toBeNull();
  });

  it("queues for a live worker and returns 202", async () => {
    const { db } = fakeDb();
    await recordTurnWorkerHeartbeat(db, { now: T0, startedAt: T0, build: null });
    const res = await queueAdminTurns(db, { count: 2, requestedBy: "admin", now: at(1000) });
    expect(res.status).toBe(202);
    expect((await res.json()).request).toMatchObject({ count: 2, requestedBy: "admin" });
  });

  it("treats a worker busy in a turn as alive even when its heartbeat lags", async () => {
    const { db } = fakeDb({
      gameState: [{ _id: "current", isProcessing: true, processingHeartbeatAt: at(-5000) }],
    });
    await recordTurnWorkerHeartbeat(db, { now: at(-10 * 60_000), startedAt: T0, build: null });
    const res = await queueAdminTurns(db, { count: 1, requestedBy: "admin", now: T0 });
    expect(res.status).toBe(202);
  });

  it("returns the open request instead of queueing a second one", async () => {
    const { db } = fakeDb();
    await recordTurnWorkerHeartbeat(db, { now: T0, startedAt: T0, build: null });
    await requestTurns(db, { count: 1, requestedBy: "admin", now: T0 });
    const res = await queueAdminTurns(db, { count: 1, requestedBy: "other", now: T0 });
    expect(res.status).toBe(409);
  });
});
