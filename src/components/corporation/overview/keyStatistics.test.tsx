/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { revenueSplit } from "./keyStatisticsModel";
import { KeyStatistics, type KeyStatisticsProps } from "./KeyStatistics";

const money = {
  code: "USD" as const,
  toAnchor: (n: number) => n,
  fmt: (n: number) => `$${Math.round(n)}`,
  fmtFull: (n: number) => `$${Math.round(n)}.00`,
  fmtSigned: (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.round(Math.abs(n))}`,
  fmtPrice: (n: number) => `$${n.toFixed(2)}`,
};

const financials = {
  totalRevenue: 48.2,
  totalCosts: 42.1,
  operatingIncome: 6.1,
  effectiveDividendRate: 35,
  currentGrowthRate: 3.2,
  growthRateIsRealized: true,
};
const basis = { netIncome: 4.4, dividendPaid: 1.5, retained: 2.9, isRealized: true };

function props(overrides: Partial<KeyStatisticsProps> = {}): KeyStatisticsProps {
  return {
    corporation: {
      sharePrice: 42.18,
      marketCapitalization: 1270,
      totalShares: 30_100_000,
      publicFloat: 18_782_400,
      isPrivate: false,
      liquidCapital: 84.6,
      dividendRate: 35,
      equityMarketPoolActive: true,
      marketBidPrice: 42.05,
      marketAskPrice: 42.31,
    } as KeyStatisticsProps["corporation"],
    financials: financials as KeyStatisticsProps["financials"],
    basis,
    netMargin: 9.1,
    currentGrowthRate: 3.2,
    balanceSheet: {
      equity: { bookValue: 910, totalEquity: 910, marketCapitalization: 1270 },
      assets: { totalAssets: 1220 },
    } as KeyStatisticsProps["balanceSheet"],
    bondInfo: {
      totalDebt: 310,
      bonds: [],
      creditRating: { rating: "A", effectiveCouponRate: 4.75 },
    } as unknown as KeyStatisticsProps["bondInfo"],
    leverageRating: "A",
    creditComposite: 74,
    activeBonds: 3,
    money,
    periodView: "turn",
    fogged: false,
    canSeeMarket: true,
    isCeo: false,
    onTabChange: vi.fn(),
    cashAccent: undefined,
    ...overrides,
  };
}

describe("revenueSplit", () => {
  it("interest and tax is operating minus net income", () => {
    const split = revenueSplit(financials, basis)!;
    expect(split.interestAndTax).toBeCloseTo(1.7, 5);
    expect(split.costs).toBe(42.1);
    expect(split.dividends).toBe(1.5);
    expect(split.retained).toBe(2.9);
  });

  it("is null at zero revenue", () => {
    expect(revenueSplit({ ...financials, totalRevenue: 0 }, basis)).toBeNull();
  });

  it("is null for a loss-making period, where the parts no longer add up to revenue", () => {
    expect(revenueSplit(financials, { ...basis, netIncome: -2, retained: -3.5 })).toBeNull();
  });
});

describe("KeyStatistics", () => {
  it("draws the three ledger columns with their charts", () => {
    render(<KeyStatistics {...props()} />);
    expect(screen.getByRole("heading", { name: "Market" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Earnings" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Balance sheet" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Market cap .* against book value/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Where revenue goes" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Rating scale/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Cash .* against total debt/ })).toBeTruthy();
  });

  it("no earnings chart at zero revenue", () => {
    render(
      <KeyStatistics
        {...props({
          financials: { ...financials, totalRevenue: 0 } as KeyStatisticsProps["financials"],
        })}
      />
    );
    expect(screen.queryByRole("img", { name: "Where revenue goes" })).toBeNull();
  });

  it("fogged values carry a tilde", () => {
    render(<KeyStatistics {...props({ fogged: true })} />);
    expect(screen.getAllByText(/^~\$/).length).toBeGreaterThan(0);
  });

  it("market vs book hidden when book value is null", () => {
    render(<KeyStatistics {...props({ balanceSheet: null })} />);
    expect(screen.queryByRole("img", { name: /against book value/ })).toBeNull();
  });

  it("hides market figures from a viewer who cannot see the market", () => {
    render(<KeyStatistics {...props({ canSeeMarket: false })} />);
    expect(screen.queryByText("Share price")).toBeNull();
    expect(screen.queryByRole("img", { name: /against book value/ })).toBeNull();
  });
});
