// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FundedCountryMarket } from "@/lib/market/producerMarket/fundedCountryViewRules";
import CommodityCountryStatCard from "./CommodityCountryStatCard";

vi.mock("@/components/CountryFlag", () => ({ CountryFlag: () => null }));

const market: FundedCountryMarket = {
  supply: 164_700,
  demand: 74_700,
  spilloverRequested: 0,
  filled: 76_200,
  funded: 65_400,
  imports: 5_800,
  exports: 91_500,
};

function renderCard(book?: FundedCountryMarket) {
  render(
    <CommodityCountryStatCard
      countryId="US"
      commodityLabel="Electronics & Semiconductors"
      unit="units"
      data={{
        countryId: "US",
        supply: market.supply,
        demand: market.demand,
        balance: market.supply - market.demand,
        avgPrice: 956.85,
        stateCount: 51,
      }}
      market={book}
      mode="supply"
      onModeChange={vi.fn()}
      forexEnabled={false}
      exchangeRates={{}}
      onClose={vi.fn()}
      onViewCountryPage={vi.fn()}
      onViewCountryMap={vi.fn()}
    />
  );
}

afterEach(cleanup);

describe("commodity country card", () => {
  it("totals local and traded volumes without confusing orders with sales", () => {
    renderCard(market);

    expect(screen.getAllByText("Total supply")).toHaveLength(2);
    expect(screen.getAllByText("170.5K units/day")).toHaveLength(2);
    expect(screen.getAllByText("Local offers")).toHaveLength(2);
    expect(screen.getAllByText("164.7K units")).toHaveLength(2);
    expect(screen.getAllByText("Imports")).toHaveLength(2);
    expect(screen.getAllByText("5.8K units")).toHaveLength(2);
    expect(screen.getAllByText("Total demand")).toHaveLength(2);
    expect(screen.getAllByText("166.2K units/day")).toHaveLength(2);
    expect(screen.getAllByText("Local orders")).toHaveLength(2);
    expect(screen.getAllByText("74.7K units")).toHaveLength(2);
    expect(screen.getAllByText("Exports")).toHaveLength(2);
    expect(screen.getAllByText("91.5K units")).toHaveLength(2);
    expect(screen.getAllByText("161.9K units/day")).toHaveLength(2);
    expect(screen.getAllByText("98% of local offers sold")).toHaveLength(2);
    expect(screen.getAllByText(/most local offers sold/i)).toHaveLength(2);
    expect(screen.queryByText(/surplus/i)).toBeNull();
  });

  it.each([
    [{ supply: 100, funded: 150, filled: 100 }, /worth scouting/i],
    [{ supply: 100, funded: 80, filled: 60 }, /build selectively/i],
    [{ supply: 100, funded: 60, filled: 60 }, /be cautious about adding supply/i],
  ] as const)("reflects the actual orders and sales in the build outlook", (book, advice) => {
    renderCard({ ...market, ...book, imports: 0, exports: 0 });

    expect(screen.getAllByText(advice)).toHaveLength(2);
  });

  it("labels estimates and does not infer sales when the funded book is missing", () => {
    renderCard();

    expect(screen.getAllByText("Estimated domestic demand")).toHaveLength(2);
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getAllByText(/country-wide sales data is limited/i)).toHaveLength(2);
    expect(screen.queryByText("Exports")).toBeNull();
  });

  it("shows known exports without inventing total sales for books without fills", () => {
    renderCard({ ...market, filled: null });

    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getAllByText("91.5K units")).toHaveLength(2);
  });
});
