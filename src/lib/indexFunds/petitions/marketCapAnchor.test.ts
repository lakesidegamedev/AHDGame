import { describe, expect, it, vi } from "vitest";

const rates: Record<string, number> = { JPY: 121 };
const rateReads = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/currency/corporationCapital", async (orig) => ({
  ...(await orig<typeof import("@/lib/currency/corporationCapital")>()),
  getCorpFxRate: async (_db: unknown, corp: { liquidCurrencyCode?: string }) => {
    rateReads.count += 1;
    return (corp.liquidCurrencyCode && rates[corp.liquidCurrencyCode]) || 1;
  },
}));

import { marketCapInAnchor } from "./service";

describe("marketCapInAnchor", () => {
  const db = {} as never;
  it("converts a non-anchor currency corp to anchor", async () => {
    const cap = await marketCapInAnchor(db, {
      sharePrice: 1210,
      totalShares: 1000,
      liquidCurrencyCode: "JPY",
      countryId: "JP",
    } as never);
    expect(cap).toBeCloseTo(10000, 6);
  });
  it("leaves a corp without a home currency unchanged", async () => {
    const cap = await marketCapInAnchor(db, {
      sharePrice: 10,
      totalShares: 1000,
      countryId: "US",
    } as never);
    expect(cap).toBe(10000);
  });
  it("reads each currency's rate once when valuing a pool", async () => {
    rateReads.count = 0;
    const shared = new Map<string, Promise<number>>();
    const corp = { sharePrice: 1210, totalShares: 1000, liquidCurrencyCode: "JPY", countryId: "JP" };
    const caps = await Promise.all(
      [corp, corp, corp].map((c) => marketCapInAnchor(db, c as never, shared))
    );
    expect(caps.every((cap) => Math.abs(cap - 10000) < 1e-6)).toBe(true);
    expect(rateReads.count).toBe(1);
  });
});
