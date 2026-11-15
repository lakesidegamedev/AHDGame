import { describe, expect, it } from "vitest";
import { CA } from "./index";
import { caRegions2027 } from "./data/caRegions2027";
import { caParties, CA_PARTY_SLUG_TO_NAME, CA_REGION_POLLING_2025 } from "./data/caParties";
import { caStateMetrics } from "./data/caStateMetrics";
import { CA_ADJACENCY_MAP, CA_REGION_NAMES } from "./geographyFacts";
import { SHIPPING_PRESETS } from "@/lib/world/eraRoster";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";

describe("Canada country folder", () => {
  it("provides every member of the folder contract", () => {
    expect(CA.id).toBe("CA");
    for (const member of [
      "identity",
      "institutions",
      "elections",
      "economy",
      "geography",
      "eras",
    ] as const) {
      expect(Object.keys(CA[member]).length, member).toBeGreaterThan(0);
    }
    expect(COUNTRY_CONFIGS.CA).toBe(CA.institutions.config);
  });

  it("covers every shipping preset with an explicit era entry", () => {
    for (const preset of SHIPPING_PRESETS) {
      expect(CA.eras[preset].preset).toBe(preset);
    }
  });

  it("is a parliamentary country with a surface", () => {
    expect(CA.institutions.config.governmentType).toBe("parliamentaryMonarchy");
    expect(CA.identity.parliamentarySurface?.headPlaque.title).toBe("Prime Minister");
  });
});

describe("Canada regions", () => {
  it("has 13 provinces and territories with prefixed ids", () => {
    expect(caRegions2027).toHaveLength(13);
    for (const region of caRegions2027) {
      expect(region._id).toMatch(/^CA_[A-Z]{2}$/);
      expect(region.countryId).toBe("CA");
      expect(region.population).toBeGreaterThan(0);
      expect(region.gdp).toBeGreaterThan(0);
    }
  });

  it("elects 343 MPs, 105 senators and 778 provincial members in total", () => {
    const commons = caRegions2027.reduce((sum, r) => sum + r.houseDistricts, 0);
    const senate = caRegions2027.reduce((sum, r) => sum + r.stateSenateSeats, 0);
    expect(commons).toBe(343);
    expect(senate).toBe(105);
    expect(CA.elections.seats?.totals).toEqual({
      caCommons: 343,
      caSenate: 105,
      provincialLegislature: 778,
    });
    expect(CA.institutions.config.legislature.lowerChamber.seats).toBe(343);
    expect(CA.institutions.config.legislature.upperChamber?.seats).toBe(105);
    expect(CA.institutions.config.coalitionThreshold).toBe(172);
  });

  it("uses the 2023 redistribution seat counts", () => {
    const seats = Object.fromEntries(caRegions2027.map((r) => [r._id, r.houseDistricts]));
    expect(seats).toMatchObject({
      CA_ON: 122,
      CA_QC: 78,
      CA_BC: 43,
      CA_AB: 37,
      CA_MB: 14,
      CA_SK: 14,
      CA_NS: 11,
      CA_NB: 10,
      CA_NL: 7,
      CA_PE: 4,
      CA_YT: 1,
      CA_NT: 1,
      CA_NU: 1,
    });
  });

  it("totals about 41.8 million people and 3.45 trillion dollars of output", () => {
    const population = caRegions2027.reduce((sum, r) => sum + r.population, 0);
    const gdpMillions = caRegions2027.reduce((sum, r) => sum + r.gdp, 0);
    expect(population).toBe(41_789_000);
    expect(gdpMillions).toBe(3_450_000);
  });

  it("keeps adjacency symmetric and inside the region set", () => {
    const ids = new Set(caRegions2027.map((r) => r._id));
    expect(new Set(Object.keys(CA_ADJACENCY_MAP))).toEqual(ids);
    for (const [from, neighbours] of Object.entries(CA_ADJACENCY_MAP)) {
      for (const to of neighbours) {
        expect(ids.has(to), `${from} -> ${to}`).toBe(true);
        expect(CA_ADJACENCY_MAP[to], `${to} -> ${from}`).toContain(from);
      }
    }
  });

  it("names every region the same way in the facts and the region documents", () => {
    expect(CA_REGION_NAMES).toEqual(Object.fromEntries(caRegions2027.map((r) => [r._id, r.name])));
  });

  it("seeds one metrics document per region", () => {
    expect(caStateMetrics.map((m) => m._id).sort()).toEqual(caRegions2027.map((r) => r._id).sort());
  });
});

describe("Canada parties", () => {
  it("authors five real parties valid for 2027 only", () => {
    expect(caParties.map((p) => [p.name, p.abbreviation])).toEqual([
      ["Liberal Party of Canada", "LIB"],
      ["Conservative Party of Canada", "CON"],
      ["New Democratic Party", "NDP"],
      ["Bloc Québécois", "BQ"],
      ["Green Party of Canada", "GRN"],
    ]);
    expect(caParties).toHaveLength(5);
    for (const party of caParties) {
      expect(party.countryId).toBe("CA");
      expect(party.validForPresets).toEqual(["2027-default"]);
    }
    expect(new Set(caParties.map((p) => p.abbreviation)).size).toBe(5);
  });

  it("retains the Bloc's historical Quebec vote shares without inventing support elsewhere", () => {
    for (const [regionId, shares] of Object.entries(CA_REGION_POLLING_2025)) {
      const share = shares.ca_laurentian ?? 0;
      if (regionId === "CA_QC") expect(share).toBeGreaterThan(0);
      else expect(share, regionId).toBe(0);
    }
  });

  it("covers every region and never exceeds 100 percent", () => {
    expect(Object.keys(CA_REGION_POLLING_2025).sort()).toEqual(
      caRegions2027.map((r) => r._id).sort()
    );
    for (const [regionId, shares] of Object.entries(CA_REGION_POLLING_2025)) {
      expect(Object.keys(shares).sort(), regionId).toEqual(
        Object.keys(CA_PARTY_SLUG_TO_NAME).sort()
      );
      const total = Object.values(shares).reduce((a, b) => a + b, 0);
      expect(total, regionId).toBeLessThanOrEqual(100);
      expect(total, regionId).toBeGreaterThan(85);
    }
  });
});
