// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StateBudgetSection } from "./StateBudgetSection";

vi.mock("./BudgetSummaryCard", () => ({
  BudgetSummaryCard: ({ label, value }: { label: string; value: number }) => (
    <div>
      {label}: {value}
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows zero annual surplus and accumulated cash as separate measures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: async () => ({
        budget: {
          fiscalYear: 2027,
          balance: 125,
          surplus: 0,
          revenue: { total: 100 },
          spending: { total: 100, byCategory: { education: 100 } },
        },
        grantBreakdown: [{ program: "Medicaid", amount: 10 }],
        grantBreakdownNote: "Estimated program split.",
      }),
    })
  );
  render(<StateBudgetSection stateId="TX" countryId="US" regionCode="TX" />);
  expect(await screen.findByText("Annual surplus / deficit: 0")).toBeTruthy();
  expect(screen.getByText("Cash balance: 125")).toBeTruthy();
  expect(screen.getByText("Estimated program split.")).toBeTruthy();
});

it("lists debt and annual interest payments separately from programme costs", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: async () => ({
        budget: {
          fiscalYear: 2027,
          balance: 0,
          surplus: -5_000_000,
          financing: { principal: 100_000_000 },
          revenue: { total: 100_000_000 },
          spending: {
            total: 105_000_000,
            interestPayments: 5_000_000,
            byCategory: { education: 100_000_000 },
          },
        },
        grantBreakdown: [],
      }),
    })
  );
  render(<StateBudgetSection stateId="TX" countryId="US" regionCode="TX" />);
  expect(await screen.findByText("Debt: 100000000")).toBeTruthy();
  const line = screen.getByText("Interest payments").parentElement!;
  expect(line.textContent).toContain("$5.0M");
});
