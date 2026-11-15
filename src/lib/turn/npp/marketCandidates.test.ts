import { describe, expect, it } from "vitest";
import { laneIdentities } from "@/lib/market/marketBuckets";
import { indexCandidateBuckets, indexStateIdsByCountry } from "./marketCandidates";

describe("indexStateIdsByCountry", () => {
  it("groups region ids by country in source order", () => {
    const byCountry = indexStateIdsByCountry([
      { _id: "CA", countryId: "US" },
      { _id: "ON", countryId: "CA" },
      { _id: "NY", countryId: "US" },
    ]);
    expect(byCountry.get("US")).toEqual(["CA", "NY"]);
    expect(byCountry.get("CA")).toEqual(["ON"]);
  });
});

describe("indexCandidateBuckets", () => {
  it("lists every region x lane bucket per country with no stored documents", () => {
    const candidates = indexCandidateBuckets(new Map([["US", ["CA", "NY"]]]));
    const us = candidates.get("US")!;
    expect(us).toHaveLength(2 * laneIdentities().length);
    expect(us.every((c) => c.countryId === "US")).toBe(true);
    expect(new Set(us.map((c) => c.key)).size).toBe(us.length);
  });

  it("keeps manufacturing models and media lanes in distinct buckets", () => {
    const keys = indexCandidateBuckets(new Map([["US", ["CA"]]]))
      .get("US")!
      .map((c) => c.key);
    expect(keys).toContain("CA:manufacturing:vehicles");
    expect(keys).toContain("CA:media:generic:entertainment");
  });
});
