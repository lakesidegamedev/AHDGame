// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SharePurchaseOrderbookView } from "./SharePurchaseOrderbookView";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: String,
    formatPriceOrder: String,
    toInternalFrom: (n: number) => n,
  }),
}));
afterEach(cleanup);

it.each(["0", "-5", "1.5", "1e6", "101"])(
  "retains and rejects invalid fill %s rather than making it a valid order",
  (raw) => {
    render(
      <SharePurchaseOrderbookView
        orderbookAsks={[
          {
            _id: "order",
            type: "sell",
            sharesRemaining: 100,
            pricePerShare: 1,
            characterName: "Synthetic seller",
            isMine: false,
            isFundOrder: false,
            createdAt: "2030-01-01",
          },
        ]}
        orderbookBids={[]}
        myCorporation={null}
        personalCashAnchor={1000}
        myCorpLiquidInternal={0}
        myCorpLiquidCurrency="USD"
        corpCurrencyCode="USD"
        corpId="target"
        onSuccess={() => {}}
      />
    );
    const input = screen.getByPlaceholderText("Qty");
    fireEvent.change(input, { target: { value: raw } });
    expect(input).toHaveProperty("value", raw);
    expect(screen.getByRole("button", { name: "Buy" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Enter 1 to 100 whole shares.")).toBeTruthy();
  }
);
