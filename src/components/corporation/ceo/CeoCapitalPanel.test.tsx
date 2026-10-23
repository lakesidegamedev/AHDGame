/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CeoCapitalPanel from "./CeoCapitalPanel";
import { MAX_DIVIDEND_RATE } from "@/lib/constants/corporations";
import type { CorporationDetail, Financials } from "../CorporationPageTypes";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (n: number) => `$${Math.round(n)}`,
    formatFull: (n: number) => `$${n}`,
    formatPrice: (n: number) => `$${n}`,
    formatPriceOrder: (n: number) => `$${n}`,
    formatAmountChip: (n: number) => `$${n}`,
    formatListingPrice: (n: number) => `$${n}`,
    toInternalFrom: (n: number) => n,
  }),
}));
vi.mock("./CapitalInjectionPanel", () => ({ CapitalInjectionPanel: () => null }));
vi.mock("./ShareBuybackEscrowPanel", () => ({ ShareBuybackEscrowPanel: () => null }));
vi.mock("@/components/time/GameMonthTime", () => ({ GameMonthTime: () => null }));

function show(props: { saved?: number; effective?: number; setRate?: (v: number) => void }) {
  render(
    <CeoCapitalPanel
      corpId="7"
      corporation={
        {
          _id: "c1",
          isPrivate: true,
          liquidCurrencyCode: "USD",
          countryId: "US",
          dividendRate: props.saved ?? 5,
        } as CorporationDetail
      }
      financials={{ income: 2_400, effectiveDividendRate: props.effective ?? 5 } as Financials}
      currentTurn={10}
      myCashOnHand={0}
      onRefresh={vi.fn()}
      editDividendRate={props.saved ?? 5}
      setEditDividendRate={props.setRate ?? vi.fn()}
      dividendSaving={false}
      dividendError=""
      dividendSuccess=""
      onSaveDividend={vi.fn()}
      editShareBuybackMode="instant"
      setEditShareBuybackMode={vi.fn()}
      editEscrowFundingPerTurn=""
      setEditEscrowFundingPerTurn={vi.fn()}
      saving={false}
      onSaveSettings={vi.fn()}
    />
  );
}

describe("CeoCapitalPanel dividend", () => {
  it("slider writes the dividend rate", () => {
    const setRate = vi.fn();
    show({ setRate });
    const slider = screen.getByRole("slider", { name: "Dividend rate" });
    expect(slider.getAttribute("min")).toBe("0");
    expect(slider.getAttribute("max")).toBe(String(MAX_DIVIDEND_RATE));
    expect(slider.getAttribute("step")).toBe("1");
    fireEvent.change(slider, { target: { value: "12" } });
    expect(setRate).toHaveBeenCalledWith(12);
  });

  it("marks the legal minimum on the slider only when one applies", () => {
    show({ saved: 5, effective: 10 });
    const tick = document.querySelector<HTMLElement>("[data-legal-minimum]");
    expect(tick?.style.left).toBe(`${(10 / MAX_DIVIDEND_RATE) * 100}%`);
    expect(screen.getByText("Legal minimum")).toBeTruthy();
  });

  it("draws no legal minimum tick without a floor", () => {
    show({ saved: 5, effective: 5 });
    expect(document.querySelector("[data-legal-minimum]")).toBeNull();
  });
});
