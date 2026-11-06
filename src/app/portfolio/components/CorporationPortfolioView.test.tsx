/** @vitest-environment happy-dom */
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CorporationPortfolioView from "./CorporationPortfolioView";
vi.mock("@/hooks/useGameEvents", () => ({ useGameEvents: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/portfolio",
}));
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (value: number) => `M${value}` }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows index funds in the corporate total, itemized overview and holdings tab", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        corporationName: "Fixture",
        stockHoldings: [],
        bondHoldings: [],
        totalStockValue: 0,
        totalBondValue: 0,
        totalFundValue: 250,
        fundHoldings: [
          { fundId: "fixture-fund", name: "Fixture Fund", units: 10, valueAnchor: 250 },
        ],
        totalLiabilityValue: 100,
        grossPortfolioValue: 1250,
        cashOnHand: 1000,
        totalPortfolioValue: 1150,
        totalCouponIncomePerTurn: 0,
        history: [],
      }),
    })
  );
  render(<CorporationPortfolioView corpRouteId="1" isCeo={false} />);
  expect(await screen.findByText("Fixture Portfolio")).toBeTruthy();
  expect(screen.getAllByText("M1150").length).toBeGreaterThan(0);
  expect(screen.getAllByText("M250").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /Index funds/ }));
  expect(screen.getByText("Index fund holdings")).toBeTruthy();
  expect(screen.getByText(/Fixture Fund: 10 units/)).toBeTruthy();
});
