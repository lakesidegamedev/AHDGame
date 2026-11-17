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

  it("a founding sector with no delivered capacity claims no share from its nameplate revenue", () => {
    const shares = build([sector("a", 5000, 0)]);
    expect(shares.get("a")).toBe(0);
  });

  it("a rival with real capacity keeps its full share against a not-yet-built sector", () => {
    const shares = build([sector("new", 5000, 0), sector("est", 1000, 40)]);
    expect(shares.get("new")).toBe(0);
    expect(shares.get("est")).toBe(100);
  });

  it("an established dominant firm still reads its real 80% share", () => {
    const shares = build([sector("big", 8000, 40), sector("small", 2000, 10)]);
    expect(shares.get("big")).toBeCloseTo(80, 10);
  });

  it("whole plants delivered count even when capitalStock reads 0", () => {
    const owned = { ...sector("a", 1000, 0), plantCount: 2 } as CorporateSector;
    expect(build([owned]).get("a")).toBe(100);
  });

  it("a zero-revenue cell is finite (0), not NaN", () => {
    const shares = build([sector("a", 0)]);
    expect(shares.get("a")).toBe(0);
    expect(Number.isFinite(shares.get("a")!)).toBe(true);
  });
});

describe("national dominance share market identity", () => {
  it("splits one national market between rival owners", () => {
    const nationalStateId = "US-CA";
    const sectors = [
      {
        _id: "a",
        stateId: nationalStateId,
        countryId: "US",
        revenue: 100,
        sectorType: "media",
        corporationId: "a",
      },
      {
        _id: "b",
        stateId: nationalStateId,
        countryId: "US",
        revenue: 100,
        sectorType: "media",
        corporationId: "b",
      },
    ] as unknown as CorporateSector[];
    const shares = buildNationalDominanceShareBySectorId({
      sectors,
      stateById: new Map([[nationalStateId, { _id: nationalStateId, gdp: 0, countryId: "US" }]]),
      exchangeRatesByCurrency: new Map<CurrencyCode, number>([["USD" as CurrencyCode, 1]]),
    });

    expect(shares.get("a")).toBe(50);
    expect(shares.get("b")).toBe(50);
  });
});
