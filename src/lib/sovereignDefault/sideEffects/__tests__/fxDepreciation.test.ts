import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { applyExchangeRateDepreciation } from "../fxDepreciation";

describe("currency-wide sovereign depreciation", () => {
  it.each([
    [0.4, 140],
    [-0.1, 90],
    [0, 100],
  ])("applies %s from the authority quote", async (percent, expected) => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 100 }]);
    expect(await applyExchangeRateDepreciation(f.db, "US", percent)).toMatchObject({
      ok: true,
      previousRate: 100,
      newRate: expected,
    });
    expect(f.memory.collection("exchangeRates").docs[0].rate).toBe(expected);
  });
  it("returns a refusal for missing quotes and invalid resulting rates", async () => {
    const f = createTransactionalMemoryDb();
    expect((await applyExchangeRateDepreciation(f.db, "US", 0.4)).ok).toBe(false);
    f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 100 }]);
    expect((await applyExchangeRateDepreciation(f.db, "US", -1)).ok).toBe(false);
    expect(f.memory.collection("exchangeRates").docs[0].rate).toBe(100);
  });
  it("uses the euro authority for every member and preserves unrelated currencies", async () => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("exchangeRates", [
      { _id: "DE", currencyCode: "EUR", rate: 2 },
      { _id: "FR", currencyCode: "EUR", rate: 9 },
      { _id: "CA", currencyCode: "CAD", rate: 3 },
    ]);
    expect(await applyExchangeRateDepreciation(f.db, "FR", 0.1)).toMatchObject({
      previousRate: 2,
      newRate: 2.2,
    });
    expect(f.memory.collection("exchangeRates").docs.map((row) => row.rate)).toEqual([2.2, 2.2, 3]);
  });
});
