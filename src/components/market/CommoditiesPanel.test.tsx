/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CommodityData } from "@/app/country/[code]/stockmarket/types";
import { CommoditiesPanel } from "./CommoditiesPanel";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatPrice: (n: number) => `$${n}` }),
}));

afterEach(cleanup);

function row(over: Partial<CommodityData> & Pick<CommodityData, "commodity" | "label">) {
  return {
    icon: "",
    colors: "",
    unit: "u",
    basePrice: 100,
    globalPrice: 100,
    globalSupply: 100,
    globalDemand: 600,
    priceChange: 0,
    ...over,
  } as CommodityData;
}

function renderPanel(commodities: CommodityData[]) {
  return render(
    <CommoditiesPanel commodities={commodities} loading={false} error="" supplyEnabled={false} />
  );
}

describe("CommoditiesPanel balance", () => {
  it("names the short states for a good sold only inside each state", () => {
    renderPanel([
      row({
        commodity: "healthcare_services",
        label: "Healthcare Services",
        stateShortage: { shortStates: 12, tradingStates: 218 },
      }),
    ]);
    const cell = screen.getByText("Short in 12 of 218 states");
    expect(cell.getAttribute("title")).toContain("Sold only inside each state");
    expect(screen.queryByText("Short")).toBeNull();
  });

  it("says every state is supplied even when the world total reads short", () => {
    renderPanel([
      row({
        commodity: "construction_services",
        label: "Construction",
        stateShortage: { shortStates: 0, tradingStates: 40 },
      }),
    ]);
    expect(screen.getByText("Supplied in every state")).toBeTruthy();
  });

  it("keeps the world balance for goods that trade between states", () => {
    renderPanel([row({ commodity: "food", label: "Food Products" })]);
    expect(screen.getByText("Short")).toBeTruthy();
  });
});
