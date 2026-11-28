/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FundFinancialsTab from "./FundFinancialsTab";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(cleanup);
it("labels the limited dividend window without calling capital movements profit", () => {
  const transactions = [
    { kind: "bond_allocation", amountAnchor: 1_000_000 },
    { kind: "redemption_queued", amountAnchor: 500_000 },
    { kind: "dividend_reinvest", amountAnchor: 30 },
    { kind: "dividend_pass_through", amountAnchor: 70 },
  ].map((row, index) => ({
    ...row,
    id: String(index),
    turn: 1,
    navAnchor: null,
    units: null,
    shares: null,
    corporationId: null,
    note: null,
    createdAt: "2026-01-01",
  }));
  render(
    <FundFinancialsTab
      financials={{ fundId: "test", anchorCurrencyCode: "USD", transactions }}
      balanceSheet={null}
      formatAmount={String}
      ccy="USD"
    />
  );
  expect(screen.getByText("Recorded investment income")).toBeTruthy();
  expect(screen.getByText(/not a complete profit statement/)).toBeTruthy();
  expect(screen.getByText("Dividends retained")).toBeTruthy();
  expect(screen.getAllByText("30")).toHaveLength(2);
  expect(screen.queryByText("1000000")).toBeNull();
  expect(screen.queryByText("500000")).toBeNull();
  expect(screen.queryByText("Net income")).toBeNull();
});
