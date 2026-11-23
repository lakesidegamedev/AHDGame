/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MyHoldingsPanel from "./MyHoldingsPanel";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// 1 unit of the home currency is 2 internal units in this fixture.
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (internal: number) => `internal:${internal}`,
    toInternalFrom: (amount: number) => amount * 2,
  }),
}));

describe("MyHoldingsPanel personal cash", () => {
  it("converts the home currency balance to internal units before formatting", () => {
    render(
      <MyHoldingsPanel
        myShares={10}
        myShareValue={0}
        myOwnershipPct={0}
        myCashOnHand={1_500_000}
        myHomeCurrency="EUR"
        myEscrowedTotal={0}
      />
    );
    expect(screen.getByText("Personal cash")).toBeTruthy();
    expect(screen.getByText("internal:3000000")).toBeTruthy();
  });

  it("leaves the amount alone when no home currency is known", () => {
    render(
      <MyHoldingsPanel
        myShares={10}
        myShareValue={0}
        myOwnershipPct={0}
        myCashOnHand={500}
        myEscrowedTotal={0}
      />
    );
    expect(screen.getByText("internal:500")).toBeTruthy();
  });
});
