import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { privatizeAsset } from "./privatizeAsset";

vi.mock("@/lib/economy/queries/privateEnterpriseGate", () => ({
  assertPrivateEnterprisePermitted: vi.fn(),
}));
vi.mock("@/lib/currency/corporationCapital", async (original) => ({
  ...(await original<typeof import("@/lib/currency/corporationCapital")>()),
  loadFxRatesByCurrency: async () => new Map([["USD", 1]]),
}));
vi.mock("@/lib/corporations/marketShare", () => ({ fetchSectorMarketSharePercent: async () => 0 }));
vi.mock("@/lib/bonds/corporateBondDefault", () => ({
  buildPrimeRateMap: () => new Map(),
  computeSectorNpvSum: () => 1e6,
}));
vi.mock("@/lib/corporations/subsidiaries/nppCeoSelection", () => ({
  pickOrCreateNppCeoForNewCorp: async () => new ObjectId(),
}));
vi.mock("./privatizationNotifications", () => ({ notifyCountryResidents: vi.fn() }));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn(),
  wireHeadlineCorpPrivatized: () => "Privatized",
}));
vi.mock("./nationalCorporation", async (original) => ({
  ...(await original<typeof import("./nationalCorporation")>()),
  ensurePrimaryNationalCorporation: async (db: import("mongodb").Db) =>
    db.collection("corporations").findOne({ isPrimaryNationalCorporation: true }),
}));

function world() {
  const { db, memory } = createTransactionalMemoryDb();
  const owner = new ObjectId(),
    site = new ObjectId();
  memory.seed("gameState", [
    { _id: "current", currentYear: 2027, currentTurn: 100, preset: "2027-default" },
  ]);
  memory.seed("corporations", [
    {
      _id: owner,
      sequentialId: 1,
      name: "State Industries",
      countryId: "US",
      countryOwnerId: "US",
      isPrimaryNationalCorporation: true,
      ownershipState: "stateOwned",
      liquidCurrencyCode: "USD",
      liquidCapital: 10000,
    },
  ]);
  memory.seed("corporateSectors", [
    {
      _id: site,
      corporationId: owner,
      countryId: "US",
      stateId: "TX",
      sectorType: "agriculture",
      revenue: 10000,
      workers: 10,
      currentGrowthCost: 100,
      profitMargin: 20,
      capitalStock: plantSizeForSector({ sectorType: "agriculture" }) * 10,
      plantCount: 10,
      capacityBookAnchor: 1e6,
    },
  ]);
  const params = {
    countryId: "US" as const,
    sourceNationalCorporationId: owner,
    selections: [{ sectorId: site, carveFraction: 0.2 }],
    newCorpName: "Spun Farm",
    goldenSharePercent: 0.1,
    method: "auction" as const,
    turn: 100,
  };
  return { db, memory, owner, site, params };
}

describe("atomic privatization", () => {
  it.each(["corporations", "corporateSectors", "nationalizationAuctions"])(
    "rolls back a landed %s insert and retries the entire carve",
    async (name) => {
      const w = world();
      const fault = withInjectedCrash(w.memory, {
        collection: name,
        op: name === "corporateSectors" ? "bulkWrite" : "insertOne",
        onCall: 1,
        afterWrite: true,
      });
      await expect(privatizeAsset(fault.db, w.params)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await w.db.collection("corporations").countDocuments({})).toBe(1);
      expect(await w.db.collection("nationalizationAuctions").countDocuments({})).toBe(0);
      expect(await w.db.collection("corporateSectors").findOne({ _id: w.site })).toMatchObject({
        plantCount: 10,
        capitalStock: plantSizeForSector({ sectorType: "agriculture" }) * 10,
        capacityBookAnchor: 1e6,
      });
      expect(
        (await w.db.collection("corporateSectors").findOne({ _id: w.site }))
          ?.constructionPropertyTransition
      ).toBeUndefined();
      fault.disarm();
      const result = await privatizeAsset(w.db, w.params);
      expect(result.sectorsCarved).toBe(1);
      expect(
        await w.db
          .collection("nationalizationAuctions")
          .countDocuments({ corporationId: result.newCorporationId })
      ).toBe(1);
      const sites = await w.db.collection("corporateSectors").find({}).toArray();
      expect(sites.reduce((sum, row) => sum + row.plantCount, 0)).toBe(10);
      expect(sites.reduce((sum, row) => sum + row.capacityBookAnchor, 0)).toBe(1e6);
      expect((await w.db.collection("corporations").findOne({ _id: w.owner }))?.liquidCapital).toBe(
        10000
      );
    }
  );
});
