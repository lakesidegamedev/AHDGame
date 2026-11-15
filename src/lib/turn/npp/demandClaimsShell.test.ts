import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { demandClaimKeyOf, loadInFlightDemandClaims } from "./demandClaimsShell";

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
      new Map([["NJ", "US"]])
    );
    expect(reads.count).toBe(1);
    expect(claims.get("CA:healthcare")).toBe(5_005);
    expect(claims.get("NJ:healthcare")).toBe(7);
    expect(claims.has("ZZ:healthcare")).toBe(false);
  });
});
