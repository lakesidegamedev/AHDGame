import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import type { IndexFund } from "@/lib/db/types";
import {
  NPP_ARCHETYPE_TARGET_FUND_SHARE,
  NPP_FUND_REDEMPTION_MAX_FRACTION_PER_TURN,
  nppTargetFundShare,
  planNppFundRedemptions,
  processNppFundRedemptions,
} from "./nppRedemption";

const FUND_ID = new ObjectId();
const NPP_ID = new ObjectId();

function fund(id: ObjectId = FUND_ID): IndexFund {
  return {
    _id: id,
    slug: "test-fund",
    name: "Test Fund",
    tickerSymbol: "TF",
    scope: "country",
    kind: "broad",
    countryId: "US",
    anchorCurrencyCode: "USD",
    status: "active",
    quotedNav: 100,
    unitSupply: 1_000_000,
    reserveUnits: 0,
    cashAnchor: 0,
    targetConstituents: [],
    holdings: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("planNppFundRedemptions — pure rules", () => {
  it("returns nothing when the NPP holds no positions", () => {
    expect(
      planNppFundRedemptions({ archetype: "conservative", cashAnchor: 0, positions: [] })
    ).toEqual([]);
  });

  it("returns nothing when the fund share is at or below the archetype target", () => {
    // conservative target 0.55; realized share 1000/(1000+1000) = 0.5 < 0.55.
    const plan = planNppFundRedemptions({
      archetype: "conservative",
      cashAnchor: 1000,
      positions: [{ fundId: FUND_ID, units: 10, quotedNav: 100 }],
    });
    expect(plan).toEqual([]);
  });

  it("caps a single position at the per-turn fraction", () => {
    // 20 units, 10% fraction cap => at most 2 units this turn even though the
    // overweight value is far larger.
    const plan = planNppFundRedemptions({
      archetype: "conservative",
      cashAnchor: 0,
      positions: [{ fundId: FUND_ID, units: 20, quotedNav: 100 }],
    });
    expect(plan).toEqual([{ fundId: FUND_ID, units: 2 }]);
  });

  it("never plans more units than the position holds", () => {
    for (const units of [1, 5, 9, 10, 11, 100]) {
      const plan = planNppFundRedemptions({
        archetype: "aggressive",
        cashAnchor: 0,
        positions: [{ fundId: FUND_ID, units, quotedNav: 1 }],
      });
      const total = plan.reduce((sum, i) => sum + i.units, 0);
      expect(total).toBeLessThanOrEqual(units);
    }
  });

  it("decays deterministically regardless of the input ordering", () => {
    const fundA = new ObjectId();
    const fundB = new ObjectId();
    const positions = [
      { fundId: fundA, units: 30, quotedNav: 100 },
      { fundId: fundB, units: 10, quotedNav: 100 },
    ];
    const forward = planNppFundRedemptions({
      archetype: "conservative",
      cashAnchor: 0,
      positions,
    });
    const reversed = planNppFundRedemptions({
      archetype: "conservative",
      cashAnchor: 0,
      positions: [...positions].reverse(),
    });
    expect(forward).toEqual(reversed);
    // Largest position first, capped at 10% each.
    expect(forward).toEqual([
      { fundId: fundA, units: 3 },
      { fundId: fundB, units: 1 },
    ]);
  });

  it("is strictly bounded per turn by the fraction constant", () => {
    const plan = planNppFundRedemptions({
      archetype: "aggressive",
      cashAnchor: 0,
      positions: [{ fundId: FUND_ID, units: 1000, quotedNav: 1 }],
    });
    const total = plan.reduce((sum, i) => sum + i.units, 0);
    expect(total).toBeLessThanOrEqual(Math.floor(1000 * NPP_FUND_REDEMPTION_MAX_FRACTION_PER_TURN));
  });

  it("ignores non-finite or non-positive position inputs", () => {
    expect(
      planNppFundRedemptions({
        archetype: "conservative",
        cashAnchor: 0,
        positions: [
          { fundId: FUND_ID, units: Number.NaN, quotedNav: 100 },
          { fundId: new ObjectId(), units: 10, quotedNav: 0 },
        ],
      })
    ).toEqual([]);
  });

  it("exposes a monotonic target share per archetype", () => {
    expect(nppTargetFundShare("conservative")).toBeLessThan(nppTargetFundShare("moderate"));
    expect(nppTargetFundShare("moderate")).toBeLessThan(nppTargetFundShare("aggressive"));
    for (const share of Object.values(NPP_ARCHETYPE_TARGET_FUND_SHARE)) {
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThan(1);
    }
  });
});

describe("processNppFundRedemptions", () => {
  function world(enabled?: boolean, units = 20) {
    const { db, memory } = createTransactionalMemoryDb();
    memory.seed("gameState", [{ _id: "current", currentTurn: 8 }]);
    memory.seed("gameConfig", [{ _id: "default", nppFundRedemptionEnabled: enabled }]);
    memory.seed("indexFunds", [fund() as unknown as Record<string, unknown>]);
    memory.seed("indexFundPositions", [
      { _id: new ObjectId(), fundId: FUND_ID, holderKind: "npp", nppId: NPP_ID, units },
    ]);
    memory.seed("npps", [{ _id: NPP_ID, nppInvestmentCashAnchor: 0 }]);
    const options = {
      currentTurn: 8,
      activeFunds: [fund()],
      archetypesByNppId: new Map([[String(NPP_ID), "conservative" as const]]),
    };
    return { db, memory, options };
  }
  it.each([undefined, false])("does no writes when disabled: %s", async (enabled) => {
    const { db, memory, options } = world(enabled);
    expect(await processNppFundRedemptions(db, options)).toEqual({
      redemptionsQueued: 0,
      unitsRedeemed: 0,
      errors: [],
    });
    expect(memory.collection("bankMoneyMoves").docs).toHaveLength(0);
    expect(memory.collection("indexFundRedemptionQueue").docs).toHaveLength(0);
  });
  it("queues a bounded claim once across concurrent turn retries", async () => {
    const { db, memory, options } = world(true);
    await Promise.all([
      processNppFundRedemptions(db, options),
      processNppFundRedemptions(db, options),
    ]);
    expect(memory.collection("indexFundRedemptionQueue").docs).toHaveLength(1);
    expect(memory.collection("indexFundRedemptionQueue").docs[0]).toMatchObject({
      units: 2,
      requestedNavAnchor: 100,
      requestedAmountAnchor: 200,
      unitsBurnedAtRequest: true,
    });
    expect(memory.collection("indexFundPositions").docs[0].units).toBe(18);
    expect(memory.collection("indexFunds").docs[0].unitSupply).toBe(999998);
  });
  it("retains the claim if queue publication is interrupted, then retries once", async () => {
    const { db, memory, options } = world(true);
    const fault = withInjectedCrash(memory, {
      collection: "indexFundRedemptionQueue",
      op: "insertMany",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: db.client });
    const failed = await processNppFundRedemptions(fault.db, options);
    expect(failed.errors.length).toBeGreaterThan(0);
    expect(memory.collection("indexFundPositions").docs[0].units).toBe(20);
    expect(memory.collection("indexFunds").docs[0].unitSupply).toBe(1000000);
    expect(memory.collection("indexFundRedemptionQueue").docs).toHaveLength(0);
    fault.disarm();
    await processNppFundRedemptions(db, options);
    expect(memory.collection("indexFundRedemptionQueue").docs).toHaveLength(1);
  });
  it("keeps a sub-unit position untouched", async () => {
    const { db, memory, options } = world(true, 1);
    expect((await processNppFundRedemptions(db, options)).redemptionsQueued).toBe(0);
    expect(memory.collection("indexFundPositions").docs[0].units).toBe(1);
  });
});
