import { beforeEach, describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { authoritativeCurrencyRates } from "./rules/authoritativeCurrencyRates";
import {
  getCorpFxRate,
  getCurrencyFxRate,
  getSectorHostFxRate,
  loadFxRatesByCurrency,
  resetCorpFxRateCacheForTests,
} from "./corporationCapital";
import { loadConversionQuoteContext } from "./euro/quotes";

describe("shared currency quote authority", () => {
  beforeEach(resetCorpFxRateCacheForTests);
  const authority = { _id: "DE", currencyCode: "EUR", rate: 2, forexSpreadStrength: 3 };
  const follower = { _id: "IE", currencyCode: "EUR", rate: 1, forexSpreadStrength: 9 };
  it.each([
    [authority, follower],
    [follower, authority],
  ])("uses the monetary authority independent of cursor order", async (first, second) => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("gameState", [{ _id: "current", worldEpochId: "world", preset: "2027-default" }]);
    f.memory.seed("exchangeRates", [first, second]);
    expect(await getCorpFxRate(f.db, { liquidCurrencyCode: "EUR" })).toBe(2);
    expect(await getCurrencyFxRate(f.db, "EUR")).toBe(2);
    expect(await getSectorHostFxRate(f.db, { countryId: "DE" }, {})).toBe(2);
    expect((await loadFxRatesByCurrency(f.db)).get("EUR")).toBe(2);
    const context = await loadConversionQuoteContext(f.db);
    expect(context.quotes.get("EUR")).toMatchObject({ rate: 2, forexSpreadStrength: 3 });
  });
  it("refuses conflicting followers without inventing an authority quote", async () => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("exchangeRates", [follower, { ...follower, _id: "FR", rate: 4 }]);
    expect(
      authoritativeCurrencyRates([follower, { ...follower, _id: "FR", rate: 4 }]).get("EUR")
    ).toBeNaN();
    await expect(getCurrencyFxRate(f.db, "EUR")).rejects.toThrow("Exchange rate unavailable");
  });
  it("never replaces an invalid authority with a valid follower or authored rate", async () => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("exchangeRates", [{ ...authority, rate: 0 }, follower]);
    await expect(getCurrencyFxRate(f.db, "EUR")).rejects.toThrow("Exchange rate unavailable");
  });
  it("accepts an unambiguous legacy quote without fixing USD to parity", () => {
    expect(
      authoritativeCurrencyRates([{ _id: "USD", currencyCode: "USD", rate: 1.25 }]).get("USD")
    ).toBe(1.25);
  });
});
