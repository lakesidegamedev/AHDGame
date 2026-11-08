import { describe, expect, it } from "vitest";
import {
  baselineProvider,
  bondYieldPressureProvider,
  growthGapProvider,
  policyRateGapProvider,
  safetyNetGapProvider,
  unemploymentGapProvider,
  unrestGapProvider,
} from "./inputProviders";
import type { CrisisInputContext } from "./registry";

function makeCtx(data: Record<string, unknown[]>): CrisisInputContext {
  const db = {
    collection: (name: string) => ({
      find: () => ({ toArray: async () => data[name] ?? [] }),
      findOne: async () => null,
    }),
  };
  return {
    db: db as never,
    turn: 5,
    countryIds: new Set(["US"]),
    stateIdsByCountry: new Map([["US", ["tx", "oh"]]]),
  };
}

describe("crisis input providers", () => {
  it("reads economic gaps from macroMetrics, not the political store", async () => {
    const ctx = makeCtx({
      macroMetrics: [
        { _id: "tx", economic: { unemploymentRate: { value: 10 }, gdpGrowth: { value: -1 } } },
        { _id: "oh", economic: { unemploymentRate: { value: 8 }, gdpGrowth: { value: 1 } } },
      ],
      stateMetrics: [{ _id: "tx", economic: { unemploymentRate: { value: 99 } } }],
    });
    expect((await unemploymentGapProvider.load(ctx)).get("US")).toBeCloseTo(3);
    expect((await growthGapProvider.load(ctx)).get("US")).toBeCloseTo(2);
  });

  it("makes more safety-net spending read as a lower gap", async () => {
    const lean = makeCtx({
      federalBudget: [{ countryId: "US", gdp: 1000, spending: { byCategory: { welfare: 30 } } }],
    });
    const generous = makeCtx({
      federalBudget: [
        {
          countryId: "US",
          gdp: 1000,
          spending: { byCategory: { welfare: 50, socialSecurity: 40 } },
        },
      ],
    });
    const leanGap = (await safetyNetGapProvider.load(lean)).get("US") as number;
    const generousGap = (await safetyNetGapProvider.load(generous)).get("US") as number;
    expect(leanGap).toBeCloseTo(-3);
    expect(generousGap).toBeCloseTo(3);
    expect(generousGap).toBeGreaterThan(leanGap);
  });

  it("sizes the safety-net share against the smoothed GDP the budget uses", async () => {
    const ctx = makeCtx({
      federalBudget: [
        {
          countryId: "US",
          gdp: 500,
          gdpSmoothed: 1000,
          spending: { byCategory: { welfare: 30, socialSecurity: 30 } },
        },
      ],
    });
    expect((await safetyNetGapProvider.load(ctx)).get("US")).toBeCloseTo(0);
  });

  it("converts investor confidence into a borrowing premium in basis points", async () => {
    const ctx = makeCtx({
      federalBudget: [{ countryId: "US", gdp: 1000, investorConfidence: 35 }],
    });
    expect((await bondYieldPressureProvider.load(ctx)).get("US")).toBeCloseTo(150);
    const calm = makeCtx({
      federalBudget: [{ countryId: "US", gdp: 1000, investorConfidence: 80 }],
    });
    expect((await bondYieldPressureProvider.load(calm)).get("US")).toBe(0);
  });

  it("reads the central bank rate and public mood against normal", async () => {
    const ctx = makeCtx({
      centralBanks: [{ countryId: "US", primeRate: 6.5 }],
      governmentApprovals: [{ _id: "US", approvalRating: 25 }],
    });
    expect((await policyRateGapProvider.load(ctx)).get("US")).toBeCloseTo(3);
    expect((await unrestGapProvider.load(ctx)).get("US")).toBeCloseTo(15);
  });

  it("supplies a constant baseline", async () => {
    expect((await baselineProvider.load(makeCtx({}))).get("US")).toBe(1);
  });
});
