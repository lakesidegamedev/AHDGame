// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import enCorporations from "../../../../../messages/en/corporations.json";
import deCorporations from "../../../../../messages/de/corporations.json";
import type { CommodityDetail } from "../types";
import type { CommodityMarketScope } from "../lib/marketScope";
import HeroPanel from "./HeroPanel";

// Resolve copy from the real English catalog so a missing key fails here.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    const copy = (enCorporations.corporations.commodityMarket as Record<string, string>)[key];
    if (copy === undefined) throw new Error(`Missing commodityMarket message: ${key}`);
    return copy.replace(/\{(\w+)\}/g, (_, name: string) => params?.[name] ?? "");
  },
}));
vi.mock("@/components/HeroImage", () => ({ HeroImage: () => null }));
vi.mock("@/components/BackButton", () => ({ default: () => null }));
vi.mock("@/components/sidebarWidgets/WatchButton", () => ({ WatchButton: () => null }));
vi.mock("@/contexts/RegisteredCountriesContext", () => ({ useRegisteredCountries: () => [] }));

const data = {
  commodity: "natural_gas",
  label: "Natural Gas",
  icon: "NG",
  colors: "text-primary",
  unit: "units",
  basePrice: 100,
  annualPriceChange: 0,
} as unknown as CommodityDetail;

const scope = {
  marketPrice: 100,
  priceChange: 0,
  marketCaption: "Aggregated across all enabled countries.",
  supply: 25_200_000,
  demand: 4_000_000,
  balance: 21_200_000,
  imports: null,
  demandBasis: "stored",
  filled: null,
  spilloverRequested: 0,
  regionCount: 1,
} as unknown as CommodityMarketScope;

afterEach(cleanup);

describe("HeroPanel supply card", () => {
  it("says header supply is offered units including unsold stock", () => {
    render(
      <HeroPanel
        data={data}
        marketScope={scope}
        activeCountry={null}
        forexEnabled={false}
        exchangeRates={{}}
        onSelectExchange={() => {}}
      />
    );

    expect(screen.getByText("Global supply")).toBeTruthy();
    expect(screen.getByText("offered per day")).toBeTruthy();
    const note = screen.getByText("includes unsold stock");
    expect(note.getAttribute("title")).toMatch(/counted again every turn/);
  });
});

describe("HeroPanel price basis", () => {
  it("labels the global figure as a world average", () => {
    render(
      <HeroPanel
        data={data}
        marketScope={scope}
        activeCountry={null}
        forexEnabled={false}
        exchangeRates={{}}
        onSelectExchange={() => {}}
      />
    );
    expect(screen.getByText("World average price")).toBeTruthy();
  });

  it("names the country market and its currency", () => {
    render(
      <HeroPanel
        data={data}
        marketScope={{ ...scope, marketLabel: "US Market" } as unknown as CommodityMarketScope}
        activeCountry="US"
        forexEnabled={false}
        exchangeRates={{}}
        onSelectExchange={() => {}}
      />
    );
    expect(screen.getByText("US Market price (USD)")).toBeTruthy();
  });
});

describe("HeroPanel balance cell", () => {
  it("shows local producer sales instead of a surplus for an exporting country", () => {
    render(
      <HeroPanel
        data={data}
        marketScope={
          {
            ...scope,
            supply: 164_700,
            demand: 74_700,
            balance: 90_000,
            imports: 5_800,
            demandBasis: "funded_orders",
            filled: 76_200,
            spilloverRequested: 1_500,
            fundedMarket: {
              supply: 164_700,
              demand: 74_700,
              spilloverRequested: 1_500,
              filled: 76_200,
              funded: 65_400,
              imports: 5_800,
              exports: 91_500,
            },
          } as unknown as CommodityMarketScope
        }
        activeCountry="US"
        forexEnabled={false}
        exchangeRates={{}}
        onSelectExchange={() => {}}
      />
    );
    expect(screen.getByTestId("hero-sold").textContent).toContain("161.9K units");
    expect(screen.getByTestId("hero-sold").textContent).toContain("98% of offers");
    expect(screen.getByText("plus 91.5K units exported")).toBeTruthy();
    expect(screen.queryByText(/surplus/i)).toBeNull();
  });

  it("describes a plain gap without calling it a surplus", () => {
    render(
      <HeroPanel
        data={data}
        marketScope={scope}
        activeCountry={null}
        forexEnabled={false}
        exchangeRates={{}}
        onSelectExchange={() => {}}
      />
    );
    expect(screen.getByTestId("hero-gap").textContent).toContain("more offered than ordered");
    expect(screen.queryByText(/surplus/i)).toBeNull();
  });
});

describe("supply copy catalogs", () => {
  it("has the supply keys in every locale", () => {
    for (const catalog of [enCorporations, deCorporations]) {
      const market = catalog.corporations.commodityMarket as Record<string, string>;
      for (const key of ["supplyOfferedPerDay", "supplyIncludesStock", "supplyOfferedExplanation"])
        expect(market[key]).toBeTruthy();
    }
  });
});
