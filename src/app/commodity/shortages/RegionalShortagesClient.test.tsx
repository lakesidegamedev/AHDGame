/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RegionalShortagesClient, { computeRegionalShortages } from "./RegionalShortagesClient";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatPrice: (v: number) => `$${v.toFixed(2)}` }),
}));

vi.mock("@/contexts/RegisteredCountriesContext", () => ({
  useCountryDisplayName: () => (id: string) => (id === "US" ? "United States" : "United Kingdom"),
}));

const sampleCommodities = [
  {
    commodity: "steel",
    label: "Steel",
    unit: "t",
    globalPrice: 120,
    basePrice: 100,
    nationalSupply: { US: 50, UK: 100 },
    nationalDemand: { US: 200, UK: 80 },
    nationalPrices: { US: 135, UK: 95 },
    stateSupply: { CA: 10, TX: 40 },
    stateDemand: { CA: 90, TX: 20 },
    statePrices: { CA: 150, TX: 90 },
  },
  {
    commodity: "coal",
    label: "Coal",
    unit: "t",
    globalPrice: 50,
    basePrice: 50,
    nationalSupply: { US: 300, UK: 20 },
    nationalDemand: { US: 100, UK: 60 },
    nationalPrices: { US: 45, UK: 75 },
    stateSupply: { CA: 0, TX: 300 },
    stateDemand: { CA: 30, TX: 50 },
    statePrices: { CA: 70, TX: 45 },
  },
] as never;

describe("RegionalShortagesClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        commodities: sampleCommodities,
        scopeMeta: {
          countryIds: ["US", "UK"],
          statesByCountry: { US: ["CA", "TX"], UK: [] },
        },
      }),
    } as never);
  });

  it("computeRegionalShortages filters to demand > supply and sorts by largest gap", () => {
    const usAll = computeRegionalShortages(sampleCommodities, "US", "all");
    expect(usAll.map((r) => r.commodity)).toEqual(["steel"]);
    expect(usAll[0].gap).toBe(150);

    const ca = computeRegionalShortages(sampleCommodities, "US", "CA");
    expect(ca.map((r) => r.commodity)).toEqual(["steel", "coal"]);
    expect(ca[0].gap).toBe(80);
    expect(ca[1].gap).toBe(30);
  });

  it("renders national shortages and updates when switching country or state", async () => {
    render(<RegionalShortagesClient />);
    expect(await screen.findByText("Steel")).toBeTruthy();
    expect(screen.queryByText("Coal")).toBeNull();

    fireEvent.change(screen.getByLabelText("State or region"), { target: { value: "CA" } });
    await waitFor(() => expect(screen.getByText("Coal")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "UK" } });
    await waitFor(() => {
      expect(screen.getByText("Coal")).toBeTruthy();
      expect(screen.queryByText("Steel")).toBeNull();
    });
  });
});
