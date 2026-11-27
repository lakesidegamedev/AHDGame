import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processCommandEconomyTurn } from "./commandEconomyTurn";
import {
  setStoredMarketizationLevel,
  getStoredMarketizationLevel,
  clearStoredMarketizationLevels,
} from "@/lib/constants/commandEconomy";
const corpId = new ObjectId(),
  sectorId = new ObjectId();
function fixture() {
  const f = createTransactionalMemoryDb();
  clearStoredMarketizationLevels();
  setStoredMarketizationLevel("RU", 55);
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      worldEpochId: "synthetic-command-credit",
      preset: "1953-default",
      currentYear: 1953,
    },
  ]);
  f.memory.seed("gameConfig", [
    { _id: "default", commandEconomyEnabled: true, marketSystemMode: "plants" },
  ]);
  f.memory.seed("exchangeRates", [
    { _id: "US", currencyCode: "USD", rate: 1, baseRate: 1 },
    { _id: "RU", currencyCode: "SUR", rate: 1, baseRate: 1 },
  ]);
  f.memory.seed("federalBudget", [
    {
      _id: "RU",
      countryId: "RU",
      economicFactors: {
        gdpGrowth: 4,
        wageGrowth: 10,
        inflationRate: 3,
        tradeGrowth: 2,
        marketizationLevel: 0,
      },
    },
  ]);
  f.memory.seed("corporations", [
    {
      _id: corpId,
      countryId: "RU",
      liquidCurrencyCode: "SUR",
      liquidCapital: 5000,
      soe: {
        sector: "manufacturing",
        capacity: 1000,
        output: 900,
        planTarget: 1000,
        efficiency: 1,
        cumulativeLosses: 0,
        directorId: null,
      },
    },
  ]);
  f.memory.seed("corporateSectors", [
    {
      _id: sectorId,
      corporationId: corpId,
      sectorType: "manufacturing",
      countryId: "RU",
      stateId: "CEN",
      revenue: 1000,
      realizedRevenue: 900,
      capitalStock: 20000,
      capacityBookAnchor: 100000,
      buildQueue: [{ unitsOrdered: 10, startTurn: 9, onlineTurn: 12, costPaidAnchor: 100 }],
      producerInventory: {
        worldEpoch: "synthetic",
        turn: 99,
        inputStock: [{ commodity: "energy", units: 7, value: 70 }],
        outputStock: [],
      },
    },
  ]);
  return f;
}
describe("directed credit phase proof", () => {
  it.each([
    { collection: "federalBudget", op: "bulkWrite" as const },
    { collection: "corporateSectors", op: "bulkWrite" as const },
    { collection: "corporations", op: "bulkWrite" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])(
    "a landed $collection interruption preserves plant, issuance and the committed registry",
    async (point) => {
      const { db, memory } = fixture();
      const before = await db.collection("corporateSectors").findOne({});
      const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
      await expect(processCommandEconomyTurn(fault.db, 100, 1953)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await db.collection("corporateSectors").findOne({})).toEqual(before);
      expect(
        (await db.collection("federalBudget").findOne({}))?.economicFactors.directedCreditIssuance
      ).toBeUndefined();
      expect(getStoredMarketizationLevel("RU")).toBe(55);
      const first = await processCommandEconomyTurn(db, 100, 1953);
      const built = await db.collection("corporateSectors").findOne({});
      expect(built!.capitalStock).toBeGreaterThan(20000);
      expect(built!.capacityBookAnchor).toBeGreaterThan(100000);
      expect(built!.buildQueue).toEqual(before!.buildQueue);
      expect(built!.producerInventory).toEqual(before!.producerInventory);
      expect((await db.collection("corporations").findOne({}))?.liquidCapital).toBe(5000);
      expect(getStoredMarketizationLevel("RU")).toBe(
        (await db.collection("federalBudget").findOne({}))?.economicFactors.marketizationLevel
      );
      expect(await processCommandEconomyTurn(db, 100, 1953)).toEqual(first);
      expect(await db.collection("corporateSectors").findOne({})).toEqual(built);
    }
  );
  it("overlapping credit phases purchase capacity once", async () => {
    const { db } = fixture();
    const replies = await Promise.all([
      processCommandEconomyTurn(db, 100, 1953),
      processCommandEconomyTurn(db, 100, 1953),
    ]);
    expect(replies[0]).toEqual(replies[1]);
    expect(
      await db.collection("bankMoneyMoves").countDocuments({ kind: "turn-value-settlement" })
    ).toBe(1);
  });
});
