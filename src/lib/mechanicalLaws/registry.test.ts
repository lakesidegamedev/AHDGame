import { describe, expect, it } from "vitest";
import type { CountryId } from "@/lib/constants/countries";
import {
  ANTITRUST_LAW_BY_COUNTRY,
  MERGER_AUTHORITY_SEAT_BY_COUNTRY,
} from "@/lib/corporations/mergerReview/constants";
import { MECHANICAL_LAW_ID_SUFFIX, mechanicalLegislationTypes } from "./legislation";
import { MECHANICAL_LAW_BASELINE, mechanicalLawId, mechanicalLawKeyForId } from "./registry";

describe("mechanicalLawId", () => {
  it("uses the new-generation competition law for the US", () => {
    expect(mechanicalLawId("US", "competition")).toBe(ANTITRUST_LAW_BY_COUNTRY.US);
  });

  it("derives a generated id for a country without a new-generation catalog", () => {
    expect(mechanicalLawId("FR", "competition")).toBe("fr_competition_law");
  });

  it("derives the subsidiary limits id for the US", () => {
    expect(mechanicalLawId("US", "subsidiaryLimits")).toBe("us_subsidiary_limits_law");
  });

  it("has no law for a country with no prefix, such as a reserved scope", () => {
    expect(mechanicalLawId("SCO" as CountryId, "competition")).toBeNull();
  });
});

describe("mechanicalLawKeyForId", () => {
  it("returns the right key for every generated type", () => {
    for (const type of mechanicalLegislationTypes) {
      const matches = Object.entries(MECHANICAL_LAW_ID_SUFFIX)
        .filter(([, suffix]) => type._id.endsWith(suffix))
        .map(([key]) => key);
      expect(matches, type._id).toHaveLength(1);
      expect(mechanicalLawKeyForId(type._id), type._id).toBe(matches[0]);
    }
  });

  it("returns null for a law that is not mechanical", () => {
    expect(mechanicalLawKeyForId("fr_banking_separation")).toBeNull();
  });
});

describe("MECHANICAL_LAW_BASELINE", () => {
  it("holds an integer level from 0 to 4 for every law key", () => {
    for (const [key, level] of Object.entries(MECHANICAL_LAW_BASELINE)) {
      expect(Number.isInteger(level), key).toBe(true);
      expect(level, key).toBeGreaterThanOrEqual(0);
      expect(level, key).toBeLessThanOrEqual(4);
    }
  });
});

describe("MERGER_AUTHORITY_SEAT_BY_COUNTRY", () => {
  it("has a seat for every country that has a mechanical competition law in the map", () => {
    for (const countryId of Object.keys(MERGER_AUTHORITY_SEAT_BY_COUNTRY) as CountryId[]) {
      const lawId = mechanicalLawId(countryId, "competition");
      if (!lawId) continue;
      expect(MERGER_AUTHORITY_SEAT_BY_COUNTRY[countryId], countryId).toBeTruthy();
    }
  });

  it("seats the four new-generation competition countries", () => {
    for (const countryId of Object.keys(ANTITRUST_LAW_BY_COUNTRY) as CountryId[]) {
      expect(MERGER_AUTHORITY_SEAT_BY_COUNTRY[countryId], countryId).toBeTruthy();
    }
  });
});
