import { describe, expect, it } from "vitest";
import { supportsNoStartingParties } from "@/lib/admin/startingPartiesPresets";
import {
  nppCorpSpawnPlan,
  spawnsNppCorporations,
  spawnsRunCountryCompetitors,
} from "@/lib/admin/seed/seedNppCorporations";
import { SEED_PRESET_IDS, getStartingYearForPreset } from "@/lib/constants/turnTime";

const KNOWN = [...SEED_PRESET_IDS, "empty", "2019-no-parties"];
const FUTURE = "2031-default";

describe("era seed features are default-on with explicit exclusions", () => {
  it("pins which known presets spawn NPP corporations", () => {
    expect(KNOWN.filter(spawnsNppCorporations)).toEqual([
      "1953-default",
      "1979-default",
      "1991-default",
      "1999-default",
      "2007-default",
      "2019-default",
      "2027-default",
    ]);
  });

  it("pins which known presets give NPP-run countries a competitor per market", () => {
    expect(KNOWN.filter(spawnsRunCountryCompetitors)).toEqual(["2027-default"]);
  });

  it("pins which known presets support opening with no parties", () => {
    expect(KNOWN.filter(supportsNoStartingParties)).toEqual(["1991-default", "2027-default"]);
  });

  it("keeps the corporation plan empty exactly where spawning is excluded", () => {
    for (const preset of KNOWN)
      expect(nppCorpSpawnPlan(preset, getStartingYearForPreset(preset)).length > 0).toBe(
        spawnsNppCorporations(preset)
      );
  });

  it("includes an unknown future preset by default", () => {
    expect(spawnsNppCorporations(FUTURE)).toBe(true);
    expect(spawnsRunCountryCompetitors(FUTURE)).toBe(true);
    expect(supportsNoStartingParties(FUTURE)).toBe(true);
  });

  it("still rejects a missing preset for no-starting-parties", () => {
    expect(supportsNoStartingParties(null)).toBe(false);
    expect(supportsNoStartingParties(undefined)).toBe(false);
    expect(supportsNoStartingParties("")).toBe(false);
  });
});
