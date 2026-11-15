import { describe, it, expect } from "vitest";
import {
  computeMarketSharePercent,
  buildMarketShareBySectorId,
  buildNationalDominanceShareBySectorId,
} from "./marketShare";
import type { CountryId } from "@/lib/constants/countries";
import type { CorporationType } from "@/lib/constants/corporations";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CorporateSector } from "@/lib/db/types";
describe("computeMarketSharePercent", () => {
  it("a sole owner reads 100%, not more", () => {
    expect(computeMarketSharePercent(1000, 1000)).toBe(100);
  });

  it("a non-positive market reads 0", () => {
    expect(computeMarketSharePercent(1000, 0)).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Plants tier (buildable-sectors P2 §5, decision D8): market share on the
 * owned-capacity basis instead of revenue.
 * ------------------------------------------------------------------ */

describe("plants tier — unit-denominated market share", () => {
  const STATE_ID = "S1";
  const TYPE: CorporationType = "energy";

  const state = { _id: STATE_ID, gdp: 0, countryId: "US" as CountryId };
  const stateById = (gdp = 0) => new Map([[STATE_ID, { ...state, gdp }]]);
  const fx = new Map<CurrencyCode, number>([["USD" as CurrencyCode, 1]]);

  const sector = (id: string, revenue: number, capitalStock?: number): CorporateSector =>
    ({
      _id: id,
      stateId: STATE_ID,
      sectorType: TYPE,
      countryId: "US",
      revenue,
      capitalStock,
    }) as unknown as CorporateSector;

  const build = (sectors: CorporateSector[], opts: { gdp?: number } = {}) =>
    buildMarketShareBySectorId({
      sectors,
      stateById: stateById(opts.gdp ?? 0),
      exchangeRatesByCurrency: fx,
    });

  it("share is a sector's revenue over the cell's TOTAL real revenue", () => {
    // 1000 + 3000 = 4000 real revenue in the cell → 25% / 75%.
    const shares = build([sector("a", 1000), sector("b", 3000)]);
    expect(shares.get("a")).toBeCloseTo(25, 10);
    expect(shares.get("b")).toBeCloseTo(75, 10);
  });

  it("a sole producer reads 100%, whatever the GDP", () => {
    const shares = build([sector("a", 1000)], { gdp: 50_000_000 });
    expect(shares.get("a")).toBe(100);
  });

  it("a zero-revenue cell is finite (0), not NaN", () => {
    const shares = build([sector("a", 0)]);
    expect(shares.get("a")).toBe(0);
    expect(Number.isFinite(shares.get("a")!)).toBe(true);
  });

  it("separates generic media from the entertainment lane", () => {
    const sectors = [
      { ...sector("generic", 100), sectorType: "media", mediaDiscriminator: null },
      { ...sector("ent-a", 100), sectorType: "media", mediaDiscriminator: "entertainment" },
      { ...sector("ent-b", 100), sectorType: "media", mediaDiscriminator: "entertainment" },
    ] as unknown as CorporateSector[];
    const shares = build(sectors);

    expect(shares.get("generic")).toBe(100);
    expect(shares.get("ent-a")).toBe(50);
    expect(shares.get("ent-b")).toBe(50);
  });
});

describe("national dominance share market identity", () => {
  it("keeps media lanes distinct", () => {
    const nationalStateId = "US-CA";
    const sectors = [
      {
        _id: "generic",
        stateId: nationalStateId,
        countryId: "US",
        revenue: 100,
        sectorType: "media",
        mediaDiscriminator: null,
        corporationId: "a",
      },
      {
        _id: "canonical-ent",
        stateId: nationalStateId,
        countryId: "US",
        revenue: 100,
        sectorType: "media",
        mediaDiscriminator: "entertainment",
        corporationId: "b",
      },
      {
        _id: "ent-b",
        stateId: nationalStateId,
        countryId: "US",
        revenue: 100,
        sectorType: "media",
        mediaDiscriminator: "entertainment",
        corporationId: "c",
      },
    ] as unknown as CorporateSector[];
    const shares = buildNationalDominanceShareBySectorId({
      sectors,
      stateById: new Map([[nationalStateId, { _id: nationalStateId, gdp: 0, countryId: "US" }]]),
      exchangeRatesByCurrency: new Map<CurrencyCode, number>([["USD" as CurrencyCode, 1]]),
    });

    expect(shares.get("generic")).toBe(100);
    expect(shares.get("canonical-ent")).toBe(50);
    expect(shares.get("ent-b")).toBe(50);
  });
});
