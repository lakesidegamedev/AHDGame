import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { officeActionPool } from "./actionPool";
import { RESET_V2_SEED_REVISION } from "@/lib/resetVersions/rules";
import type { UnifiedCabinetMember } from "@/lib/db/types/unifiedCabinetMember";

const holder = new ObjectId();
const actorId = holder.toString();

type Row = Record<string, unknown>;
const get = (obj: Row, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o as Row | undefined)?.[k], obj);

/** Tiny fake of resetCabinetActionStates covering the filters the helper uses. */
function fakeDb(doc: Row | null) {
  const legacy = { updateOne: () => Promise.reject(new Error("legacy row touched")) };
  const matches = (filter: Row) =>
    doc != null &&
    Object.entries(filter).every(([k, v]) => {
      const actual = get(doc, k);
      if (v && typeof v === "object") {
        const op = v as Row;
        if ("$exists" in op) return (actual !== undefined) === op.$exists;
        if ("$lt" in op) return typeof actual === "number" && actual < (op.$lt as number);
      }
      return actual === v;
    });
  const states = {
    findOne: async () => doc,
    updateOne: async (filter: Row, update: Row) => {
      if (!matches(filter)) return { matchedCount: 0 };
      const actors = doc!.actorStates as Row;
      for (const [k, v] of Object.entries((update.$set ?? {}) as Row))
        actors[k.replace("actorStates.", "")] = v;
      for (const [k, v] of Object.entries((update.$inc ?? {}) as Row)) {
        const a = k.replace("actorStates.", "").replace(".charges", "");
        (actors[a] as Row).charges = ((actors[a] as Row).charges as number) + (v as number);
      }
      return { matchedCount: 1 };
    },
  };
  return {
    collection: (name: string) => (name === "resetCabinetActionStates" ? states : legacy),
  } as unknown as Db;
}

const v2State = (actorStates: Row = {}) => ({
  _id: "US",
  worldId: "w1",
  sourceTurn: 10,
  actorStates,
});
const receipt = (system: "metrics" | "cabinet") => ({
  worldId: "w1",
  revision: RESET_V2_SEED_REVISION[system],
  sourceTurn: 10,
  completedAt: "2026-11-09T00:00:00Z",
  verificationHash: "h",
  countries: ["US"],
});
const v2Game = (turn = 10) =>
  ({
    currentTurn: turn,
    resetWorldId: "w1",
    metricsSystemVersion: "v2",
    cabinetSystemVersion: "v2",
    resetVersionSeeds: { metrics: receipt("metrics"), cabinet: receipt("cabinet") },
  }) as never;
const member = {
  _id: new ObjectId(),
  characterId: holder,
  ministerialActions: 1,
  lastMinisterialActionResetDay: "2026-11-09",
} as unknown as UnifiedCabinetMember;

describe("officeActionPool on Cabinet v2", () => {
  it("spends one v2 charge and never touches the legacy row", async () => {
    const doc = v2State({ [actorId]: { charges: 4, lastRechargeTurn: 10 } });
    const pool = officeActionPool(fakeDb(doc), v2Game(), "US", member);
    expect(await pool.remaining()).toBe(4);
    expect(await pool.spend()).toEqual({ ok: true, remaining: 3 });
    expect((doc.actorStates as Row)[actorId]).toEqual({ charges: 3, lastRechargeTurn: 10 });
  });

  it("starts a new actor at four charges", async () => {
    const doc = v2State();
    const pool = officeActionPool(fakeDb(doc), v2Game(), "US", member);
    expect(await pool.spend()).toEqual({ ok: true, remaining: 3 });
  });

  it("refuses when the v2 pool is empty", async () => {
    const doc = v2State({ [actorId]: { charges: 0, lastRechargeTurn: 10 } });
    const pool = officeActionPool(fakeDb(doc), v2Game(), "US", member);
    expect(await pool.remaining()).toBe(0);
    expect(await pool.spend()).toEqual({ ok: false, remaining: 0 });
  });

  it("recharges before spending", async () => {
    const doc = v2State({ [actorId]: { charges: 0, lastRechargeTurn: 10 } });
    const pool = officeActionPool(fakeDb(doc), v2Game(34), "US", member);
    expect(await pool.remaining()).toBe(1);
    expect(await pool.spend()).toEqual({ ok: true, remaining: 0 });
    expect((doc.actorStates as Row)[actorId]).toEqual({ charges: 0, lastRechargeTurn: 34 });
  });

  it("refund restores the charge, capped at four", async () => {
    const doc = v2State({ [actorId]: { charges: 4, lastRechargeTurn: 10 } });
    const pool = officeActionPool(fakeDb(doc), v2Game(), "US", member);
    await pool.spend();
    await pool.refund();
    expect(((doc.actorStates as Row)[actorId] as Row).charges).toBe(4);
    await pool.refund();
    expect(((doc.actorStates as Row)[actorId] as Row).charges).toBe(4);
  });

  it("a lost race returns ok:false", async () => {
    const doc = v2State({ [actorId]: { charges: 1, lastRechargeTurn: 10 } });
    const db = fakeDb(doc);
    const pool = officeActionPool(db, v2Game(), "US", member);
    const states = db.collection("resetCabinetActionStates") as unknown as {
      updateOne: (f: Row, u: Row) => Promise<unknown>;
    };
    const real = states.updateOne;
    states.updateOne = async (f, u) => {
      (doc.actorStates as Row)[actorId] = { charges: 0, lastRechargeTurn: 10 };
      return real(f, u);
    };
    expect((await pool.spend()).ok).toBe(false);
  });
});

describe("officeActionPool on legacy countries", () => {
  it("uses the legacy row when Cabinet v2 is off", async () => {
    const calls: Row[] = [];
    const db = {
      collection: () => ({
        updateOne: async (f: Row, u: Row) => {
          calls.push({ f, u });
          return { modifiedCount: 1 };
        },
      }),
    } as unknown as Db;
    const pool = officeActionPool(db, { currentTurn: 10 } as never, "US", member);
    expect(await pool.remaining()).toBe(1);
    expect(await pool.spend()).toEqual({ ok: true, remaining: 0 });
    expect(calls[0]!.u).toEqual({ $inc: { ministerialActions: -1 } });
  });
});
