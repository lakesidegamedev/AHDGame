import { describe, expect, it } from "vitest";
import { computeRateUpdate } from "@/lib/currency/rateCalculation";
import { defenceLiquidity, planDefenceFunding, quoteDefence, type DefenceMarket } from "./defence";
const market: DefenceMarket = {
  rawRate: 1.03,
  organicPressure: 0,
  hardFloor: 0.5,
  hardCeiling: 1.5,
  homeRate: 1,
  marketDepthAnchor: 20_000_000,
  adherence: 1,
};
const band = { floor: 0.99, ceiling: 1 };
describe("funded useful FX defence", () => {
  it("matches settlement's rate pipeline across US, UK and JP flow directions", () => {
    for (const country of ["US", "UK", "JP"] as const)
      for (const net of [-100000000, 0, 100000000])
        for (const direction of ["buy", "sell"] as const) {
          const macro = { primeRate: 2, inflationRate: 2, gdpGrowth: 2, tradeGrowth: 2 };
          const volumes = { buyVolume24: Math.max(0, net), sellVolume24: Math.max(0, -net) };
          const unassisted = computeRateUpdate(
            1,
            1,
            country,
            macro,
            volumes,
            0,
            1,
            0,
            1995,
            0.75,
            1.5
          );
          const p =
            direction === "buy"
              ? { floor: unassisted.rate * 0.98, ceiling: unassisted.rate * 0.999 }
              : { floor: unassisted.rate * 1.001, ceiling: unassisted.rate * 1.02 };
          const q = quoteDefence(
            {
              ...market,
              rawRate: unassisted.unclampedRate!,
              organicPressure: unassisted.volumePressure,
              hardFloor: 0.25,
              hardCeiling: 1.75,
            },
            p,
            1e9
          )!;
          const result = computeRateUpdate(
            1,
            1,
            country,
            macro,
            { ...volumes, syntheticNet: q.syntheticVolume },
            0,
            1,
            0,
            1995,
            0.75,
            1.5
          );
          expect(result.rate).toBeCloseTo(q.projectedRate, 12);
        }
  });
  it("does not charge for a correction hidden by hard guardrails", () => {
    const q = quoteDefence({ ...market, rawRate: 3 }, { floor: 1.3, ceiling: 1.4 }, 1e9)!;
    expect(q.projectedRate).toBe(1.5);
    expect(q.spendAnchor).toBe(0);
  });
  it("stops spending at the useful impact cap", () => {
    const q = quoteDefence(market, band, 100_000_000)!;
    expect(q.spendAnchor).toBeCloseTo(200_000);
    expect(q.projectedRate).toBeCloseTo(1.0197);
  });
  it("never overshoots even a very narrow band", () => {
    const q = quoteDefence(
      { ...market, rawRate: 1.001 },
      { floor: 0.9995, ceiling: 1.0005 },
      100_000_000
    )!;
    expect(q.projectedRate).toBeCloseTo(1.0005, 12);
    expect(q.inBand).toBe(true);
    expect(q.spendAnchor).toBeLessThan(10_000);
  });
  it("tolerates small deviations from a point peg", () => {
    expect(
      quoteDefence({ ...market, rawRate: 1.0001 }, { floor: 1, ceiling: 1 }, 1000)!.spendAnchor
    ).toBe(0);
  });
  it("honors explicit home-currency and automatic reserve budgets", () => {
    expect(
      quoteDefence({ ...market, homeRate: 100 }, { ...band, maxSpendPerTurn: 5000 }, 100_000)!
        .spendAnchor
    ).toBe(50);
    expect(quoteDefence(market, band, 1000)!.spendAnchor).toBe(100);
  });
  it("prices deep markets and lost credibility rather than ignoring them at saturation", () => {
    expect(
      quoteDefence({ ...market, marketDepthAnchor: 200_000_000 }, band, 1e9)!.spendAnchor
    ).toBeCloseTo(2_000_000, 6);
    expect(quoteDefence({ ...market, adherence: 0.7 }, band, 1e9)!.projectedRate).toBeGreaterThan(
      quoteDefence(market, band, 1e9)!.projectedRate
    );
  });
  it("rejects invalid inputs and prices zero-budget commitments without spending", () => {
    expect(quoteDefence({ ...market, rawRate: NaN }, band, 1)).toBeNull();
    expect(quoteDefence(market, { ...band, maxSpendPerTurn: 0 }, 1e6)!.spendAnchor).toBe(0);
  });
  it("conserves both directions and distinguishes home and foreign liquidity", () => {
    const r = {
      homeCurrency: "GBP",
      rates: { GBP: 0.5, USD: 1 },
      balances: { USD: 1000, GBP: 200 },
      forexRevenue: 300,
      reserveBalance: 500,
    };
    expect(defenceLiquidity(r)).toEqual({ buy: 1000, sell: 2000 });
    for (const direction of ["buy", "sell"] as const) {
      const p = planDefenceFunding(r, direction, 800, 0.5);
      const anchor =
        Object.entries(p.spreadFeeReserveDeltas).reduce(
          (s, [currency, delta]) => s + delta / r.rates[currency as keyof typeof r.rates],
          0
        ) +
        (p.forexRevenueDelta + p.reserveBalanceDelta) / 0.5;
      expect(anchor).toBeCloseTo(0);
      expect(p.availableInternal).toBe(800);
    }
  });
  it("does not debit a sale without a priced counter-currency", () => {
    expect(
      defenceLiquidity({
        homeCurrency: "GBP",
        rates: { GBP: 1 },
        balances: {},
        forexRevenue: 1000,
        reserveBalance: 1000,
      })
    ).toEqual({ buy: 0, sell: 0 });
    expect(
      planDefenceFunding(
        {
          homeCurrency: "GBP",
          rates: { GBP: 1 },
          balances: {},
          forexRevenue: 1000,
          reserveBalance: 1000,
        },
        "sell",
        100,
        1
      ).availableInternal
    ).toBe(0);
  });
  it("never reconstructs a full-pool debit above the stored balance", () => {
    for (let cents = 1; cents <= 9; cents++)
      for (let rateCents = 1; rateCents < 100; rateCents++) {
        const balance = cents / 100,
          rate = rateCents / 100;
        const buy = planDefenceFunding(
          {
            homeCurrency: "GBP",
            rates: { USD: rate, GBP: 1 },
            balances: { USD: balance },
            forexRevenue: 0,
            reserveBalance: 0,
          },
          "buy",
          1000,
          1
        );
        expect(-buy.spreadFeeReserveDeltas.USD).toBeLessThanOrEqual(balance);
        const sell = planDefenceFunding(
          {
            homeCurrency: "GBP",
            rates: { USD: 1, GBP: rate },
            balances: { GBP: balance },
            forexRevenue: balance,
            reserveBalance: balance,
          },
          "sell",
          1000,
          rate
        );
        expect(-sell.spreadFeeReserveDeltas.GBP).toBeLessThanOrEqual(balance);
        expect(-sell.forexRevenueDelta).toBeLessThanOrEqual(balance);
        expect(-sell.reserveBalanceDelta).toBeLessThanOrEqual(balance);
      }
  });
});
