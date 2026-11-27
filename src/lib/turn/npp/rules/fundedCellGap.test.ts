import { describe, expect, it } from "vitest";
import type { CommodityType } from "@/lib/constants/commodities";
import { fundedBuildDemand } from "@/lib/corporations/rules/fundedBuildDemand";
import type {
  FundedCountryBookRow,
  FundedRegionalBookRow,
} from "@/lib/market/producerMarket/fundedBookRules";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { cellUnmetDemandUnits } from "./marketSaturation";
import {
  createLegGapReader,
  fundedLegUnmetUnits,
  priceDocLegUnmetUnits,
  type PriceDocGapSource,
} from "./fundedCellGap";

// Live funded book rows (turn 250) for the two markets where the price
// documents hid the shortage: timber in the US, bought mostly by company
// building, and ordnance in China, bought by its government.
const countries: FundedCountryBookRow[] = [
  {
    countryId: "US",
    commodity: "timber",
    supply: 34_163,
    demand: 180_012,
    imports: 0,
    exports: 0,
    funded: 156_599,
    filled: 123_038,
  },
  {
    countryId: "CN",
    commodity: "ordnance",
    supply: 113,
    demand: 4_328,
    imports: 0,
    exports: 0,
    funded: 3_493,
    filled: 1_563,
  },
  {
    countryId: "US",
    commodity: "steel",
    supply: 169_261,
    demand: 151_603,
    imports: 0,
    exports: 0,
    funded: 151_603,
    filled: 151_603,
  },
];
const regions: FundedRegionalBookRow[] = [
  { stateId: "OR", commodity: "timber", funded: 400, filled: 400 },
  { stateId: "GD", commodity: "ordnance", funded: 2, filled: 2 },
  { stateId: "CA", commodity: "real_estate_services", funded: 100, filled: 60 },
];

// What the price documents carried on turn 239: demand without government
// buying or company building.
const priceDocs = new Map<CommodityType, PriceDocGapSource>([
  ["timber", { nationalSupply: { US: 24_923 }, nationalDemand: { US: 29_592 } }],
  ["ordnance", { nationalSupply: { CN: 157 }, nationalDemand: { CN: 157 } }],
  ["steel", { nationalSupply: { US: 169_261 }, nationalDemand: { US: 151_603 } }],
]);

const fundedRows = (
  supply: Partial<Record<CommodityType, number>>,
  stateId: string,
  countryId: string
) =>
  fundedBuildDemand({
    supply,
    stateId,
    countryId,
    countries,
    regions,
    regionalUnitScale: 24,
  });

const reader = createLegGapReader({
  fundedRows,
  priceDocOf: (commodity) => priceDocs.get(commodity),
  isStateScoped: isStateScopedCommodity,
});
const legacy = createLegGapReader({
  fundedRows: null,
  priceDocOf: (commodity) => priceDocs.get(commodity),
  isStateScoped: isStateScopedCommodity,
});

describe("NPP build room from the funded order book", () => {
  it("sees the US timber shortage that company building creates", () => {
    const cell = { stateId: "OR", countryId: "US" };
    expect(reader("timber", cell)).toBe(156_599 - 123_038);
    // The price documents showed a seventh of it.
    expect(legacy("timber", cell)).toBe(29_592 - 24_923);
    expect(reader("timber", cell)!).toBeGreaterThan(legacy("timber", cell)! * 7);
  });

  it("sees China's government ordnance orders the price documents left out", () => {
    const cell = { stateId: "GD", countryId: "CN" };
    expect(legacy("ordnance", cell)).toBe(0);
    expect(reader("ordnance", cell)).toBe(3_493 - 1_563);
    // A munitions plant's mixed output still reads room through its ordnance leg.
    const munitions = cellUnmetDemandUnits({
      supplyMix: { chemicals: 0.6, ordnance: 0.4 },
      gapFor: (commodity) => reader(commodity, cell),
    });
    expect(munitions).toBeGreaterThan(0);
  });

  it("reads no room in a balanced market", () => {
    expect(reader("steel", { stateId: "OH", countryId: "US" })).toBe(0);
  });

  it("reads a country with no orders in a published book as a measured zero", () => {
    expect(reader("ordnance", { stateId: "TX", countryId: "US" })).toBe(0);
  });

  it("reads regional services from the region's own book, per day", () => {
    expect(reader("real_estate_services", { stateId: "CA", countryId: "US" })).toBe(40 * 24);
  });

  it("falls back to the price documents only without a funded book", () => {
    expect(legacy("steel", { stateId: "OH", countryId: "US" })).toBe(0);
    expect(priceDocLegUnmetUnits(undefined, { stateId: "OH", countryId: "US" }, false)).toBeNull();
  });
});

describe("fundedLegUnmetUnits", () => {
  it("takes the market-wide row and keeps an unmeasured region unknown", () => {
    expect(fundedLegUnmetUnits(undefined)).toBeNull();
    expect(
      fundedLegUnmetUnits([
        {
          commodity: "healthcare_services",
          scope: "regional",
          funded: null,
          delivered: null,
          unmet: null,
        },
      ])
    ).toBeNull();
    expect(
      fundedLegUnmetUnits([
        { commodity: "steel", scope: "regional", funded: 9, delivered: 1, unmet: 8 },
        { commodity: "steel", scope: "national", funded: 50, delivered: 20, unmet: 30 },
      ])
    ).toBe(30);
  });
});
