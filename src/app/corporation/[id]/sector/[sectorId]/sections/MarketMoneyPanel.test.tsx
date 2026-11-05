/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render as renderView, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/corporations.json";
import { describe, expect, it, vi } from "vitest";
import type { PlantsData } from "../types";
import MarketMoneyPanel from "./MarketMoneyPanel";

function render(view: ReactElement) {
  return renderView(
    <NextIntlClientProvider locale="en" messages={messages}>
      {view}
    </NextIntlClientProvider>
  );
}

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (value: number) => `M${value}`,
    formatPrice: (value: number) => `M${value}`,
    toInternalFrom: (value: number) => value,
  }),
}));

const plants = {
  producedUnits: 10_576,
  soldUnits: 6_944,
  unsoldUnits: 3_632,
  demandGapUnits: 0,
  fillRate: 0.66,
  pnl: {
    revenueAnchor: 895_000,
    inputsAnchor: 16_900,
    labourAnchor: 217_000,
    upkeepAnchor: 4_800,
    complianceAnchor: 0,
    otherOperatingAnchor: 569_000,
    growthAndBuildAnchor: 0,
    profitAnchor: 87_700,
    financialEventsAnchor: 0,
    avgSalePriceAnchor: 128.94,
    profitPerUnitAnchor: 8.3,
  },
  truth: {
    soldFraction: 0.66,
    soldByCommodity: [],
    receivedPerUnitAnchor: 84.66,
    costPerUnitAnchor: 76.36,
    fillAdjustedMarginPct: 9.8,
    breakEven: { status: "profitable_now", turns: null },
  },
} as never;

describe("MarketMoneyPanel period and scope labels", () => {
  it("separates per-unit averages, daily totals, turns, and SOE remittance (ticket #1072)", () => {
    render(
      <MarketMoneyPanel
        plants={plants}
        sectorType="manufacturing"
        financials={null}
        corporation={{ _id: "natcorp-1", name: "VEB Kombinat", isStateOwned: true }}
      />
    );

    expect(screen.getByText("Average per unit produced")).toBeTruthy();
    expect(screen.getByText("Total revenue / financial day")).toBeTruthy();
    expect(screen.getByText("Sector operating profit / financial day")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("Total revenue / turn (1 hour)")).toBeTruthy();
    expect(screen.getByText("Total revenue / game year (48 turns)")).toBeTruthy();
    expect(screen.getByText("From sector profit to the national budget")).toBeTruthy();

    const link = screen.getByRole("link", { name: "See corporation budget flow" });
    expect(link.getAttribute("href")).toBe("/corporation/natcorp-1?tab=overview");
  });
});

describe("signed cost lines (ticket 1122)", () => {
  // Same prod newsroom as sectorDetailPlants.test.ts: $322K revenue, $70.6K of
  // wages, a $34K operating credit, $285K of profit. The credit has to be on
  // screen, or revenue minus the visible lines lands on $251K and the player is
  // reading a panel that does not add up.
  const newsroom = {
    producedUnits: 1_000,
    soldUnits: 900,
    unsoldUnits: 100,
    demandGapUnits: 0,
    fillRate: 0.9,
    pnl: {
      revenueAnchor: 321_760,
      inputsAnchor: 12_400,
      labourAnchor: 70_562,
      upkeepAnchor: 0,
      complianceAnchor: 0,
      otherOperatingAnchor: -46_378,
      growthAndBuildAnchor: 0,
      profitAnchor: 285_176,
      financialEventsAnchor: 0,
      avgSalePriceAnchor: 4.43,
      profitPerUnitAnchor: 285.18,
    },
    truth: null,
  } as never;

  it("renders a negative running-cost line as a credit and totals the real bill", () => {
    render(
      <MarketMoneyPanel
        plants={newsroom}
        sectorType="media"
        financials={null}
        corporation={{ _id: "corp-1", name: "Lockheed Commerce" }}
      />
    );

    // The credit reads as money added back, never as "− −$46,378".
    expect(screen.getByText("+ M46378")).toBeTruthy();
    expect(screen.queryByText("− M-46378")).toBeNull();
    // Wages still bill in full.
    expect(screen.getByText("− M70562")).toBeTruthy();
    // All costs = 12,400 + 70,562 − 46,378 = 36,584, and
    // 321,760 − 36,584 = 285,176, the profit printed underneath.
    expect(screen.getByText("− M36584")).toBeTruthy();
    expect(screen.getByText("M285176")).toBeTruthy();
  });
});

describe("freight class explanation (ticket 1159)", () => {
  it("names the limiting class and explains shared freight capacity", () => {
    const specialLimited = {
      ...(plants as unknown as Record<string, unknown>),
      truth: {
        soldFraction: 0.66,
        soldByCommodity: [],
        receivedPerUnitAnchor: 84.66,
        costPerUnitAnchor: 76.36,
        fillAdjustedMarginPct: 9.8,
        breakEven: { status: "profitable_now", turns: null },
        deliveryLimitedFraction: 0.3,
        deliveryLimitedFreightClass: "special",
      },
    } as never;

    render(
      <MarketMoneyPanel
        plants={specialLimited}
        sectorType="retail"
        financials={null}
        corporation={{ _id: "corp-1", name: "Illinois Retail" }}
      />
    );

    expect(screen.getByText(/Special freight limited/)).toBeTruthy();
    expect(screen.getByText(/three times as much shared freight capacity/)).toBeTruthy();
  });
});

it("shows the internal input credit as a named signed line in the plant account", () => {
  function withCredit(base: PlantsData): PlantsData {
    return {
      ...base,
      pnl: {
        ...base.pnl,
        internalSupplyDiscountAnchor: -200,
        profitAnchor: base.pnl.profitAnchor + 200,
      },
    };
  }
  render(
    <MarketMoneyPanel
      plants={withCredit(plants)}
      sectorType="manufacturing"
      financials={null}
      corporation={{ _id: "fixture", name: "Synthetic producer" }}
    />
  );
  expect(screen.getByText("Internal supply credit")).toBeTruthy();
  expect(screen.getByText("+ M200")).toBeTruthy();
  expect(screen.getByText("M87900")).toBeTruthy();
});

it("names own-site charges and identifies allocated income already included in revenue", () => {
  function withAllocations(base: PlantsData): PlantsData {
    return {
      ...base,
      pnl: { ...base.pnl, internalSupplyIncomeAnchor: 100, internalSupplyChargeAnchor: 50 },
    };
  }
  render(
    <MarketMoneyPanel
      plants={withAllocations(plants)}
      sectorType="manufacturing"
      financials={null}
      corporation={{ _id: "fixture", name: "Synthetic producer" }}
    />
  );
  expect(screen.getByText("Included: income from your sites")).toBeTruthy();
  expect(screen.getByText("Charges from your sites")).toBeTruthy();
});

it("shows a free supplier's own-site deliveries as a memo, not as revenue (issue 5385)", () => {
  const free = plants as PlantsData;
  render(
    <MarketMoneyPanel
      plants={{ ...free, pnl: { ...free.pnl, ownSiteMemoAnchor: 4_200 } }}
      sectorType="manufacturing"
      financials={null}
      corporation={{ _id: "fixture", name: "Synthetic producer" }}
    />
  );
  expect(screen.getByText("Sent to your own sites (memo)")).toBeTruthy();
  expect(screen.getByText("M4200")).toBeTruthy();
  expect(screen.getByText("M895000")).toBeTruthy();
});

it("shows no memo line when nothing was sent free", () => {
  render(
    <MarketMoneyPanel
      plants={plants}
      sectorType="manufacturing"
      financials={null}
      corporation={{ _id: "fixture", name: "Synthetic producer" }}
    />
  );
  expect(screen.queryByText("Sent to your own sites (memo)")).toBeNull();
});

describe("own-site deliveries (ticket 1757)", () => {
  it("names output handed to the company's own sites and does not call it unsold", () => {
    render(
      <MarketMoneyPanel
        plants={
          {
            producedUnits: 104,
            soldUnits: 29,
            ownSiteUnits: 75,
            unsoldUnits: 0,
            demandGapUnits: 0,
            fillRate: 0.28,
            pnl: {
              revenueAnchor: 1_566,
              inputsAnchor: 0,
              labourAnchor: 0,
              upkeepAnchor: 0,
              complianceAnchor: 0,
              otherOperatingAnchor: 0,
              growthAndBuildAnchor: 0,
              profitAnchor: 1_566,
              financialEventsAnchor: 0,
              avgSalePriceAnchor: 53.88,
              profitPerUnitAnchor: 15,
            },
            truth: null,
          } as never
        }
        sectorType="energy"
        financials={null}
        corporation={{ _id: "corp-1", name: "Exxon Mobil" }}
      />
    );
    expect(screen.getByText(/75 units went free to your company's own sites/)).toBeTruthy();
    expect(screen.queryByText(/went unsold/)).toBeNull();
  });

  it("says priced transfers were charged to own sites and shows the value", () => {
    const base = plants as PlantsData;
    render(
      <MarketMoneyPanel
        plants={{
          ...base,
          ownSiteUnits: 75,
          pnl: { ...base.pnl, internalSupplyIncomeAnchor: 900 },
        }}
        sectorType="energy"
        financials={null}
        corporation={{ _id: "corp-1", name: "Exxon Mobil" }}
      />
    );
    expect(screen.getByText(/those sites were charged M900/)).toBeTruthy();
    expect(screen.queryByText(/went free/)).toBeNull();
  });

  it("says free transfers were free and shows the memo value", () => {
    const base = plants as PlantsData;
    render(
      <MarketMoneyPanel
        plants={{ ...base, ownSiteUnits: 75, pnl: { ...base.pnl, ownSiteMemoAnchor: 4_200 } }}
        sectorType="energy"
        financials={null}
        corporation={{ _id: "corp-1", name: "Exxon Mobil" }}
      />
    );
    expect(screen.getByText(/went free to your company's own sites/)).toBeTruthy();
    expect(screen.getByText(/worth about M4200 at your asking price/)).toBeTruthy();
  });
});
