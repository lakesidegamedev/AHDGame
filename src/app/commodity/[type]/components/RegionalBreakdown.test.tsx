// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegionalBreakdown, { regionFooterRows } from "./RegionalBreakdown";

vi.mock("@/contexts/RegisteredCountriesContext", () => ({
  useCountryDisplayName: () => (id: string) =>
    ({ US: "United States", DE: "Germany", JP: "Japan" })[id] ?? id,
}));
vi.mock("@/components/CountryFlag", () => ({ CountryFlag: () => null }));

afterEach(cleanup);

const base = {
  stateSupply: { CA: 10 },
  stateDemand: { CA: 12 },
  statePrices: {},
  stateCountryMap: { CA: "US" },
  globalPrice: 100,
  forexEnabled: false,
  exchangeRates: {},
  unit: "units",
};

describe("RegionalBreakdown", () => {
  it("lists countries without regions from national totals, without repeating regional ones", () => {
    render(
      <RegionalBreakdown
        {...base}
        nationalSupply={{ US: 10, DE: 40, JP: 5 }}
        nationalDemand={{ US: 12, DE: 30, JP: 0 }}
      />
    );
    expect(screen.getByText("Other countries")).toBeTruthy();
    expect(screen.getByText("Germany")).toBeTruthy();
    expect(screen.getByText("Japan")).toBeTruthy();
    expect(screen.getByText(/\+ 2 countries/)).toBeTruthy();
    expect(screen.queryAllByText("United States")).toHaveLength(1);
  });

  it("shows no other-countries section without national totals", () => {
    render(<RegionalBreakdown {...base} />);
    expect(screen.queryByText("Other countries")).toBeNull();
  });
});

describe("regional rows add up to the country total", () => {
  it("shown regions, hidden regions and country-wide buyers and sellers sum to the total", () => {
    const stateSupply = { CA: 50, TX: 30, NY: 10 };
    const stateDemand = { CA: 40, TX: 35, NY: 20 };
    const total = { supply: 100, demand: 120 }; // 10 and 25 placed in no region
    const rows = regionFooterRows({
      ids: ["CA", "TX", "NY"],
      visible: ["CA", "TX"],
      stateSupply,
      stateDemand,
      total,
    });
    const listed = rows.filter((r) => r.key !== "total");
    const supply = 50 + 30 + listed.reduce((n, r) => n + r.supply, 0);
    const demand = 40 + 35 + listed.reduce((n, r) => n + r.demand, 0);
    expect(supply).toBeCloseTo(total.supply, 9);
    expect(demand).toBeCloseTo(total.demand, 9);
    expect(rows.map((r) => r.key)).toEqual(["hidden", "countryWide", "total"]);
  });
});
