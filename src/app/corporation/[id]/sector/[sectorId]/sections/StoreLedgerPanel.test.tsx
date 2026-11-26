/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { storeLedgerView } from "@/lib/stores/rules/storeLedgerView";
import StoreLedgerPanel from "./StoreLedgerPanel";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (value: number) => `M${Math.round(value)}` }),
}));

const ledger = storeLedgerView({
  turn: 9,
  turnsPerDay: 24,
  receipt: {
    store: {
      goodsBoughtWholesale: 1000,
      markupEarned: 150,
      wholesaleByCommodity: { food: 700, electronics: 300 },
    },
    profit: 30,
    labourPaid: 60,
    otherOperatingPaid: 40,
    inputsConsumed: 20,
  },
});

describe("StoreLedgerPanel", () => {
  it("shows each row on its own line, and the rows add up", () => {
    render(<StoreLedgerPanel ledger={ledger} />);
    expect(screen.getByText("Goods bought wholesale").nextSibling?.textContent).toBe("M1000");
    expect(screen.getByText("Markup earned").nextSibling?.textContent).toBe("+ M150");
    expect(screen.getByText("Sold to households").nextSibling?.textContent).toBe("M1150");
    expect(screen.getByText("Running costs").nextSibling?.textContent).toBe("- M120");
    expect(screen.getByText("Margin (markup minus running costs)").nextSibling?.textContent).toBe(
      "M30"
    );
    expect(ledger.soldToHouseholds).toBeCloseTo(ledger.goodsBoughtWholesale + ledger.markupEarned);
    expect(ledger.margin).toBeCloseTo(ledger.markupEarned - ledger.runningCosts);
    expect(ledger.runningCostRows.reduce((n, r) => n + r.value, 0)).toBeCloseTo(
      ledger.runningCosts
    );
  });

  it("breaks the wholesale goods out by commodity", () => {
    render(<StoreLedgerPanel ledger={ledger} />);
    expect(screen.getByText("Food Products")).toBeTruthy();
    expect(screen.getByText("Electronics & Semiconductors")).toBeTruthy();
  });
});
