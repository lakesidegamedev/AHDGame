import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  loadOwnerCurrencyInfo,
  sectorMoneyAnchor,
  sectorMoneyInCorpCurrency,
} from "./sectorRevenueScale";

const fx = new Map<CurrencyCode, number>([
  ["CAD", 1.4],
  ["EUR", 0.93],
  ["ITL", 833],
]);
const canadian = { countryId: "CA", liquidCurrencyCode: "CAD" };
const italian = { countryId: "IT", liquidCurrencyCode: "EUR" };

describe("sector money across host currencies", () => {
  it("reads a foreign site in the host's era-blind currency, not the owner's", () => {
    // A Canadian company's Italian site books 833 per anchor; reading it as EUR
    // (0.93) made it look 896 times larger than it is.
    expect(sectorMoneyAnchor(833_000, { countryId: "IT" }, canadian, fx)).toBeCloseTo(1_000);
  });

  it("reads a domestic site in the owner's stamped currency", () => {
    expect(sectorMoneyAnchor(930, { countryId: "IT" }, italian, fx)).toBeCloseTo(1_000);
    expect(sectorMoneyAnchor(1_400, { countryId: "CA" }, canadian, fx)).toBeCloseTo(1_000);
  });

  it("puts the same output from either owner on the same anchor value", () => {
    const foreign = sectorMoneyAnchor(8_330, { countryId: "IT" }, canadian, fx);
    const domestic = sectorMoneyAnchor(9.3, { countryId: "IT" }, italian, fx);
    expect(foreign).toBeCloseTo(10);
    expect(domestic).toBeCloseTo(10);
  });

  it("restates a foreign site in the owner's home currency", () => {
    expect(sectorMoneyInCorpCurrency(833_000, { countryId: "IT" }, canadian, fx)).toBeCloseTo(
      1_400
    );
  });

  it("sums a mixed footprint in one unit", () => {
    const rows = [
      { revenue: 1_400, countryId: "CA" },
      { revenue: 833_000, countryId: "IT" },
    ];
    const total = rows.reduce((n, r) => n + sectorMoneyAnchor(r.revenue, r, canadian, fx), 0);
    expect(total).toBeCloseTo(2_000);
  });

  it("loads currency facts for the owners that exist", async () => {
    const db = createInMemoryDb();
    const id = new ObjectId();
    await db.collection("corporations").insertOne({
      _id: id,
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      name: "x",
    });
    const info = await loadOwnerCurrencyInfo(db as never, [id, new ObjectId()]);
    expect(info.size).toBe(1);
    expect(info.get(String(id))).toEqual({ countryId: "CA", liquidCurrencyCode: "CAD" });
  });
});
