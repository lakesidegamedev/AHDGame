import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { transferRegion } from "./transferRegion";
const fail = vi.hoisted(() => ({ afterConversion: true, reachedConversion: false }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/nationalMetrics", () => ({ computeNationalMetrics: vi.fn() }));
vi.mock("./reseedJoinedRegionElections", () => ({ reseedJoinedRegionElections: vi.fn() }));
vi.mock("@/lib/country/mergeFxScale", () => ({
  loadFxScalePair: vi.fn().mockResolvedValue({
    kind: "convert",
    oldCurrency: "CAD",
    newCurrency: "USD",
    scale: 0.5,
    fxByCurrency: new Map([
      ["USD", 1],
      ["CAD", 2],
    ]),
  }),
}));
vi.mock("./convertTransferredResidentsCurrency", async (original) => {
  const actual = await original<typeof import("./convertTransferredResidentsCurrency")>();
  return {
    ...actual,
    convertTransferredResidentsCurrency: async (
      ...args: Parameters<typeof actual.convertTransferredResidentsCurrency>
    ) => {
      await actual.convertTransferredResidentsCurrency(...args);
      fail.reachedConversion = true;
      if (fail.afterConversion) throw new Error("interrupted after resident conversion");
    },
  };
});
beforeEach(() => {
  fail.afterConversion = true;
  fail.reachedConversion = false;
});
it("rolls back a non-Irish transfer's ownership and native money after conversion, then retries", async () => {
  const f = createTransactionalMemoryDb();
  const corpId = new ObjectId(),
    characterId = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 5, preset: "2027-default" }]);
  f.memory.seed("states", [
    {
      _id: "ON",
      countryId: "CA",
      name: "Ontario",
      population: 100,
      gdp: 100,
      capitalStock: 200,
      houseDistricts: 1,
      stateSenateSeats: 1,
    },
    { _id: "TX", countryId: "US", name: "Texas", population: 1000, gdp: 1000 },
  ]);
  f.memory.seed("corporations", [
    {
      _id: corpId,
      countryId: "CA",
      headquartersState: "ON",
      liquidCurrencyCode: "CAD",
      liquidCapital: 2000,
      sharePrice: 20,
      revenue: 100,
    },
  ]);
  f.memory.seed("characters", [
    {
      _id: characterId,
      countryId: "CA",
      homeState: "ON",
      party: "independent",
      currencyBalances: { personal: { CAD: 200 }, campaign: 0 },
    },
  ]);
  const request = {
    regionId: "ON",
    fromCountryId: "CA" as const,
    toCountryId: "US" as const,
    province: "Ontario",
    relocateToRegionId: null,
    currentTurn: 5,
    deferCountryWidePasses: true,
  };
  await expect(transferRegion(f.db, request)).rejects.toThrow(
    "interrupted after resident conversion"
  );
  expect(fail.reachedConversion).toBe(true);
  expect((await f.db.collection("states").findOne({ _id: "ON" } as never))!.countryId).toBe("CA");
  expect((await f.db.collection("corporations").findOne({ _id: corpId }))!).toMatchObject({
    countryId: "CA",
    liquidCurrencyCode: "CAD",
    liquidCapital: 2000,
  });
  fail.afterConversion = false;
  expect(await transferRegion(f.db, request)).toMatchObject({ ok: true });
  expect((await f.db.collection("corporations").findOne({ _id: corpId }))!).toMatchObject({
    countryId: "US",
    liquidCurrencyCode: "USD",
    liquidCapital: 1000,
  });
  expect(await transferRegion(f.db, request)).toMatchObject({
    ok: true,
    skipped: "already-transferred",
  });
  expect((await f.db.collection("corporations").findOne({ _id: corpId }))!.liquidCapital).toBe(
    1000
  );
});
