/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BalanceSheetRings, balanceSheetSegments } from "./BalanceSheetRings";
import type { BalanceSheet } from "../CorporationPageTypes";

const sheet = (over: Partial<BalanceSheet["assets"]> = {}, debt = 310, bondCount = 3) =>
  ({
    assets: {
      cashOnHand: 84.6,
      sectorNPVs: [],
      totalSectorNPV: 1040,
      bankValuation: 0,
      bankNPV: 0,
      bondHoldingsValue: 12.4,
      stockHoldingsValue: 63.4,
      fundHoldingsValue: 20,
      imfFacilityReceivablesValue: 0,
      imfFacilityReceivables: [],
      totalPortfolioValue: 95.8,
      heldBonds: [],
      techAssetValue: 0,
      totalAssets: 1220.4,
      ...over,
    },
    liabilities: { dailyCosts: 0, totalDebt: debt, dailyInterestCost: 0.6, bondCount },
    equity: { totalEquity: 1220.4 - debt, bookValue: 1220.4 - debt, marketCapitalization: 1270 },
  }) as unknown as BalanceSheet;

const fmt = (n: number) => `$${n.toFixed(1)}M`;

describe("balanceSheetSegments", () => {
  it("asset ring total equals the displayed total", () => {
    const { assets } = balanceSheetSegments(sheet(), fmt);
    const sum = assets.reduce((s, a) => s + a.value, 0);
    expect(Math.abs(sum - 1220.4) / 1220.4).toBeLessThan(0.005);
    expect(assets.map((a) => a.label)).toEqual([
      "Sector NPV",
      "Cash",
      "Stock holdings",
      "Index fund holdings",
      "Bond holdings",
    ]);
  });

  it("splits claims into bond debt and book value", () => {
    const { claims } = balanceSheetSegments(sheet(), fmt);
    expect(claims.map((c) => c.label)).toEqual(["Book value", "Bond debt, 3 issues"]);
    expect(claims[0].value).toBeCloseTo(910.4, 6);
    expect(claims[1].value).toBe(310);
  });
});

describe("BalanceSheetRings", () => {
  it("no-debt corporation shows a single book value segment and the no outstanding debt line", () => {
    render(<BalanceSheetRings sheet={sheet({}, 0, 0)} fmt={fmt} />);
    expect(screen.getByText("No outstanding debt")).toBeTruthy();
    expect(screen.getAllByText("100.0%").length).toBeGreaterThan(0);
  });

  it("shows both rings with their totals", () => {
    render(<BalanceSheetRings sheet={sheet()} fmt={fmt} />);
    expect(screen.getByRole("img", { name: /^Assets/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Liabilities and equity/ })).toBeTruthy();
    expect(screen.getByText("Total liabilities")).toBeTruthy();
  });
});
