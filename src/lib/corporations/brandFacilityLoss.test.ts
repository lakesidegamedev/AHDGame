import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { applyFacilityLoss } from "@/lib/market/brandLoyalty";
import { applyBrandFacilityLoss } from "./brandFacilityLoss";

describe("applyBrandFacilityLoss", () => {
  it("measures a lost foreign site against the rest of the footprint in one unit", async () => {
    const db = createInMemoryDb();
    const corpId = new ObjectId();
    await db.collection("exchangeRates").insertMany([
      { _id: "CA", countryId: "CA", currencyCode: "CAD", rate: 1 },
      { _id: "ITL", countryId: "ITL", currencyCode: "ITL", rate: 1000 },
    ]);
    await db.collection("corporations").insertOne({
      _id: corpId,
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      brandLoyalty: 80,
    });
    // 1,000 anchor at home and 1,000 anchor in Italy (1,000,000 ITL at 1000 per anchor).
    const home = { corporationId: corpId, countryId: "CA", revenue: 1_000 };
    const italy = { corporationId: corpId, countryId: "IT", revenue: 1_000_000 };
    await db.collection("corporateSectors").insertMany([home, italy]);

    await applyBrandFacilityLoss(db as never, corpId, [italy]);

    const after = (await db.collection("corporations").findOne({ _id: corpId })) as {
      brandLoyalty: number;
    };
    // Half the company's revenue left. Summing raw numbers would call the
    // Italian site 99.9% of it and take the whole loss.
    const expected = Math.round(applyFacilityLoss(80, 0.5) * 100) / 100;
    expect(after.brandLoyalty).toBeCloseTo(expected, 2);
  });
});
