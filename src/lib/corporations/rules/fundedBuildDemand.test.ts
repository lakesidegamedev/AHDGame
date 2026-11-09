import { describe, expect, it } from "vitest";
import { fundedBuildDemand } from "./fundedBuildDemand";
import {
  isCountryBookCommodity,
  isStateScopedCommodity,
} from "@/lib/market/rules/commodityMarketScope";
import { COMMODITY_TYPES } from "@/lib/constants/commoditiesCore";

const book = (commodity: string, countryId = "UK", funded = 100, filled = 10) => ({
  commodity,
  countryId,
  supply: 1000,
  demand: 9000,
  funded,
  filled,
  imports: 0,
  exports: 0,
});
const input = { stateId: "SCO", countryId: "UK", regionalUnitScale: 24 };

describe("funded build demand", () => {
  it("uses national funded construction orders despite zero regional orders and large supply", () => {
    const rows = fundedBuildDemand({
      ...input,
      supply: { construction_services: 1 },
      countries: [book("construction_services")],
      regions: [],
    });
    expect(rows).toMatchObject([
      { scope: "regional", unmet: 0 },
      { scope: "national", funded: 100, delivered: 10, unmet: 90 },
    ]);
  });
  it("does not erase a network shortage because software is balanced", () => {
    const rows = fundedBuildDemand({
      ...input,
      supply: { network_services: 0.4, software: 0.1 },
      countries: [book("network_services"), book("software", "UK", 100, 100)],
      regions: [],
    });
    expect(
      rows.find((r) => r.commodity === "network_services" && r.scope === "national")?.unmet
    ).toBe(90);
    expect(rows.find((r) => r.commodity === "software" && r.scope === "national")?.unmet).toBe(0);
  });
  it("shows only the region for local services, not a foreign or national deficit", () => {
    const rows = fundedBuildDemand({
      ...input,
      supply: { healthcare_services: 1, real_estate_services: 1 },
      countries: [book("healthcare_services"), book("real_estate_services")],
      regions: [{ stateId: "SCO", commodity: "healthcare_services", funded: 2, filled: 1 }],
    });
    expect(rows).toMatchObject([
      { scope: "regional", funded: 48, delivered: 24, unmet: 24 },
      { scope: "regional", unmet: 0 },
    ]);
  });
  it("keeps older missing regional measurements unknown instead of calling them oversupply", () => {
    expect(
      fundedBuildDemand({ ...input, supply: { healthcare_services: 1 }, countries: [] })[0].unmet
    ).toBeNull();
  });
  it("does not invent cash-backed demand from unfunded requests or unknown fills", () => {
    expect(
      fundedBuildDemand({
        ...input,
        supply: { food: 1 },
        countries: [{ ...book("food"), funded: undefined }],
      }).at(-1)?.unmet
    ).toBeNull();
    expect(
      fundedBuildDemand({
        ...input,
        supply: { food: 1 },
        countries: [book("food", "UK", 0, 0)],
      }).at(-1)?.unmet
    ).toBe(0);
  });
  it("does not advertise foreign deficits as reachable domestic orders", () => {
    expect(
      fundedBuildDemand({
        ...input,
        supply: { network_services: 1 },
        countries: [book("network_services", "JP")],
      }).at(-1)?.unmet
    ).toBeNull();
  });
  it("uses every commodity's funded market scope consistently in US, UK and JP", () => {
    for (const countryId of ["US", "UK", "JP"])
      for (const commodity of COMMODITY_TYPES) {
        const rows = fundedBuildDemand({
          ...input,
          countryId,
          supply: { [commodity]: 1 },
          countries: [book(commodity, countryId)],
          regions: [],
        });
        const localOnly = isStateScopedCommodity(commodity) && !isCountryBookCommodity(commodity);
        expect(rows.at(-1)?.scope).toBe(localOnly ? "regional" : "national");
        expect(rows.at(-1)?.unmet).toBe(localOnly ? 0 : 90);
      }
  });
});
