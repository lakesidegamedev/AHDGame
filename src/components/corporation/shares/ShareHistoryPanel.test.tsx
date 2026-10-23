/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShareHistoryPanel from "./ShareHistoryPanel";

const { useShareHistory } = vi.hoisted(() => ({ useShareHistory: vi.fn() }));

vi.mock("./hooks", () => ({ useShareHistory }));
vi.mock("@/components/time/LocalTime", () => ({ LocalTime: () => <time>Trade date</time> }));
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

describe("ShareHistoryPanel", () => {
  beforeEach(() => {
    useShareHistory.mockReset();
  });

  it("renders legacy trade rows whose anchor amounts are null", () => {
    useShareHistory.mockReturnValue({
      entries: [
        {
          id: "legacy-trade",
          kind: "market_buy",
          turn: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          shares: 4,
          pricePerShareAnchor: null,
          totalAnchor: null,
          from: null,
          to: { name: "Investor", characterId: "character-1" },
        },
      ],
      total: 1,
      pageCount: 1,
      loading: false,
      error: null,
    });

    render(<ShareHistoryPanel corpId="corp-1" />);

    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  });

  it("prices trades in the display currency, with no ₳", () => {
    useShareHistory.mockReturnValue({
      entries: [
        {
          id: "trade",
          kind: "market_buy",
          turn: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          shares: 4,
          pricePerShareAnchor: 12.5,
          totalAnchor: 50,
          from: null,
          to: { name: "Investor", characterId: "character-1" },
        },
      ],
      total: 1,
      pageCount: 1,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    const { container } = render(<ShareHistoryPanel corpId="c1" />);
    expect(screen.getByText("P12.50")).toBeTruthy();
    expect(screen.getByText("A50")).toBeTruthy();
    expect(container.textContent).not.toContain("₳");
  });
});
