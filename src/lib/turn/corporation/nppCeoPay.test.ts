import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Corporation, CorporationCeoPay } from "@/lib/db/types";
import type { NPP } from "@/lib/db/types/npp";
import type { CorporationLookups } from "./types";
import {
  CEO_PAY_DEMAND_OPEN_TURNS,
  CEO_PAY_REVIEW_TURNS,
} from "@/lib/corporations/rules/nppCeoCareer";
import { processNppCeoPay } from "./nppCeoPay";

/**
 * The turn pass seats replacements through corporations/caretakerCeo. The pick
 * is mocked to a fixed free NPP so the replacement path is deterministic, and
 * the lane is fixed so levels come from the NPP's record in that lane.
 */
const { NEW_CEO_ID } = vi.hoisted(() => ({ NEW_CEO_ID: "64b0000000000000000000aa" }));

vi.mock("@/lib/corporations/caretakerCeo", () => ({
  corporationLane: () => "technology",
  gatherCaretakerAffiliations: async () => [
    {
      party: "independent",
      corpCount: 0,
      freeNpps: [{ id: NEW_CEO_ID, influence: 40, seq: 1 }],
    },
  ],
  pickCaretakerNpp: () => NEW_CEO_ID,
}));

/** One corporation write as the pass emitted it, read loosely in assertions. */
interface WrittenOp {
  updateOne?: {
    filter?: { _id?: ObjectId };
    update?: {
      $set?: Record<string, unknown>;
      $push?: Record<string, unknown>;
    };
  };
}

interface FakeWorld {
  /** One row per corporation for the trailing-result aggregate. */
  trailing?: Map<string, { revenue: number; profit: number; priorProfit: number }>;
  npps?: Array<Pick<NPP, "_id" | "ceoTrackRecord" | "personality">>;
}

interface FakeDb {
  db: Db;
  /** Every corporation write the pass emitted, in order. */
  ops: WrittenOp[];
  reads: { npps: number; corporationHistory: number };
  writes: number;
}

function fakeDb(world: FakeWorld = {}): FakeDb {
  const ops: WrittenOp[] = [];
  const reads = { npps: 0, corporationHistory: 0 };
  let writes = 0;

  const collection = (name: string) => {
    if (name === "npps") {
      return {
        find: () => {
          reads.npps++;
          return { project: () => ({ toArray: async () => world.npps ?? [] }) };
        },
      };
    }
    if (name === "corporationHistory") {
      return {
        aggregate: () => {
          reads.corporationHistory++;
          const rows = [...(world.trailing ?? new Map())].map(([id, row]) => ({
            _id: new ObjectId(id),
            ...row,
          }));
          return { toArray: async () => rows };
        },
      };
    }
    return {
      bulkWrite: async (batch: WrittenOp[]) => {
        writes++;
        ops.push(...batch);
        return {};
      },
    };
  };

  return {
    db: { collection } as unknown as Db,
    ops,
    reads,
    get writes() {
      return writes;
    },
  };
}

function npp(id: ObjectId): Pick<NPP, "_id" | "ceoTrackRecord" | "personality"> {
  return {
    _id: id,
    ceoTrackRecord: { technology: { turns: 96, relMarginPp: 2, lastTurn: 96 } },
    personality: { ambition: 60, loyalty: 40, stubbornness: 50 },
  } as Pick<NPP, "_id" | "ceoTrackRecord" | "personality">;
}

function corp(overrides: Partial<Corporation> = {}): Corporation {
  return {
    _id: new ObjectId(),
    name: "Test Corp",
    type: "technology",
    countryId: "US",
    ceoType: "npp",
    ceoId: new ObjectId(),
    ceoSalary: 0,
    ...overrides,
  } as Corporation;
}

function lookups(
  corporations: Corporation[]
): Pick<CorporationLookups, "corporations" | "sectorsByCorp"> {
  return { corporations, sectorsByCorp: new Map() };
}

const START_TURN = 100;

describe("processNppCeoPay", () => {
  it("does nothing before the feature has started", async () => {
    const target = corp();
    const world = fakeDb();

    const result = await processNppCeoPay(world.db, lookups([target]), START_TURN, undefined);

    expect(result).toEqual({ initialised: 0, demands: 0, autoAccepted: 0, replaced: 0 });
    expect(world.ops).toHaveLength(0);
    expect(world.writes).toBe(0);
    expect(world.reads).toEqual({ npps: 0, corporationHistory: 0 });
  });

  it("starts the pay schedule the first time it sees an NPP-run corporation", async () => {
    const target = corp();
    const world = fakeDb();

    const result = await processNppCeoPay(world.db, lookups([target]), START_TURN, START_TURN);

    expect(result.initialised).toBe(1);
    expect(world.ops).toHaveLength(1);
    const pay = world.ops[0].updateOne!.update!.$set!.ceoPay as CorporationCeoPay;
    expect(pay.ceoId).toBe(target.ceoId!.toString());
    expect(pay.nextReviewTurn).toBeGreaterThanOrEqual(START_TURN + CEO_PAY_REVIEW_TURNS);
    expect(pay.demand).toBeUndefined();
    // A first sighting reads nothing: there is nothing to price yet.
    expect(world.reads).toEqual({ npps: 0, corporationHistory: 0 });
  });

  it("opens a pay demand at a due review for a profitable corporation", async () => {
    const ceoId = new ObjectId();
    const target = corp({
      ceoId,
      ceoPay: { ceoId: ceoId.toString(), appointedTurn: 76, nextReviewTurn: 100 },
    });
    const world = fakeDb({
      trailing: new Map([
        [target._id.toString(), { revenue: 1_000_000, profit: 200_000, priorProfit: 150_000 }],
      ]),
      npps: [npp(ceoId)],
    });

    const result = await processNppCeoPay(world.db, lookups([target]), START_TURN, START_TURN);

    expect(result.demands).toBe(1);
    expect(world.ops).toHaveLength(1);
    const demand = world.ops[0].updateOne!.update!.$set!["ceoPay.demand"] as {
      amount: number;
      expiresTurn: number;
    };
    expect(demand.amount).toBeGreaterThan(0);
    expect(demand.expiresTurn).toBe(START_TURN + CEO_PAY_DEMAND_OPEN_TURNS);
  });

  it("accepts an expired demand that stays under the policy share of profit", async () => {
    const ceoId = new ObjectId();
    const target = corp({
      ceoId,
      ceoPay: {
        ceoId: ceoId.toString(),
        appointedTurn: 76,
        nextReviewTurn: 100,
        demand: {
          amount: 5_000,
          turn: 90,
          expiresTurn: 100,
          level: 3,
          trailingProfit: 200_000,
        },
      },
    });
    const world = fakeDb({
      trailing: new Map([
        [target._id.toString(), { revenue: 1_000_000, profit: 200_000, priorProfit: 150_000 }],
      ]),
      npps: [npp(ceoId)],
    });

    const result = await processNppCeoPay(world.db, lookups([target]), START_TURN, START_TURN);

    expect(result.autoAccepted).toBe(1);
    const set = world.ops[0].updateOne!.update!.$set!;
    expect(set.ceoSalary).toBe(5_000);
    const pay = set.ceoPay as CorporationCeoPay;
    expect(pay.demand).toBeUndefined();
    expect(pay.lastDecision).toMatchObject({ outcome: "accepted", bySystem: true });
  });

  it("replaces the CEO for an expired demand above the policy share", async () => {
    const ceoId = new ObjectId();
    const target = corp({
      ceoId,
      operatorPolicy: { ceoPayAutoAcceptShare: 0.03, setTurn: 90 },
      ceoPay: {
        ceoId: ceoId.toString(),
        appointedTurn: 76,
        nextReviewTurn: 100,
        demand: {
          amount: 50_000,
          turn: 90,
          expiresTurn: 100,
          level: 3,
          trailingProfit: 200_000,
        },
      },
    });
    const world = fakeDb({
      trailing: new Map([
        [target._id.toString(), { revenue: 1_000_000, profit: 200_000, priorProfit: 150_000 }],
      ]),
      npps: [npp(ceoId)],
    });

    const result = await processNppCeoPay(world.db, lookups([target]), START_TURN, START_TURN);

    expect(result.replaced).toBe(1);
    expect(result.autoAccepted).toBe(0);
    const seated = world.ops.find((op) => op.updateOne?.update?.$set?.ceoId != null);
    expect(seated).toBeDefined();
    expect(seated!.updateOne!.update!.$set!.ceoId).toEqual(new ObjectId(NEW_CEO_ID));
    const appended = world.ops.some((op) => op.updateOne?.update?.$push?.ceoHistory != null);
    expect(appended).toBe(true);
  });

  it("ignores a state-owned corporation", async () => {
    const target = corp({ countryOwnerId: "US" });
    const world = fakeDb();

    const result = await processNppCeoPay(world.db, lookups([target]), START_TURN, START_TURN);

    expect(result).toEqual({ initialised: 0, demands: 0, autoAccepted: 0, replaced: 0 });
    expect(world.ops).toHaveLength(0);
    expect(world.writes).toBe(0);
  });
});
