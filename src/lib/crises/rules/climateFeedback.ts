import { fundingResponse } from "@/lib/metricEngine/spendingChannel";
import { ENV_SPEND_HALF_SAT } from "@/lib/metricEngine/registry/environment";

/** Bounded, global climate exposure derived from population-weighted emissions. */
export interface EmissionsRegion {
  population: number;
  tonsPerCapita: number;
}

export interface ClimateExposure {
  pressure: number;
  globalTonsPerCapita: number;
}

/**
 * How a world's atmosphere responds to emissions. Pressure moves once a year by
 * `pressurePerExcessTonYear` for every ton per capita above the baseline, or
 * falls by `recoveryPerYear` when emissions sit at or under it.
 */
export interface ClimateProfile {
  /** Pressure before the first annual sample. */
  startingPressure: number;
  baselineTonsPerCapita: number;
  pressurePerExcessTonYear: number;
  recoveryPerYear: number;
  /**
   * Farm yields, heat-driven power demand, insurance costs and uninsured
   * disaster losses respond to pressure. Off for worlds that have not opted in.
   */
  broaderEffects: boolean;
}

/** Built for centuries of play: from zero, 6 t per capita reaches about 0.28 after 23 years. */
export const DEFAULT_CLIMATE_PROFILE: ClimateProfile = {
  startingPressure: 0,
  baselineTonsPerCapita: 4,
  pressurePerExcessTonYear: 0.006,
  recoveryPerYear: 0.002,
  broaderEffects: false,
};

/**
 * The 2027 world (game design). It opens on 0.20 of accumulated pressure and
 * has 23 annual samples (2027 through 2049) before 2050. The opening world
 * weighs in at about 7.5 t CO2 per capita once budget effort is applied
 * (China and the US dominate the population weighting). Three reference paths
 * from that opening, linear over the 23 samples:
 *
 * - delayed: holds at 7.5 t.
 *   0.20 + 23 x (7.5 - 5.3) x 0.0078 = 0.595.
 * - central: 7.5 t falling to 6.0 t (stated policies), mean excess 1.45 t.
 *   0.20 + 23 x 1.45 x 0.0078 = 0.460.
 * - fast: 7.5 t falling to 4.5 t. Above the 5.3 t baseline for the first 17
 *   samples (excess sum about 18.9 ton-years, +0.147), then 6 years of
 *   recovery at 0.001 (-0.006): about 0.34.
 *
 * Against the default profile the per-ton effect is 30% stronger (0.0078 vs
 * 0.006) while the higher baseline (5.3 vs 4 t) leaves room for a transition
 * to stop the rise within the game's 24 years. `CLIMATE_REFERENCE_PATHS_2027`
 * holds the three paths; the rules tests replay them.
 */
export const WORLD_2027_CLIMATE_PROFILE: ClimateProfile = {
  startingPressure: 0.2,
  baselineTonsPerCapita: 5.3,
  pressurePerExcessTonYear: 0.0078,
  recoveryPerYear: 0.001,
  broaderEffects: true,
};

/** Presets opt in by starting year; every other world keeps the default profile. */
const CLIMATE_PROFILES_BY_STARTING_YEAR: Readonly<Record<number, ClimateProfile>> = {
  2027: WORLD_2027_CLIMATE_PROFILE,
};

export function climateProfileForStartingYear(startingYear: number | undefined): ClimateProfile {
  return (
    (startingYear !== undefined ? CLIMATE_PROFILES_BY_STARTING_YEAR[startingYear] : undefined) ??
    DEFAULT_CLIMATE_PROFILE
  );
}

/** Annual global tons per capita for the 2027 reference paths, one value per sample. */
export const CLIMATE_REFERENCE_PATHS_2027: Readonly<
  Record<"fast" | "central" | "delayed", number[]>
> = {
  fast: Array.from({ length: 23 }, (_, year) => 7.5 - (3 * year) / 22),
  central: Array.from({ length: 23 }, (_, year) => 7.5 - (1.5 * year) / 22),
  delayed: Array.from({ length: 23 }, () => 7.5),
};

/** Replays one sample per year from the profile's starting pressure. */
export function replayClimatePath(
  annualTonsPerCapita: readonly number[],
  profile: ClimateProfile
): number {
  let pressure = profile.startingPressure;
  for (const tons of annualTonsPerCapita)
    pressure = advanceClimateExposure(pressure, tons, 1, profile).pressure;
  return pressure;
}

const clamp = (value: number, lower: number, upper: number) =>
  Math.max(lower, Math.min(upper, value));

/** Budget effort and funded climate programmes change physical emissions. */
export function effectiveEmissions(
  seedTonsPerCapita: number,
  environmentSpendPerCapita: number,
  agencyNudge = 0
): number {
  const spending = Number.isFinite(environmentSpendPerCapita)
    ? Math.max(0, environmentSpendPerCapita)
    : 0;
  const programme = Number.isFinite(agencyNudge) ? agencyNudge : 0;
  return clamp(
    seedTonsPerCapita - fundingResponse(spending, ENV_SPEND_HALF_SAT, 100) * 0.02 + programme,
    0,
    60
  );
}

/** An absent region metric is omitted rather than silently read as zero emissions. */
export function populationWeightedEmissions(regions: readonly EmissionsRegion[]): number | null {
  let people = 0;
  let tonnes = 0;
  for (const region of regions) {
    if (
      !Number.isFinite(region.population) ||
      region.population <= 0 ||
      !Number.isFinite(region.tonsPerCapita) ||
      region.tonsPerCapita < 0
    )
      continue;
    people += region.population;
    tonnes += region.population * region.tonsPerCapita;
  }
  return people > 0 ? tonnes / people : null;
}

/** A year's emissions affect future risk gradually; lower emissions slowly reduce exposure. */
export function advanceClimateExposure(
  priorPressure: number,
  globalTonsPerCapita: number,
  elapsedYears: number,
  profile: ClimateProfile = DEFAULT_CLIMATE_PROFILE
): ClimateExposure {
  if (
    !Number.isFinite(priorPressure) ||
    !Number.isFinite(globalTonsPerCapita) ||
    !Number.isFinite(elapsedYears) ||
    globalTonsPerCapita < 0 ||
    elapsedYears < 0
  )
    throw new Error("Climate exposure inputs must be finite and non-negative");
  const changePerYear =
    globalTonsPerCapita > profile.baselineTonsPerCapita
      ? (globalTonsPerCapita - profile.baselineTonsPerCapita) * profile.pressurePerExcessTonYear
      : -profile.recoveryPerYear;
  return {
    pressure: clamp(priorPressure + changePerYear * Math.min(elapsedYears, 5), 0, 1),
    globalTonsPerCapita,
  };
}

/** Geophysical and industrial events do not become more likely from climate pressure. */
export const WEATHER_DISASTER_KEYS = new Set([
  "hurricane",
  "wildfire",
  "drought_famine",
  "extreme_heat",
  "tornado",
  "flood",
  "winter_storm",
  "dust_storm",
  "hailstorm",
  "king_tide_flooding",
  "forest_pest_outbreak",
]);

/** Adaptation reduces regional loss; exposure never multiplies it above 1.5. */
export function climateLossMultiplier(pressure: number, resilience: number): number {
  const exposed = clamp(Number.isFinite(pressure) ? pressure : 0, 0, 1);
  const protectedShare = clamp(Number.isFinite(resilience) ? resilience / 100 : 0.5, 0, 1);
  return 1 + 0.5 * exposed * (1 - protectedShare);
}

/** Weather-only early opening is bounded to a 108-turn minimum from the 144-turn base. */
export function weatherDisasterCadence(baseCadence: number, pressure: number): number {
  const exposed = clamp(Number.isFinite(pressure) ? pressure : 0, 0, 1);
  return Math.max(Math.round(baseCadence * 0.75), Math.round(baseCadence / (1 + 0.3 * exposed)));
}
