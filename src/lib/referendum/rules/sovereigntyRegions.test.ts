import { describe, expect, it } from "vitest";
import { caStateMetrics } from "@/lib/countries/ca/data/caStateMetrics";
import { caRegions2027 } from "@/lib/countries/ca/data/caRegions2027";
import {
  SOVEREIGNTY_REGIONS,
  getSovereigntyGovernmentNames,
  hostsSovereigntyReferendums,
  isSovereigntyRegion,
  sovereigntyCountryIds,
  sovereigntyRegion,
  sovereigntyRegionIds,
  sovereigntyRegionIn,
  independenceCopy,
} from "./sovereigntyRegions";

describe("sovereignty registry", () => {
  it("keeps the UK settlement unchanged", () => {
    expect(sovereigntyRegionIds("UK")).toEqual(["SCO", "WAL", "NIR"]);
    expect(sovereigntyRegion("nir")).toMatchObject({
      kind: "reunification",
      targetCountryId: "IE",
      actuates: true,
    });
    expect(sovereigntyRegion("SCO")).toMatchObject({ kind: "independence", targetCountryId: null });
  });

  it("lets Quebec hold a referendum that can make it the QC successor", () => {
    const quebec = sovereigntyRegionIn("CA", "CA_QC");
    expect(quebec).toMatchObject({ kind: "independence", executiveTitle: "Premier" });
    expect(quebec?.successorCountryId).toBe("QC");
    expect(quebec?.actuates).toBe(true);
    expect(hostsSovereigntyReferendums("CA")).toBe(true);
  });

  it("scopes a region to its own country", () => {
    expect(sovereigntyRegionIn("US", "SCO")).toBeNull();
    expect(sovereigntyRegionIn("UK", "CA_QC")).toBeNull();
    expect(isSovereigntyRegion("LON")).toBe(false);
    expect(hostsSovereigntyReferendums("US")).toBe(false);
    expect(hostsSovereigntyReferendums(undefined)).toBe(false);
  });

  it("lists each country once and each region once", () => {
    expect(sovereigntyCountryIds()).toEqual(["UK", "CA"]);
    const ids = SOVEREIGNTY_REGIONS.map((entry) => entry.regionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names Canadian regions that the 2027 seed creates", () => {
    const seeded = new Set(caRegions2027.map((region) => String(region._id)));
    for (const regionId of sovereigntyRegionIds("CA")) expect(seeded.has(regionId)).toBe(true);
  });

  it("seeds Quebec's opening sovereignty mood and no other province's", () => {
    const desire = new Map(
      caStateMetrics.map((m) => [m._id, m.governance?.independenceDesire?.value])
    );
    expect(desire.get("CA_QC")).toBe(35);
    for (const [regionId, value] of desire) if (regionId !== "CA_QC") expect(value).toBeUndefined();
  });
});

describe("getSovereigntyGovernmentNames", () => {
  it("names each region's own two governments", () => {
    expect(getSovereigntyGovernmentNames("CA_QC")).toEqual({
      regional: "Premier",
      national: "Ottawa",
    });
    expect(getSovereigntyGovernmentNames("sco")).toEqual({
      regional: "First Minister",
      national: "Westminster",
    });
  });

  it("falls back to the Westminster names outside the table", () => {
    expect(getSovereigntyGovernmentNames("TX")).toEqual({
      regional: "First Minister",
      national: "Westminster",
    });
  });

  it("writes independence copy from each region's own parent", () => {
    const names: Record<string, string> = { SCO: "Scotland", QC: "Quebec" };
    expect(independenceCopy("SCO", (id) => names[id])).toEqual({
      region: "Scotland",
      parent: "the United Kingdom",
      national: "Westminster",
      sponsor: "His Majesty's Government",
    });
    expect(independenceCopy("CA_QC", (id) => names[id])).toEqual({
      region: "Quebec",
      parent: "Canada",
      national: "Ottawa",
      sponsor: "Government of Canada",
    });
  });
});
