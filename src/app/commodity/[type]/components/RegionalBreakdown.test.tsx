// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegionalBreakdown from "./RegionalBreakdown";

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
