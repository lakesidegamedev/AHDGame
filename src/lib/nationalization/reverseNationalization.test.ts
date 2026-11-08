import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";

const creditTreasury = vi.fn().mockResolvedValue(0);
vi.mock("./treasury", () => ({
  creditTreasuryProceedsFromAnchor: (...args: unknown[]) => creditTreasury(...args),
}));
vi.mock("./treasuryLedger", () => ({
  loadTreasuryCashContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("./privatizeAsset", () => ({ privatizeAsset: vi.fn() }));
vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/corporationCapital")>()),
  getCorpFxRate: vi.fn().mockResolvedValue(1),
}));

import { reverseNationalizationTaking } from "./reverseNationalization";

function world(opts: { priorCash: number; merged?: boolean }) {
  const memory = createInMemoryDb();
  const natCorp = new ObjectId();
  const prior = new ObjectId();
  const sectorId = new ObjectId();
  memory.seed("corporations", [
    { _id: natCorp, name: "State Oil", countryOwnerId: "US", liquidCapital: 0, countryId: "US" },
    { _id: prior, name: "Private Oil", liquidCapital: opts.priorCash, countryId: "US" },
  ]);
  memory.seed("corporateSectors", [
    {
      _id: sectorId,
      corporationId: natCorp,
      stateId: "TX",
      sectorType: "extraction",
      revenue: opts.merged ? 1_000 : 850,
      workers: opts.merged ? 100 : 10,
      currentGrowthCost: opts.merged ? 50 : 5,
      nationalizationProvenance: {
        formerCorporationId: prior,
        formerRevenue: 1_000,
        takenAtTurn: 10,
        compensationAnchor: 600,
        compensationCountryId: "US",
        ...(opts.merged
          ? {
              mergedIntoExisting: true,
              foldedRevenue: 850,
              foldedWorkers: 10,
              foldedGrowthCost: 5,
            }
          : {}),
      },
    },
  ]);
  return { memory, db: memory as unknown as Db, natCorp, prior, sectorId };
}

const params = (sectorId: ObjectId) => ({
  countryId: "US",
  sectorIds: [sectorId],
  turn: 20,
  label: "Order",
});

describe("reverseNationalizationTaking compensation clawback", () => {
  it("recovers the full compensation to the treasury when the company can pay", async () => {
    creditTreasury.mockClear();
    const w = world({ priorCash: 1_000 });
    const result = await reverseNationalizationTaking(w.db, params(w.sectorId));

    expect(result.restoredToPriorOwner).toBe(1);
    expect(result.compensationRecoveredAnchor).toBe(600);
    expect(result.compensationOwedAnchor).toBe(0);
    const prior = await w.memory.collection("corporations").findOne({ _id: w.prior });
    expect(prior?.liquidCapital).toBe(400);
    expect(creditTreasury).toHaveBeenCalledWith(
      expect.anything(),
      "US",
      600,
      expect.any(Date),
      expect.anything()
    );
  });

  it("takes what the company has and records the rest as debt to the country", async () => {
    creditTreasury.mockClear();
    const w = world({ priorCash: 250 });
    const result = await reverseNationalizationTaking(w.db, params(w.sectorId));

    expect(result.compensationRecoveredAnchor).toBe(250);
    expect(result.compensationOwedAnchor).toBe(350);
    const prior = await w.memory.collection("corporations").findOne({ _id: w.prior });
    expect(prior?.liquidCapital).toBe(0);
    expect(prior?.federalTaxArrearsAnchorByCountry).toEqual({ US: 350 });
    expect(creditTreasury).toHaveBeenCalledTimes(1);
  });

  it("does not recover twice when the reversal is repeated", async () => {
    creditTreasury.mockClear();
    const w = world({ priorCash: 1_000 });
    await reverseNationalizationTaking(w.db, params(w.sectorId));
    const again = await reverseNationalizationTaking(w.db, params(w.sectorId));
    expect(again.restoredToPriorOwner).toBe(0);
    expect(creditTreasury).toHaveBeenCalledTimes(1);
  });

  it("returns only the folded amounts of a merged state holding", async () => {
    const w = world({ priorCash: 1_000, merged: true });
    const result = await reverseNationalizationTaking(w.db, params(w.sectorId));

    expect(result.restoredToPriorOwner).toBe(1);
    const survivor = await w.memory.collection("corporateSectors").findOne({ _id: w.sectorId });
    expect(survivor?.corporationId).toEqual(w.natCorp);
    expect(survivor?.revenue).toBe(150);
    expect(survivor?.workers).toBe(90);
    expect(survivor?.nationalizationProvenance).toBeUndefined();
    const returned = await w.memory
      .collection("corporateSectors")
      .find({ corporationId: w.prior })
      .toArray();
    expect(returned).toHaveLength(1);
    expect(returned[0]?.revenue).toBe(1_000);
    expect(returned[0]?.workers).toBe(10);
  });
});
