import { describe, expect, it } from "vitest";
import { ECONOMY_BANKING_CHARTS } from "./economyBanking";
import { ECONOMY_DEBT_CHARTS } from "./economyBankingDebt";
import { expectValidChart } from "./chartTestUtils";
import { ARREARS_DEFAULT_TURNS } from "@/lib/banking/rules/loans";
import { savingsApyPercent, SAVINGS_REAL_RATE_FLOOR_PERCENT } from "@/lib/currency/savingsInterest";
import {
  spreadPercentPointsFromComposite,
  PRIME_STRESS_BASELINE_PERCENT,
} from "@/lib/lineOfCredit/creditMath";
import { DEBT_THRESHOLDS, getDebtThreshold } from "@/lib/budget/debt";
import { calculateBondMarketPrice } from "@/lib/constants/bonds";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { NPC_DEPOSIT_MAX_EQUITY_LEVERAGE } from "@/lib/banking/rules/balanceSheet";

describe("banking and debt wiki charts", () => {
  it("every chart is valid", () => {
    for (const [id, b] of Object.entries({ ...ECONOMY_BANKING_CHARTS, ...ECONOMY_DEBT_CHARTS })) {
      expectValidChart(id, b());
    }
  });

  it("arrears chart marks the write-off turn", () => {
    const spec = ECONOMY_BANKING_CHARTS["interbank-arrears-write-off"]();
    expect(spec.markers?.[0].x).toBe(ARREARS_DEFAULT_TURNS);
    const pts = spec.series[0].points;
    expect(pts.find((p) => p[0] === ARREARS_DEFAULT_TURNS)?.[1]).toBe(1);
    expect(pts.find((p) => p[0] === ARREARS_DEFAULT_TURNS - 1)?.[1]).toBe(0);
  });

  it("savings chart matches the APY function and floor", () => {
    const spec = ECONOMY_BANKING_CHARTS["savings-apy-by-inflation"]();
    expect(spec.markers?.[0].y).toBe(SAVINGS_REAL_RATE_FLOOR_PERCENT / 2);
    const prime8 = spec.series.find((s) => s.name === "Prime 8%")!;
    for (const [x, y] of prime8.points) expect(y).toBeCloseTo(savingsApyPercent(8, x), 3);
  });

  it("line of credit rate is prime plus the game spread", () => {
    const spec = ECONOMY_BANKING_CHARTS["line-of-credit-rate-by-score"]();
    const prime3 = spec.series.find((s) => s.name === "Prime 3%")!;
    for (const [x, y] of prime3.points)
      expect(y).toBeCloseTo(3 + spreadPercentPointsFromComposite(x), 3);
  });

  it("prime penalty starts at the baseline prime", () => {
    const spec = ECONOMY_BANKING_CHARTS["line-of-credit-prime-penalty"]();
    expect(spec.markers?.[0].x).toBe(PRIME_STRESS_BASELINE_PERCENT);
    const s0 = spec.series[0].points;
    expect(s0.find((p) => p[0] === PRIME_STRESS_BASELINE_PERCENT)?.[1]).toBe(0);
    expect(s0[s0.length - 1][1]).toBeGreaterThan(0);
  });

  it("rating ladder rate and markers come from the thresholds", () => {
    const spec = ECONOMY_DEBT_CHARTS["credit-rating-borrowing-ladder"]();
    for (const [x, y] of spec.series[0].points) {
      expect(y).toBeCloseTo(getDebtThreshold(x / 100).interestRate * 100, 3);
    }
    const finite = DEBT_THRESHOLDS.filter((t) => Number.isFinite(t.maxRatio));
    expect(spec.markers?.map((m) => m.x)).toEqual(
      finite.map((t) => Math.round(t.maxRatio * 10000) / 100)
    );
  });

  it("bond price chart equals the pricing function", () => {
    const spec = ECONOMY_DEBT_CHARTS["corporate-bond-price-by-market-rate"]();
    const s = spec.series.find((x) => x.name === "3 years left")!;
    for (const [x, y] of s.points)
      expect(y).toBe(calculateBondMarketPrice(8.75, x, 3 * TURNS_PER_YEAR, false));
  });

  it("deposit ceiling flattens at capacity and rises at the equity leverage", () => {
    const spec = ECONOMY_BANKING_CHARTS["bank-deposit-ceiling-vs-equity"]();
    const eq = spec.series.find((s) => s.name === "Equity limit")!.points[2];
    expect(eq[1]).toBe(eq[0] * NPC_DEPOSIT_MAX_EQUITY_LEVERAGE);
  });
});
