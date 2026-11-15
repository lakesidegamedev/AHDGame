import { expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { processNppFundGeneration } from "./nppFundGeneration";
import { projectNppGeneration } from "@/lib/utils/fundGeneration";
import { ERA_PRICE_LEVEL } from "@/lib/campaigns/rules/priceLevel";
vi.mock("@/lib/financialTxLog/emit", () => ({
  loadTxThresholds: async () => ({}),
  emitTxBulk: vi.fn(),
}));
vi.mock("@/lib/treasury/emit", () => ({ emitTreasuryTransactionsBulk: vi.fn() }));

it.each([
  { era: "2027", enabled: false },
  { era: "1953", enabled: true },
  { era: "1991", enabled: true },
  { era: "2027", enabled: true },
] as const)(
  "generates and caps NGN funds at the world price basis $era, enabled=$enabled",
  async ({ era, enabled }) => {
    const priceLevel = enabled ? ERA_PRICE_LEVEL[era] : 1;
    const db = createInMemoryDb();
    db.seed("gameConfig", [
      { _id: "default", nppEconomyEnabled: true, campaignEraPriceLevelEnabled: enabled },
    ]);
    const preset = `${era}-default`;
    db.seed("gameState", [{ _id: "current", preset }]);
    db.seed("states", [{ _id: "NG-test", countryId: "NG", population: 1_000_000 }]);
    db.seed("exchangeRates", [
      { _id: "NG", countryId: "NG", currencyCode: "NGN", baseRate: 0.357, rate: 0.1 },
    ]);
    db.seed("npps", [
      {
        _id: new ObjectId(),
        countryId: "NG",
        homeState: "NG-test",
        funds: 1_000_000 * 0.357 * priceLevel,
        donorBaseLevel: 0,
        party: "independent",
        actionPoints: 0,
        retiredAt: null,
      },
    ]);
    const npps = db.collection("npps");
    const find = npps.find.bind(npps);
    vi.spyOn(npps, "find").mockImplementation((filter) => {
      const cursor = find(filter);
      return Object.assign(cursor, {
        [Symbol.asyncIterator]: async function* () {
          yield* await cursor.toArray();
        },
      });
    });
    const expected = Math.round(
      projectNppGeneration({
        population: 1_000_000,
        donorBaseLevel: 0,
        currentFundsLocal: 1_000_000,
        nppEconomyEnabled: true,
      }) *
        0.357 *
        priceLevel
    );
    const result = await processNppFundGeneration(db as unknown as Db, 2);
    expect(result.totalGenerated).toBe(expected);
    expect(npps.docs[0].funds).toBe(1_000_000 * 0.357 * priceLevel + expected);
  }
);
