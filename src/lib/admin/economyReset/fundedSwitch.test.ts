import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { applyFundedSwitch, fundedSwitchGameConfigUpdate } from "./fundedSwitch";

/** String-keyed singleton and fixture documents. */
type Doc = { _id: string; [key: string]: unknown };

const EPOCH = "world-epoch";
const OPENING = { worldEpoch: EPOCH, turn: 50, digest: "a".repeat(64) };

async function worldDb(
  state: Record<string, unknown>,
  config: Record<string, unknown> = {}
): Promise<Db> {
  const db = createInMemoryDb() as unknown as Db;
  await db.collection<Doc>("gameState").insertOne({ _id: "current", isActive: false, ...state });
  await db.collection<Doc>("gameConfig").insertOne({ _id: "default", ...config });
  return db;
}

describe("funded switch gameConfig update", () => {
  it("sets the funded rules from the turn after the current one", () => {
    expect(fundedSwitchGameConfigUpdate(120)).toEqual({
      $set: {
        marketRecoveryStage: 0,
        producerMarketLiveFromTurn: 121,
        producerDemandPlanStage: 1,
        producerLowUseCostStage: 1,
        producerIdleRetireStage: 1,
        producerSpilloverStage: 1,
        producerStockCover: 1,
        producerClearingReferenceStage: 1,
        producerFundedBookStage: 1,
        producerShortageGrowthStage: 1,
        producerCaptiveDeliveryStage: 1,
        producerFundedRestartStage: 1,
        fundedHeadcountStage: 1,
        producerTransitionPackageEnabled: false,
      },
    });
  });

  it("refuses a turn that is not a whole, non-negative number", () => {
    expect(() => fundedSwitchGameConfigUpdate(1.5)).toThrow(/whole/);
    expect(() => fundedSwitchGameConfigUpdate(-1)).toThrow(/whole/);
    expect(() => fundedSwitchGameConfigUpdate(Number.NaN)).toThrow(/whole/);
  });
});

describe("applyFundedSwitch", () => {
  it("writes the funded config and clears the transition stamps", async () => {
    const db = await worldDb(
      { worldEpochId: EPOCH, currentTurn: 50, producerOpening: OPENING },
      { producerTransitionPackageEnabled: true, producerMarketLiveFromTurn: 12 }
    );
    await db
      .collection<Doc>("corporateSectors")
      .insertMany([
        { _id: "sector-a", cutoverTransition: { mismatched: true } },
        { _id: "sector-b", cutoverStruggling: { reason: "losing" } },
        { _id: "sector-c" },
      ]);

    const result = await applyFundedSwitch(db, { expectedWorldEpoch: EPOCH });

    expect(result).toEqual({
      status: "applied",
      currentTurn: 50,
      worldEpoch: EPOCH,
      producerMarketLiveFromTurn: 51,
      transitionStampsCleared: 2,
    });
    const config = await db.collection<Doc>("gameConfig").findOne({ _id: "default" });
    expect(config).toMatchObject(fundedSwitchGameConfigUpdate(50).$set as Record<string, unknown>);
    const sectors = await db.collection<Doc>("corporateSectors").find({}).sort({ _id: 1 }).toArray();
    expect(sectors.map((sector) => sector._id)).toEqual(["sector-a", "sector-b", "sector-c"]);
    for (const sector of sectors) {
      expect(sector).not.toHaveProperty("cutoverTransition");
      expect(sector).not.toHaveProperty("cutoverStruggling");
    }
  });

  it("is a no-op success once the world is switched", async () => {
    const db = await worldDb({ worldEpochId: EPOCH, currentTurn: 50, producerOpening: OPENING });
    await applyFundedSwitch(db, { expectedWorldEpoch: EPOCH });

    const again = await applyFundedSwitch(db, { expectedWorldEpoch: EPOCH });

    expect(again).toEqual({
      status: "alreadyApplied",
      currentTurn: 50,
      worldEpoch: EPOCH,
      producerMarketLiveFromTurn: 51,
      transitionStampsCleared: 0,
    });
  });

  it("finishes a switched world that still carries a transition stamp", async () => {
    const db = await worldDb(
      { worldEpochId: EPOCH, currentTurn: 50, producerOpening: OPENING },
      fundedSwitchGameConfigUpdate(50).$set as Record<string, unknown>
    );
    await db.collection<Doc>("corporateSectors").insertOne({
      _id: "sector-a",
      cutoverStruggling: { reason: "zeroSales" },
    });

    const result = await applyFundedSwitch(db, { expectedWorldEpoch: EPOCH });

    expect(result.status).toBe("applied");
    expect(result.transitionStampsCleared).toBe(1);
    const sector = await db.collection<Doc>("corporateSectors").findOne({ _id: "sector-a" });
    expect(sector).not.toHaveProperty("cutoverStruggling");
  });

  it("refuses a world without the opening marker", async () => {
    const db = await worldDb(
      { worldEpochId: EPOCH, currentTurn: 50 },
      { producerTransitionPackageEnabled: true }
    );

    await expect(applyFundedSwitch(db, { expectedWorldEpoch: EPOCH })).rejects.toThrow(
      /no opening is recorded/
    );
    const config = await db.collection<Doc>("gameConfig").findOne({ _id: "default" });
    expect(config).toMatchObject({ producerTransitionPackageEnabled: true });
  });

  it("refuses an opening applied at a different turn", async () => {
    const db = await worldDb({
      worldEpochId: EPOCH,
      currentTurn: 50,
      producerOpening: { ...OPENING, turn: 49 },
    });

    await expect(applyFundedSwitch(db, { expectedWorldEpoch: EPOCH })).rejects.toThrow(
      /applied at turn 49/
    );
  });

  it("refuses an opening from a different world", async () => {
    const db = await worldDb({
      worldEpochId: EPOCH,
      currentTurn: 50,
      producerOpening: { ...OPENING, worldEpoch: "another-epoch" },
    });

    await expect(applyFundedSwitch(db, { expectedWorldEpoch: EPOCH })).rejects.toThrow(
      /different world/
    );
  });

  it("refuses when the live world is not the expected world", async () => {
    const db = await worldDb({
      worldEpochId: "another-epoch",
      currentTurn: 50,
      producerOpening: OPENING,
    });

    await expect(applyFundedSwitch(db, { expectedWorldEpoch: EPOCH })).rejects.toThrow(
      /not the live world/
    );
  });
});
