import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { demandClaimKeyOf, loadInFlightDemandClaims, undeliveredUnits } from "./demandClaimsShell";

function fakeDb(queued: unknown[], reads: { count: number }): Db {
  return {
    collection: () => ({
      find: () => ({
        toArray: async () => {
          reads.count += 1;
          return queued;
        },
      }),
    }),
  } as unknown as Db;
}

describe("demandClaimKeyOf", () => {
  it("keys local service lanes per bucket and other lanes per country and lane", () => {
    const base = { countryId: "US" };
    expect(demandClaimKeyOf({ ...base, stateId: "CA", sectorType: "healthcare" })).toBe(
      "CA:healthcare"
    );
    expect(demandClaimKeyOf({ ...base, stateId: "CA", sectorType: "manufacturing" })).toBe(
      demandClaimKeyOf({ ...base, stateId: "NJ", sectorType: "manufacturing" })
    );
  });

  it("keys construction per country, because its funded book is national", () => {
    const base = { countryId: "US", sectorType: "construction" };
    expect(demandClaimKeyOf({ ...base, stateId: "CA" })).toBe(
      demandClaimKeyOf({ ...base, stateId: "TX" })
    );
  });

  it("keys extraction by recipe, so a gas queue does not net a timber gap", () => {
    const base = { countryId: "US", stateId: "OR", sectorType: "extraction" };
    expect(demandClaimKeyOf({ ...base, strategyId: "timber_logging" })).not.toBe(
      demandClaimKeyOf({ ...base, strategyId: "natural_gas_drilling" })
    );
    expect(demandClaimKeyOf({ ...base, strategyId: "timber_logging" })).toBe(
      demandClaimKeyOf({ ...base, stateId: "WA", strategyId: "timber_logging" })
    );
    expect(demandClaimKeyOf({ ...base, strategyId: null })).toBe(
      demandClaimKeyOf({ ...base, strategyId: "" })
    );
  });
});

describe("undeliveredUnits", () => {
  const order = { unitsOrdered: 100, startTurn: 10, onlineTurn: 20, smooth: true };
  it("counts only the share still to land", () => {
    expect(undeliveredUnits(order, 10)).toBe(100);
    expect(undeliveredUnits(order, 15)).toBeCloseTo(50);
    expect(undeliveredUnits(order, 20)).toBe(0);
  });
  it("ignores bad amounts", () => {
    expect(undeliveredUnits({ ...order, unitsOrdered: Number.NaN }, 12)).toBe(0);
    expect(undeliveredUnits({ ...order, unitsOrdered: -5 }, 12)).toBe(0);
  });
});

describe("loadInFlightDemandClaims", () => {
  it("sums queued units per claim key in one read and resolves a missing country from the region", async () => {
    const reads = { count: 0 };
    const claims = await loadInFlightDemandClaims(
      fakeDb(
        [
          {
            stateId: "CA",
            countryId: "US",
            sectorType: "healthcare",
            buildQueue: [{ unitsOrdered: 5_000 }, { unitsOrdered: 5 }],
          },
          {
            stateId: "NJ",
            sectorType: "healthcare",
            buildQueue: [{ unitsOrdered: 7 }],
          },
          { stateId: "ZZ", sectorType: "healthcare", buildQueue: [{ unitsOrdered: 9 }] },
        ],
        reads
      ),
      new Map([["NJ", "US"]]),
      1
    );
    expect(reads.count).toBe(1);
    expect(claims.get("CA:healthcare")).toBe(5_005);
    expect(claims.get("NJ:healthcare")).toBe(7);
    expect(claims.has("ZZ:healthcare")).toBe(false);
  });

  it("nets only undelivered capacity, keyed by each order's recipe", async () => {
    const claims = await loadInFlightDemandClaims(
      fakeDb(
        [
          {
            stateId: "OR",
            countryId: "US",
            sectorType: "extraction",
            strategyId: "timber_logging",
            buildQueue: [
              { unitsOrdered: 250, startTurn: 100, onlineTurn: 110, smooth: true },
              {
                unitsOrdered: 500,
                startTurn: 100,
                onlineTurn: 140,
                smooth: true,
                strategyId: "natural_gas_drilling",
              },
            ],
          },
        ],
        { count: 0 }
      ),
      new Map(),
      105
    );
    const key = (strategyId: string) =>
      demandClaimKeyOf({ stateId: "OR", countryId: "US", sectorType: "extraction", strategyId });
    expect(claims.get(key("timber_logging"))).toBeCloseTo(125);
    expect(claims.get(key("natural_gas_drilling"))).toBeCloseTo(500 * (35 / 40));
  });
});
