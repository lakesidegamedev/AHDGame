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

import { privatizeAsset } from "./privatizeAsset";
import {
  resumePendingCompensationRecoveries,
  reverseNationalizationTaking,
} from "./reverseNationalization";

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
    expect(result.spunOut).toBe(0);
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

  it("hands back every taking folded into one row and recovers each compensation", async () => {
    creditTreasury.mockClear();
    const memory = createInMemoryDb();
    const natCorp = new ObjectId();
    const ownerA = new ObjectId();
    const ownerB = new ObjectId();
    const sectorId = new ObjectId();
    memory.seed("corporations", [
      { _id: natCorp, name: "State Oil", countryOwnerId: "US", liquidCapital: 0, countryId: "US" },
      { _id: ownerA, name: "A", liquidCapital: 1_000, countryId: "US" },
      { _id: ownerB, name: "B", liquidCapital: 1_000, countryId: "US" },
    ]);
    memory.seed("corporateSectors", [
      {
        _id: sectorId,
        corporationId: natCorp,
        stateId: "TX",
        sectorType: "extraction",
        revenue: 1_020,
        workers: 60,
        currentGrowthCost: 6,
        nationalizationProvenance: {
          formerCorporationId: ownerB,
          formerRevenue: 200,
          takenAtTurn: 12,
          compensationAnchor: 100,
          compensationCountryId: "US",
          mergedIntoExisting: true,
          foldedRevenue: 170,
          foldedWorkers: 20,
          foldedGrowthCost: 2,
          earlierTakings: [
            {
              formerCorporationId: ownerA,
              formerRevenue: 1_000,
              takenAtTurn: 10,
              compensationAnchor: 300,
              compensationCountryId: "US",
            },
          ],
        },
      },
    ]);
    const db = memory as unknown as Db;

    const result = await reverseNationalizationTaking(db, params(sectorId));

    expect(result.restoredToPriorOwner).toBe(2);
    expect(result.compensationRecoveredAnchor).toBe(400);
    expect(creditTreasury).toHaveBeenCalledTimes(2);
    const rows = await memory.collection("corporateSectors").find({}).toArray();
    expect(rows.find((r) => String(r.corporationId) === String(ownerA))?.revenue).toBe(1_000);
    expect(rows.find((r) => String(r.corporationId) === String(ownerB))?.revenue).toBe(200);
    expect(rows.some((r) => r.nationalizationProvenance)).toBe(false);
    const a = await memory.collection("corporations").findOne({ _id: ownerA });
    const b = await memory.collection("corporations").findOne({ _id: ownerB });
    expect(a?.liquidCapital).toBe(700);
    expect(b?.liquidCapital).toBe(900);
    expect(Object.keys(a?.pendingCompensationRecoveries ?? {})).toEqual([]);
    expect(Object.keys(b?.pendingCompensationRecoveries ?? {})).toEqual([]);
  });

  it("recovers from the corporation that now holds the asset when no prior owner survives", async () => {
    creditTreasury.mockClear();
    const memory = createInMemoryDb();
    const natCorp = new ObjectId();
    const gone = new ObjectId();
    const spunOut = new ObjectId();
    const sectorId = new ObjectId();
    memory.seed("corporations", [
      { _id: natCorp, name: "State Oil", countryOwnerId: "US", liquidCapital: 0, countryId: "US" },
      { _id: spunOut, name: "Returned", liquidCapital: 150, countryId: "US" },
    ]);
    memory.seed("corporateSectors", [
      {
        _id: sectorId,
        corporationId: natCorp,
        stateId: "TX",
        sectorType: "extraction",
        revenue: 850,
        nationalizationProvenance: {
          formerCorporationId: gone,
          takenAtTurn: 10,
          compensationAnchor: 500,
          compensationCountryId: "US",
        },
      },
    ]);
    vi.mocked(privatizeAsset).mockResolvedValueOnce({ newCorporationId: spunOut } as never);

    const result = await reverseNationalizationTaking(memory as unknown as Db, params(sectorId));

    expect(result.spunOut).toBe(1);
    expect(result.compensationRecoveredAnchor).toBe(150);
    expect(result.compensationOwedAnchor).toBe(350);
    const holder = await memory.collection("corporations").findOne({ _id: spunOut });
    expect(holder?.federalTaxArrearsAnchorByCountry).toEqual({ US: 350 });
  });
});

describe("resumePendingCompensationRecoveries", () => {
  const marker = (sectorId: ObjectId, over: Record<string, unknown> = {}) => ({
    sectorId,
    takenAtTurn: 10,
    countryId: "US",
    anchor: 600,
    stage: "pending",
    ...over,
  });

  it("completes a recovery whose asset already moved before the crash", async () => {
    creditTreasury.mockClear();
    const memory = createInMemoryDb();
    const owner = new ObjectId();
    const natCorp = new ObjectId();
    const sectorId = new ObjectId();
    memory.seed("corporations", [
      {
        _id: owner,
        liquidCapital: 1_000,
        countryId: "US",
        pendingCompensationRecoveries: { [`${sectorId.toHexString()}_10`]: marker(sectorId) },
      },
    ]);
    memory.seed("corporateSectors", [
      { _id: sectorId, corporationId: owner, stateId: "TX", sectorType: "extraction" },
    ]);
    void natCorp;

    await resumePendingCompensationRecoveries(memory as unknown as Db);

    const corp = await memory.collection("corporations").findOne({ _id: owner });
    expect(corp?.liquidCapital).toBe(400);
    expect(Object.keys(corp?.pendingCompensationRecoveries ?? {})).toEqual([]);
    expect(creditTreasury).toHaveBeenCalledTimes(1);
  });

  it("drops a marker whose taking never left the state, moving no money", async () => {
    creditTreasury.mockClear();
    const memory = createInMemoryDb();
    const owner = new ObjectId();
    const natCorp = new ObjectId();
    const sectorId = new ObjectId();
    memory.seed("corporations", [
      {
        _id: owner,
        liquidCapital: 1_000,
        countryId: "US",
        pendingCompensationRecoveries: { [`${sectorId.toHexString()}_10`]: marker(sectorId) },
      },
    ]);
    memory.seed("corporateSectors", [
      {
        _id: sectorId,
        corporationId: natCorp,
        nationalizationProvenance: { formerCorporationId: owner, takenAtTurn: 10 },
      },
    ]);

    await resumePendingCompensationRecoveries(memory as unknown as Db);

    const corp = await memory.collection("corporations").findOne({ _id: owner });
    expect(corp?.liquidCapital).toBe(1_000);
    expect(Object.keys(corp?.pendingCompensationRecoveries ?? {})).toEqual([]);
    expect(creditTreasury).not.toHaveBeenCalled();
  });

  it("credits the treasury once for cash already taken, then books the unpaid rest as debt", async () => {
    creditTreasury.mockClear();
    const memory = createInMemoryDb();
    const owner = new ObjectId();
    const sectorId = new ObjectId();
    memory.seed("corporations", [
      {
        _id: owner,
        liquidCapital: 0,
        countryId: "US",
        pendingCompensationRecoveries: {
          [`${sectorId.toHexString()}_10`]: marker(sectorId, { stage: "debited", paidAnchor: 250 }),
        },
      },
    ]);
    memory.seed("corporateSectors", [
      { _id: sectorId, corporationId: owner, stateId: "TX", sectorType: "extraction" },
    ]);
    const db = memory as unknown as Db;

    creditTreasury.mockRejectedValueOnce(new Error("crash"));
    await resumePendingCompensationRecoveries(db);
    let corp = await memory.collection("corporations").findOne({ _id: owner });
    expect(corp?.pendingCompensationRecoveries).toBeDefined();

    await resumePendingCompensationRecoveries(db);
    corp = await memory.collection("corporations").findOne({ _id: owner });
    expect(corp?.liquidCapital).toBe(0);
    expect(corp?.federalTaxArrearsAnchorByCountry).toEqual({ US: 350 });
    expect(Object.keys(corp?.pendingCompensationRecoveries ?? {})).toEqual([]);
    expect(creditTreasury).toHaveBeenLastCalledWith(
      expect.anything(),
      "US",
      250,
      expect.any(Date),
      expect.anything()
    );
  });
});
