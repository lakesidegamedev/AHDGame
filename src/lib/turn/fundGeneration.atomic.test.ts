import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { Character } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
let ownedDb: Db;
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ownedDb }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
import { recordAudit, recordAuditBulk } from "@/lib/audit/recordAudit";
import { processFundGeneration } from "./fundGeneration";
import { processNppFundGeneration } from "./nppFundGeneration";
function fixture(npp: boolean) {
  const f = createTransactionalMemoryDb();
  ownedDb = f.db;
  vi.mocked(recordAudit).mockClear();
  vi.mocked(recordAuditBulk).mockClear();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      worldEpochId: "synthetic-fund-generation",
      preset: "2027-default",
    },
  ]);
  f.memory.seed("gameConfig", [
    { _id: "default", nppEconomyEnabled: true, campaignEraPriceLevelEnabled: false },
  ]);
  f.memory.seed("exchangeRates", [
    { _id: "US", countryId: "US", currencyCode: "USD", baseRate: 1, rate: 1 },
    { _id: "CA", countryId: "CA", currencyCode: "CAD", baseRate: 2, rate: 2 },
  ]);
  f.memory.seed("states", [
    { _id: "US-CA", countryId: "US", population: 1000000, gdp: 50000 },
    { _id: "CA-ON", countryId: "CA", population: 1000000, gdp: 50000 },
  ]);
  f.memory.seed(
    "politicalParties",
    ["US", "CA"].map((countryId) => ({
      _id: new ObjectId(),
      countryId,
      sequentialId: 1,
      nationalTaxRate: 10,
      treasury: 0,
      name: "Synthetic party",
    }))
  );
  f.memory.seed(
    "statePartyOrg",
    ["US-CA", "CA-ON"].map((stateId) => ({
      _id: `${stateId}_1`,
      stateId,
      countryId: stateId.startsWith("US") ? "US" : "CA",
      partyId: "1",
      stateTaxRate: 10,
      treasury: 0,
    }))
  );
  const actors = Array.from({ length: npp ? 150 : 2 }, (_, i) => ({
    _id: new ObjectId(),
    name: "Synthetic member",
    countryId: i % 2 ? "CA" : "US",
    homeState: i % 2 ? "CA-ON" : "US-CA",
    party: "1",
    donorBaseLevel: 0,
    currentOffice: null,
    politicalInfluence: 0,
    funds: 100,
    actionPoints: 0,
    retiredAt: null,
  }));
  f.memory.seed(npp ? "npps" : "characters", actors);
  return { ...f, actors };
}
describe.each([false, true])("atomic political fund generation: npp=%s", (npp) => {
  const run = async (db: Db, actors: object[]) => {
    ownedDb = db;
    return npp
      ? processNppFundGeneration(db, 100)
      : processFundGeneration(actors as Character[], new Date(0), undefined, false, 100);
  };
  it.each(["actor", "politicalParties", "statePartyOrg", "financialTxLog", "bankMoneyMoves"])(
    "a landed %s interruption rolls back income, taxes and receipts",
    async (target) => {
      const { db, memory, actors } = fixture(npp);
      const collection = target === "actor" ? (npp ? "npps" : "characters") : target;
      const op = ["characters", "npps", "politicalParties", "statePartyOrg"].includes(collection)
        ? "bulkWrite"
        : collection === "bankMoneyMoves"
          ? "insertOne"
          : "insertMany";
      const fault = withInjectedCrash(memory, {
        collection,
        op,
        onCall: npp && target === "actor" ? 2 : 1,
        afterWrite: true,
      });
      await expect(run(fault.db, actors)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(recordAudit).not.toHaveBeenCalled();
      expect(recordAuditBulk).not.toHaveBeenCalled();
      expect(
        (
          await db
            .collection(npp ? "npps" : "characters")
            .find({})
            .toArray()
        ).every((row) => row.funds === 100)
      ).toBe(true);
      expect(
        (await db.collection("politicalParties").find({}).toArray()).every(
          (row) => row.treasury === 0
        )
      ).toBe(true);
      expect(
        (await db.collection("statePartyOrg").find({}).toArray()).every((row) => row.treasury === 0)
      ).toBe(true);
      expect(await db.collection("financialTxLog").countDocuments({})).toBe(0);
      const result = await run(db, actors);
      expect(result.totalGenerated).toBeGreaterThan(0);
      const saved = await db
        .collection(npp ? "npps" : "characters")
        .find({})
        .toArray();
      const national = await db.collection("politicalParties").find({}).toArray();
      const regional = await db.collection("statePartyOrg").find({}).toArray();
      const delivered =
        saved.reduce((sum, row) => sum + row.funds - 100, 0) +
        national.reduce((sum, row) => sum + row.treasury, 0) +
        regional.reduce((sum, row) => sum + row.treasury, 0);
      expect(delivered).toBeCloseTo(result.totalGenerated);
      expect(await run(db, actors)).toEqual(result);
      expect(
        await db
          .collection(npp ? "npps" : "characters")
          .find({})
          .toArray()
      ).toEqual(saved);
    }
  );
  it("overlapping phase requests settle each member's original income once", async () => {
    const { db, actors } = fixture(npp);
    const replies = await Promise.all([run(db, actors), run(db, actors)]);
    expect(replies[0]).toEqual(replies[1]);
    expect(
      await db.collection("bankMoneyMoves").countDocuments({ kind: "turn-value-settlement" })
    ).toBe(1);
  });
});
