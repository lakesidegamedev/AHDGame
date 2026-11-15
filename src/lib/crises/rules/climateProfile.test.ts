import { describe, expect, it } from "vitest";
import {
  advanceClimateExposure,
  CLIMATE_REFERENCE_PATHS_2027,
  climateProfileForStartingYear,
  DEFAULT_CLIMATE_PROFILE,
  replayClimatePath,
  WORLD_2027_CLIMATE_PROFILE,
} from "./climateFeedback";

describe("2027 climate profile", () => {
  it("opens the 2027 world on 0.20 and leaves every other preset on the default", () => {
    expect(climateProfileForStartingYear(2027)).toBe(WORLD_2027_CLIMATE_PROFILE);
    expect(WORLD_2027_CLIMATE_PROFILE.startingPressure).toBe(0.2);
    expect(WORLD_2027_CLIMATE_PROFILE.broaderEffects).toBe(true);
    for (const year of [undefined, 1953, 1979, 1991, 1999, 2007, 2019, 2023])
      expect(climateProfileForStartingYear(year)).toBe(DEFAULT_CLIMATE_PROFILE);
    expect(DEFAULT_CLIMATE_PROFILE).toEqual({
      startingPressure: 0,
      baselineTonsPerCapita: 4,
      pressurePerExcessTonYear: 0.006,
      recoveryPerYear: 0.002,
      broaderEffects: false,
    });
  });

  it("keeps the default response when no profile is passed", () => {
    expect(advanceClimateExposure(0, 7, 1).pressure).toBeCloseTo(0.018);
    expect(advanceClimateExposure(0.1, 3, 1).pressure).toBeCloseTo(0.098);
  });

  it("separates fast, central and delayed transitions by 2050", () => {
    const fast = replayClimatePath(CLIMATE_REFERENCE_PATHS_2027.fast, WORLD_2027_CLIMATE_PROFILE);
    const central = replayClimatePath(
      CLIMATE_REFERENCE_PATHS_2027.central,
      WORLD_2027_CLIMATE_PROFILE
    );
    const delayed = replayClimatePath(
      CLIMATE_REFERENCE_PATHS_2027.delayed,
      WORLD_2027_CLIMATE_PROFILE
    );
    expect(fast).toBeCloseTo(0.35, 1);
    expect(central).toBeCloseTo(0.45, 1);
    expect(delayed).toBeCloseTo(0.6, 1);
    expect(fast).toBeLessThan(central - 0.08);
    expect(central).toBeLessThan(delayed - 0.1);
  });

  it("responds harder per excess ton than the default profile", () => {
    expect(WORLD_2027_CLIMATE_PROFILE.pressurePerExcessTonYear).toBeGreaterThan(
      DEFAULT_CLIMATE_PROFILE.pressurePerExcessTonYear
    );
  });
});
