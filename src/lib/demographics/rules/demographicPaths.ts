/**
 * Country fertility and mortality paths for presets that opt in (the 2027
 * world). These are invented game trajectories, not forecasts.
 *
 * Fertility: each country has a 2027 total fertility rate and a central 2050
 * value; the path interpolates linearly by game year and holds flat outside
 * that window. The demography policy score moves the national level by up to
 * POLICY_TFR_SWING either way. A region keeps its authored character as a
 * ratio of its seeded birthRate index to its country's mean.
 *
 * Mortality: a Gompertz hazard A·e^(B·age) shifted g years older is the same
 * curve scaled by e^(-B·g), so a life-expectancy gain of g years is a hazard
 * multiplier of e^(-B·g). The gain grows LE_GAIN_PER_YEAR per game year from
 * 2027 and stops in 2060.
 *
 * Both paths are LEVELS indexed by the game year, not per-turn rates, so
 * nothing compounds turn over turn. The single per-turn conversion stays in
 * computeBirths and applyMortality (divide the annual figure by turnsPerYear).
 */
import { birthRateIndexToTFR } from "../flows/fertility";
import { GOMPERTZ_B } from "../flows/mortality";

export const PATH_START_YEAR = 2027;
export const FERTILITY_PATH_END_YEAR = 2050;
export const MORTALITY_PATH_END_YEAR = 2060;

/** Presets whose demography runs on country paths instead of the replacement anchor. */
const PATH_PRESETS: ReadonlySet<string> = new Set(["2027-default"]);

export function presetUsesDemographicPaths(preset: string | undefined): boolean {
  return preset !== undefined && PATH_PRESETS.has(preset);
}

export interface FertilityPath {
  /** Total fertility rate in 2027 (births per woman). */
  start: number;
  /** Central total fertility rate in 2050. */
  end: number;
}

export const COUNTRY_FERTILITY_PATHS: Readonly<Record<string, FertilityPath>> = {
  US: { start: 1.6, end: 1.55 },
  UK: { start: 1.45, end: 1.45 },
  DE: { start: 1.38, end: 1.4 },
  JP: { start: 1.15, end: 1.2 },
  CN: { start: 1.0, end: 1.05 },
};

/** Rich-world default for any other country simulated on the 2027 paths. */
export const DEFAULT_FERTILITY_PATH: FertilityPath = { start: 1.5, end: 1.45 };

/** Policy moves the national TFR by at most this much either way. */
export const POLICY_TFR_SWING = 0.3;
/** Regional spread is bounded so an outlier seed cannot double or halve births. */
export const REGIONAL_RATIO_MIN = 0.7;
export const REGIONAL_RATIO_MAX = 1.4;
const TFR_FLOOR = 0.5;
const TFR_CEILING = 4;

/** Central life-expectancy gain per game year, by country. */
export const COUNTRY_LE_GAIN_PER_YEAR: Readonly<Record<string, number>> = {
  US: 0.15,
  UK: 0.15,
  DE: 0.15,
  JP: 0.15,
  CN: 0.15,
};
export const DEFAULT_LE_GAIN_PER_YEAR = 0.15;
/** Never cut base mortality by more than half, however long the world runs. */
export const MORTALITY_IMPROVEMENT_FLOOR = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Central TFR for a country in a game year: linear 2027 to 2050, flat outside. */
export function pathTfr(countryId: string, year: number): number {
  const path = COUNTRY_FERTILITY_PATHS[countryId] ?? DEFAULT_FERTILITY_PATH;
  const t = clamp((year - PATH_START_YEAR) / (FERTILITY_PATH_END_YEAR - PATH_START_YEAR), 0, 1);
  return path.start + (path.end - path.start) * t;
}

/** Demography policy score (0-100, neutral 50) as a TFR shift within the swing. */
export function policyTfrShift(demographyScore: number | null): number {
  if (demographyScore == null || !Number.isFinite(demographyScore)) return 0;
  return ((clamp(demographyScore, 0, 100) - 50) / 50) * POLICY_TFR_SWING;
}

/**
 * A region's fertility relative to its country, from the seeded birthRate
 * indices. The legacy index to TFR map gives the shape; the anchor cancels.
 */
export function regionalFertilityRatio(regionIndex: number, countryMeanIndex: number): number {
  const mean = birthRateIndexToTFR(countryMeanIndex, 1);
  if (!(mean > 0)) return 1;
  return clamp(birthRateIndexToTFR(regionIndex, 1) / mean, REGIONAL_RATIO_MIN, REGIONAL_RATIO_MAX);
}

/** Annual TFR for one region on its country path. */
export function regionPathTfr(input: {
  countryId: string;
  year: number;
  demographyScore: number | null;
  regionIndex: number;
  countryMeanIndex: number;
}): number {
  const national = pathTfr(input.countryId, input.year) + policyTfrShift(input.demographyScore);
  const ratio = regionalFertilityRatio(input.regionIndex, input.countryMeanIndex);
  return clamp(national * ratio, TFR_FLOOR, TFR_CEILING);
}

/** Cumulative central life-expectancy gain (years) since 2027, flat after 2060. */
export function lifeExpectancyGain(countryId: string, year: number): number {
  const perYear = COUNTRY_LE_GAIN_PER_YEAR[countryId] ?? DEFAULT_LE_GAIN_PER_YEAR;
  const elapsed = clamp(year, PATH_START_YEAR, MORTALITY_PATH_END_YEAR) - PATH_START_YEAR;
  return perYear * elapsed;
}

/**
 * Multiplier on the annual base mortality schedule that raises life
 * expectancy by `lifeExpectancyGain`. Applied on top of the healthcare
 * modifier, which keeps its own bounds.
 */
export function mortalityImprovementFactor(countryId: string, year: number): number {
  const factor = Math.exp(-GOMPERTZ_B * lifeExpectancyGain(countryId, year));
  return clamp(factor, MORTALITY_IMPROVEMENT_FLOOR, 1);
}
