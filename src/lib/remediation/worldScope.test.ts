import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { makeStrictInMemoryStore } from "@/lib/test-utils/inMemoryStore";
import { runApply, runDetect, runPlan } from "./runner";
import { defectStatus } from "./status";
import type { Defect } from "./types";

type Widget = { _id: string } & Record<string, unknown>;

const CUTOFF = "2026-11-12T00:00:00.000Z";
const OLD_WORLD = ObjectId.createFromTime(Date.parse("2026-07-19T00:00:00Z") / 1000).toHexString();
const NEW_WORLD = ObjectId.createFromTime(Date.parse("2026-11-12T19:16:45Z") / 1000).toHexString();

function oldWorldDefect(): Defect {
  return {
    id: "AHD-pinned-restitution",
    title: "pinned old-world rows",
    severity: "P1",
    envs: ["sandbox", "prod"],
    worldsStartedBefore: CUTOFF,
    idempotent: true,
    seedFix: { status: "not-needed", note: "test fixture" },
    guards: ["turn-lock-free", "max-affected:10"],
    detect: async (db) => {
      const owed = await db.collection<Widget>("owed").find({}).toArray();
      return { affected: owed.length, sample: owed };
    },
    plan: async (db) => {
      const owed = await db.collection<Widget>("owed").find({}).toArray();
      return {
        affected: owed.length,
        touched: [{ collection: "owed", ids: owed.map((row) => row._id) }],
        moneyDelta: 0,
        summary: `settle ${owed.length} row(s)`,
      };
    },
    apply: async (db) => {
      const res = await db.collection<Widget>("owed").deleteMany({});
      return { documentsDeleted: res.deletedCount };
    },
    verify: async (db) => {
      const remaining = await db.collection<Widget>("owed").countDocuments({});
      return { ok: remaining === 0, remaining, notes: [] };
    },
  };
}

function world(worldEpochId?: string) {
  return makeStrictInMemoryStore({
    gameState: [
      { _id: "current", isActive: true, currentTurn: 1, isProcessing: false, worldEpochId },
    ],
    owed: [{ _id: "leg1", amount: 71_110_000 }],
  });
}

describe("worldsStartedBefore", () => {
  it("reports nothing to heal and withholds a token in a later world", async () => {
    const { db, cols } = world(NEW_WORLD);
    const detect = await runDetect(db, oldWorldDefect(), { env: "prod" });
    expect(detect.affected).toBe(0);
    expect(detect.notes?.[0]).toContain("applies only to worlds started before");

    const plan = await runPlan(db, oldWorldDefect(), { env: "prod", operator: "tester" });
    expect(plan.token).toBeNull();
    expect(plan.tokenWithheld).toContain("applies only to worlds started before");
    expect(cols.owed).toHaveLength(1);
  });

  it("refuses to apply in a later world even with a token from the old one", async () => {
    const store = world(OLD_WORLD);
    const plan = await runPlan(store.db, oldWorldDefect(), { env: "prod", operator: "tester" });
    expect(plan.token).not.toBeNull();

    const state = store.cols.gameState[0] as { worldEpochId?: string };
    state.worldEpochId = NEW_WORLD;
    const outcome = await runApply(store.db, oldWorldDefect(), {
      env: "prod",
      tokenId: plan.token!.id,
      operator: "tester",
      confirmProd: true,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.refusal).toContain("applies only to worlds started before");
    expect(store.cols.owed).toHaveLength(1);
  });

  it("still detects in the old world and in a world with no recorded epoch", async () => {
    for (const epoch of [OLD_WORLD, undefined]) {
      const { db } = world(epoch);
      expect((await runDetect(db, oldWorldDefect(), { env: "prod" })).affected).toBe(1);
    }
  });

  it("shows the defect clean in the env matrix for a later world", async () => {
    const { db } = world(NEW_WORLD);
    const status = await defectStatus(oldWorldDefect(), ["prod"], async () => db);
    expect(status.envs[0]).toMatchObject({ affected: 0, state: "clean" });
  });
});
