import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CorporateSector, State } from "@/lib/db/types";
import {
  buildMarketShareBySectorId,
  buildNationalDominanceShareBySectorId,
  buildCorporationNationalRevenueShareByMarket,
  corporationNationalSectorShareKey,
} from "@/lib/corporations/marketShare";
import { buildLocalRevenueShareLookup } from "@/lib/turn/npp/reinvestCandidatePool";
import { computeSectorMarketPosition } from "@/lib/corporations/queries/sectorDetailMarket";
import { marketShareBasisFromStage, shareRevenueOf } from "./marketShareBasis";

describe("marketShareBasisFromStage", () => {
  it("is earned only from stage 1", () => {
    expect(marketShareBasisFromStage(undefined)).toBe("capacity");
    expect(marketShareBasisFromStage(0)).toBe("capacity");
    expect(marketShareBasisFromStage(1)).toBe("earned");
  });
});

describe("shareRevenueOf", () => {
  it("reads capacity revenue by default and earned revenue on the earned basis", () => {
    const s = { revenue: 100, realizedRevenue: 60, capitalStock: 10 };
    expect(shareRevenueOf(s)).toBe(100);
    expect(shareRevenueOf(s, "earned")).toBe(60);
  });
  it("falls back to capacity for an unsettled row and zeroes a sector with no capacity", () => {
    expect(shareRevenueOf({ revenue: 100 }, "earned")).toBe(100);
    expect(shareRevenueOf({ revenue: 100, realizedRevenue: 5, capitalStock: 0 }, "earned")).toBe(0);
  });
});

function world() {
  const corpA = new ObjectId();
  const corpB = new ObjectId();
  const mk = (corporationId: ObjectId, revenue: number, realizedRevenue: number) =>
    ({
      _id: new ObjectId(),
      corporationId,
      stateId: "S1",
      countryId: "US",
      sectorType: "retail",
      revenue,
      realizedRevenue,
      capitalStock: 10,
      plantCount: 1,
    }) as unknown as CorporateSector;
  // Capacity says 50/50; earned says 25/75.
  const a = mk(corpA, 100, 50);
  const b = mk(corpB, 100, 150);
  const stateById = new Map([
    ["S1", { _id: "S1", gdp: 1, countryId: "US" }],
  ]) as unknown as ReadonlyMap<string, Pick<State, "_id" | "gdp" | "countryId">>;
  return { a, b, sectors: [a, b], stateById };
}

describe("one share on every surface", () => {
  it("capacity basis is unchanged", () => {
    const { a, sectors, stateById } = world();
    const shares = buildMarketShareBySectorId({
      sectors,
      stateById,
      exchangeRatesByCurrency: new Map(),
    });
    expect(shares.get(a._id.toString())).toBeCloseTo(50, 6);
  });

  it("engine local, national, NPP lookup, national-by-market and the panel agree on earned revenue", () => {
    const { a, b, sectors, stateById } = world();
    const input = {
      sectors,
      stateById,
      exchangeRatesByCurrency: new Map(),
      basis: "earned" as const,
    };
    const local = buildMarketShareBySectorId(input);
    const national = buildNationalDominanceShareBySectorId(input);
    const lookup = buildLocalRevenueShareLookup(sectors, "earned");
    const byMarket = buildCorporationNationalRevenueShareByMarket(sectors, new Map(), "earned");
    const panel = computeSectorMarketPosition({
      state: null,
      sector: a,
      sectorCountryId: "US",
      corporation: { _id: a.corporationId, countryId: "US" } as never,
      siblingCorps: [],
      siblingsSectors: sectors,
      siblingFxByCurrency: new Map() as never,
      basis: "earned",
    });
    for (const [sector, expected] of [
      [a, 25],
      [b, 75],
    ] as const) {
      const id = sector._id.toString();
      expect(local.get(id)).toBeCloseTo(expected, 6);
      expect(national.get(id)).toBeCloseTo(expected, 6);
      expect(lookup(sector)).toBeCloseTo(expected, 6);
      expect(
        byMarket.get(
          corporationNationalSectorShareKey(sector.corporationId, "US" as never, "retail")
        )
      ).toBeCloseTo(expected, 6);
    }
    expect(panel.marketShare).toBeCloseTo(25, 6);
    expect(panel.effectiveMarket).toBe(200);
    expect(panel.competitors[0]?.marketShare).toBeCloseTo(75, 6);
  });
});
