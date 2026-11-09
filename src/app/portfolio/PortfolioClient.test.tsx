/** @vitest-environment happy-dom */
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PortfolioClient from "./PortfolioClient";
import { fetchJson } from "@/lib/observability/fetchJson";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/hooks/useGameEvents", () => ({ useGameEvents: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/portfolio",
}));
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (value: number) => `M${value}` }),
}));
vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: vi.fn(),
  HttpError: class HttpError extends Error {},
}));
vi.mock("@/components/portfolio/StockHoldingsView", () => ({
  StockHoldingValues: () => null,
  StockHoldingsView: () => null,
}));
vi.mock("@/components/portfolio/PlayerIncomeTaxStatement", () => ({
  PlayerIncomeTaxStatement: () => null,
}));
vi.mock("@/components/BackButton", () => ({ default: () => null }));
afterEach(cleanup);
it("deducts loan debt from the portfolio payload when the loan-controls endpoint fails", async () => {
  vi.mocked(fetchJson).mockImplementation(async (url) => {
    if (String(url).includes("/loc")) throw new Error("Loan controls unavailable");
    return { character: { _id: "fixture", countryId: "US" }, fundPositions: [] };
  });
  render(
    <PortfolioClient
      initialPortfolio={{
        holdings: [],
        bondHoldings: [],
        totalValue: 0,
        totalBondValue: 0,
        totalFundValue: 250,
        cashOnHand: 1000,
        locDebtValue: 300,
        incomeTax: { unpaidTaxAnchor: 50 },
        history: [],
      }}
    />
  );
  expect((await screen.findAllByText("M900")).length).toBeGreaterThan(0);
});
