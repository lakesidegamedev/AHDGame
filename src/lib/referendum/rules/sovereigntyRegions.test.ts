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
    expect(hostsSovereigntyReferendums("DE")).toBe(false);
    expect(hostsSovereigntyReferendums(undefined)).toBe(false);
  });

  it("lists each country once and each region once", () => {
    expect(sovereigntyCountryIds()).toEqual(["UK", "CA", "US"]);
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
      decisionMaker: "Prime Minister",
    });
    expect(getSovereigntyGovernmentNames("sco")).toEqual({
      regional: "First Minister",
      national: "Westminster",
      decisionMaker: "Prime Minister",
    });
  });

  it("falls back to the Westminster names outside the table", () => {
    expect(getSovereigntyGovernmentNames("LON")).toEqual({
      regional: "First Minister",
      national: "Westminster",
      decisionMaker: "Prime Minister",
    });
  });

  it("writes independence copy from each region's own parent", () => {
    const names: Record<string, string> = { SCO: "Scotland", QC: "Quebec" };
    expect(independenceCopy("SCO", (id) => names[id])).toEqual({
      region: "Scotland",
      parent: "the United Kingdom",
      national: "Westminster",
      sponsor: "His Majesty's Government",
      decisionMaker: "Prime Minister",
      body: "the House of Commons",
    });
    expect(independenceCopy("CA_QC", (id) => names[id])).toEqual({
      region: "Quebec",
      parent: "Canada",
      national: "Ottawa",
      sponsor: "Government of Canada",
      decisionMaker: "Prime Minister",
      body: "the House of Commons",
    });
  });

  it("gives Texas a President decision and a Congress consent vote", () => {
    const texas = sovereigntyRegionIn("US", "TX");
    expect(texas).toMatchObject({
      kind: "independence",
      executiveTitle: "Governor",
      decisionMakerTitle: "President",
      nationalGovernmentName: "Washington",
      consentBodyName: "Congress",
      actuates: false,
    });
    expect(sovereigntyRegionIn("UK", "TX")).toBeNull();
    expect(independenceCopy("TX", () => undefined)).toMatchObject({
      decisionMaker: "President",
      body: "Congress",
      parent: "the United States",
    });
    expect(getSovereigntyGovernmentNames("TX")).toMatchObject({
      regional: "Governor",
      decisionMaker: "President",
    });
    expect(getSovereigntyGovernmentNames("SCO").decisionMaker).toBe("Prime Minister");
  });
});
