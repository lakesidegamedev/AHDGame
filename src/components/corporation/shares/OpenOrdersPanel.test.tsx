/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import OpenOrdersPanel from "./OpenOrdersPanel";
import type { MarketOrder } from "../CorporationPageTypes";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatPriceOrder: (n: number) => `$${n.toFixed(2)}`,
    formatAmount: (n: number) => `$${n}`,
    toInternalFrom: (n: number) => n,
  }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const order = (id: string, type: "buy" | "sell", sharesRemaining: number) =>
  ({
    _id: id,
    type,
    sharesRemaining,
    pricePerShare: 10,
    characterName: `Holder ${id}`,
    isMine: false,
  }) as unknown as MarketOrder;

function show(orders: MarketOrder[]) {
  render(
    <OpenOrdersPanel
      marketOrders={orders}
      myCharacterId={null}
      myCorporation={null}
      fillAmounts={{}}
      setFillAmounts={vi.fn()}
      fillAskAsCorp={false}
      setFillAskAsCorp={vi.fn()}
      loading={false}
      handleFillOrder={vi.fn()}
      handleCancelOrder={vi.fn()}
    />
  );
}

const depth = (holder: string) =>
  within(screen.getByText(`Holder ${holder}`).closest("tr")!)
    .getByText(/^\d/, { selector: "span[data-shares]" })
    .parentElement!.querySelector<HTMLElement>("[data-fill]")!.style.width;

describe("OpenOrdersPanel", () => {
  it("depth bars scale to the largest open order", () => {
    show([order("a", "buy", 100), order("b", "buy", 200), order("c", "sell", 400)]);
    // The largest order on either side fills its bar; the rest are shares of it.
    expect(depth("c")).toBe("100%");
    expect(depth("b")).toBe("50%");
    expect(depth("a")).toBe("25%");
  });

  it("colours bids and asks apart", () => {
    show([order("a", "buy", 100), order("c", "sell", 400)]);
    const fill = (holder: string) =>
      screen.getByText(`Holder ${holder}`).closest("tr")!.querySelector<HTMLElement>("[data-fill]")!
        .className;
    expect(fill("a")).toContain("bg-success");
    expect(fill("c")).toContain("bg-error");
  });
});
