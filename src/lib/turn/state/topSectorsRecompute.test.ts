import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { processTopSectorsRecompute } from "./topSectorsRecompute";

describe("processTopSectorsRecompute", () => {
  it("ranks sectors by anchor revenue when owners store money in different currencies", async () => {
    const db = createInMemoryDb();
    const canadian = new ObjectId();
    const italian = new ObjectId();
    await db.collection("exchangeRates").insertMany([
      { _id: "CA", countryId: "CA", currencyCode: "CAD", rate: 1.4 },
      { _id: "IT", countryId: "IT", currencyCode: "EUR", rate: 0.93 },
      // No live row exists for the era-blind currency; the engine books foreign
      // Italian sites at its authored rate.
      { _id: "ITL", countryId: "ITL", currencyCode: "ITL", rate: 833 },
    ]);
    await db.collection("corporations").insertMany([
      { _id: canadian, countryId: "CA", liquidCurrencyCode: "CAD" },
      { _id: italian, countryId: "IT", liquidCurrencyCode: "EUR" },
    ]);
    await db.collection("states").insertOne({ _id: "IT_NE", name: "Northeast" });
    await db.collection("corporateSectors").insertMany([
      // 833,000,000 ITL is 1,000,000 anchor.
      {
        corporationId: canadian,
        stateId: "IT_NE",
        countryId: "IT",
        sectorType: "agriculture",
        revenue: 833_000_000,
      },
      // 93,000,000 EUR is 100,000,000 anchor: ten times the foreign site above.
      {
        corporationId: italian,
        stateId: "IT_NE",
        countryId: "IT",
        sectorType: "manufacturing",
        revenue: 93_000_000,
      },
    ]);

    await processTopSectorsRecompute(db as never, 10);

    const state = await db.collection("states").findOne({ _id: "IT_NE" });
    const top = (
      state as { topSectorsCache: { sectors: { sectorType: string; revenue: number }[] } }
    ).topSectorsCache.sectors;
    expect(top.map((s) => s.sectorType)).toEqual(["manufacturing", "agriculture"]);
    expect(top[0]!.revenue).toBeCloseTo(100_000_000, -2);
    expect(top[1]!.revenue).toBeCloseTo(1_000_000, -2);
  });
});
