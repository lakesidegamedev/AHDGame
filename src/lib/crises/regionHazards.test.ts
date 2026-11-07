import { describe, expect, it } from "vitest";
import type { CountryId } from "@/lib/constants/countries";
import { US_GEOGRAPHY } from "@/lib/countries/us/geography";
import { UK_GEOGRAPHY } from "@/lib/countries/uk/geography";
import { DE_GEOGRAPHY } from "@/lib/countries/de/geography";
import { JP_GEOGRAPHY } from "@/lib/countries/jp/geography";
import { CN_GEOGRAPHY } from "@/lib/countries/cn/geography";
import {
  BACKGROUND_NATIONAL_HAZARDS,
  getClimateExposureTags,
  getCountryHazardTags,
  getRegionHazards,
} from "./regionHazards";

const FULL: Record<string, { regionNames: Record<string, string> }> = {
  US: US_GEOGRAPHY,
  UK: UK_GEOGRAPHY,
  DE: DE_GEOGRAPHY,
  JP: JP_GEOGRAPHY,
  CN: CN_GEOGRAPHY,
};
const BACKGROUND = [
  "IE",
  "BR",
  "NG",
  "RU",
  "PL",
  "HU",
  "RO",
  "BG",
  "FR",
  "IT",
  "ES",
  "SE",
  "TR",
  "AT",
  "FI",
  "GR",
] as const;

describe("hazard tags for the 2027 world", () => {
  it("tags every country in the world", () => {
    const countries = [...Object.keys(FULL), ...BACKGROUND] as CountryId[];
    expect(countries).toHaveLength(21);
    for (const id of countries) expect(getCountryHazardTags(id).length, id).toBeGreaterThan(0);
  });

  it("gives every background country a coarse national tag", () => {
    for (const id of BACKGROUND)
      expect(BACKGROUND_NATIONAL_HAZARDS[id]?.length ?? 0, id).toBeGreaterThan(0);
  });

  it("tags every region of the full-simulation countries", () => {
    for (const [id, geography] of Object.entries(FULL)) {
      const untagged = Object.keys(geography.regionNames).filter(
        (r) => getRegionHazards(id as CountryId, r).length === 0
      );
      expect(untagged, id).toEqual([]);
    }
  });

  it("falls back to national tags for a region with none of its own", () => {
    expect(getClimateExposureTags("ES", "ANY")).toContain("arid");
    expect(getClimateExposureTags("US", "AZ")).toEqual(getRegionHazards("US", "AZ"));
  });
});
