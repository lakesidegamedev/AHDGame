/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BondHistoryPanel from "./BondHistoryPanel";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (n: number, code?: string) => `A${Math.round(n)}${code ? ` ${code}` : ""}`,
    formatPrice: (n: number) => `P${n.toFixed(2)}`,
    formatFull: (n: number) => `A${n}`,
    formatPriceOrder: (n: number) => `P${n}`,
    formatAmountChip: (n: number) => `A${n}`,
    formatListingPrice: (n: number) => `P${n}`,
    // One pound is two anchor units in these tests.
    toInternalFrom: (n: number, code?: string) => (code === "GBP" ? n * 2 : n),
  }),
}));
vi.mock("@/components/time/LocalTime", () => ({ LocalTime: () => <time>date</time> }));
vi.mock("./hooks/useBondHistory", () => ({
  useBondHistory: () => ({
    entries: [
      {
        id: "e1",
        type: "bond_coupon",
        turn: 40,
        createdAt: "2026-01-01T00:00:00.000Z",
        amount: 120,
        anchorAmount: 240,
        currencyCode: "GBP",
      },
      {
        id: "e2",
        type: "bond_coupon",
        turn: 40,
        createdAt: "2026-01-01T00:00:00.000Z",
        amount: -20,
        anchorAmount: -40,
        currencyCode: "GBP",
      },
    ],
    pageCount: 1,
    totalTurns: 1,
    windowTurns: 48,
    serverPage: 1,
    loading: false,
    error: null,
  }),
}));

describe("BondHistoryPanel", () => {
  it("shows the turn net in the display currency, with no ₳", () => {
    const { container } = render(<BondHistoryPanel corpId="c1" />);
    expect(screen.getByText("+A200")).toBeTruthy();
    expect(container.textContent).not.toContain("₳");
  });
});
