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

  it("calls old stock an overhang, not a surplus, when new output matches orders", () => {
    renderPanel([
      row({
        commodity: "building_materials",
        label: "Building Materials",
        globalSupply: 150,
        globalDemand: 100,
        carriedStock: 52,
      }),
    ]);
    const cell = screen.getByText("Old stock left");
    expect(cell.getAttribute("title")).toContain("unsold stock from earlier turns");
    expect(screen.queryByText("Surplus")).toBeNull();
  });

  it("still calls a surplus when new output alone exceeds orders", () => {
    renderPanel([
      row({
        commodity: "electronics",
        label: "Electronics",
        globalSupply: 150,
        globalDemand: 100,
        carriedStock: 10,
      }),
    ]);
    expect(screen.getByText("Surplus")).toBeTruthy();
  });
});

it("shows a rising last-turn price alongside a negative annualized change", () => {
  renderPanel([
    row({
      commodity: "chemicals",
      label: "Industrial Chemicals",
      lastTurnPriceChange: 1.43,
      priceChange: -31.3,
    }),
  ]);

  const columns = screen.getAllByRole("columnheader");
  const cells = screen.getAllByRole("cell");
  expect(
    cells[columns.indexOf(screen.getByRole("columnheader", { name: "Last turn" }))]?.textContent
  ).toBe("+1.4%");
  expect(
    cells[columns.indexOf(screen.getByRole("columnheader", { name: "Yearly rate" }))]?.textContent
  ).toBe("-31.3%");
});

describe("premiumTitle", () => {
  it("names the stored premium and says it eases when supply exceeds demand", async () => {
    const { premiumTitle } = await import("./CommoditiesPanel");
    const title = premiumTitle({
      globalSupply: 100,
      globalDemand: 87.5,
      priceAttribution: {
        appliedPrice: 3.59,
        realBasePrice: 1,
        nominalInflation: 0.2,
        scarcityMemory: 2.052,
        producerInputCostPassThrough: 0,
        marketBalance: 0,
        adjustmentLag: 0,
        explicitOverride: 0,
      },
    } as never);
    expect(title).toContain("2.71x");
    expect(title).toContain("eases by up to 6% a turn");
  });
});

describe("CommoditiesPanel price cap basis", () => {
  it("states what the cap is a multiple of next to the cap label", () => {
    renderPanel([
      row({
        commodity: "steel",
        label: "Steel",
        basePrice: 100,
        globalPrice: 360,
        priceCeiling: 360,
        priceCapBasis: { multiplier: 3, nominalIndex: 1.2 },
      }),
    ]);
    expect(screen.getByText(/at price cap/).textContent).toContain(
      "3x the inflation-adjusted base (base x 1.20 = +260% vs original base)"
    );
    expect(screen.getByText("vs original base")).toBeTruthy();
  });
});
