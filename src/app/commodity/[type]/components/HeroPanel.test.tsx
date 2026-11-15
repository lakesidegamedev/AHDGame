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
  useTranslations: () => (key: string) => {
    const copy = (enCorporations.corporations.commodityMarket as Record<string, string>)[key];
    if (copy === undefined) throw new Error(`Missing commodityMarket message: ${key}`);
    return copy;
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

describe("supply copy catalogs", () => {
  it("has the supply keys in every locale", () => {
    for (const catalog of [enCorporations, deCorporations]) {
      const market = catalog.corporations.commodityMarket as Record<string, string>;
      for (const key of ["supplyOfferedPerDay", "supplyIncludesStock", "supplyOfferedExplanation"])
        expect(market[key]).toBeTruthy();
    }
  });
});
