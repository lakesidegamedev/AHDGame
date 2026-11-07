/**
 * Technology diffusion by country (issue #5689).
 *
 * A production method's tier opens on the calendar, but a country only gets
 * the method once its technology readiness lets it: 3 years after the tier
 * year for readiness above 0.7, 7 years from 0.4 to 0.7, and 12 years below
 * 0.4. Where a foreign company already runs the method, a player company may
 * license it and open it up to 3 years sooner, never before the tier year.
 * NPP corporations do not license: they adopt at the country lag.
 *
 * Readiness is a 0 to 1 index of R&D spend, education, energy surplus and
 * trade openness. A missing input counts as neutral (half marks), so a country
 * with no readings sits in the middle band.
 *
 * Plain data in, plain data out. Opt-in per preset; other worlds never pass
 * a country context and keep the calendar-only gate.
 */
import type { SectorStrategy } from "../sectorStrategyTypes";
import { getDecadeById } from "./decades";

/** Presets whose methods diffuse country by country. */
const DIFFUSION_PRESETS: ReadonlySet<string> = new Set(["2027-default"]);

export function presetUsesTechDiffusion(preset: string | undefined): boolean {
  return preset !== undefined && DIFFUSION_PRESETS.has(preset);
}

export interface TechReadinessInputs {
  /** R&D spending, percent of GDP (economic.rdIntensity). */
  rdIntensityPct?: number;
  /** Adults with tertiary education, percent (the 2027 education index). */
  tertiaryAttainmentPct?: number;
  /** Energy produced over energy consumed (1 = self-sufficient). */
  energySupplyRatio?: number;
  /** Exports, percent of GDP (economic.exportDependency). */
  exportSharePct?: number;
}

/** Component weights; they sum to 1. */
export const READINESS_WEIGHTS = {
  rd: 0.35,
  education: 0.3,
  energy: 0.15,
  trade: 0.2,
} as const;

/** R&D intensity (percent of GDP) that earns full marks. */
const RD_FULL_MARKS_PCT = 3.5;
/** Tertiary attainment (percent) that earns full marks. */
const TERTIARY_FULL_MARKS_PCT = 60;
/** Energy supply ratio at zero and at full marks. */
const ENERGY_ZERO_RATIO = 0.5;
const ENERGY_FULL_MARKS_RATIO = 1.1;
/** Export share (percent of GDP) that earns full marks. */
const EXPORT_FULL_MARKS_PCT = 50;
const NEUTRAL_COMPONENT = 0.5;

function score(value: number | undefined, zero: number, full: number): number {
  if (value === undefined || !Number.isFinite(value)) return NEUTRAL_COMPONENT;
  return Math.max(0, Math.min(1, (value - zero) / (full - zero)));
}

/** Technology readiness, 0 to 1, rounded to 3 dp. */
export function computeTechReadiness(inputs: TechReadinessInputs): number {
  const readiness =
    READINESS_WEIGHTS.rd * score(inputs.rdIntensityPct, 0, RD_FULL_MARKS_PCT) +
    READINESS_WEIGHTS.education * score(inputs.tertiaryAttainmentPct, 0, TERTIARY_FULL_MARKS_PCT) +
    READINESS_WEIGHTS.energy *
      score(inputs.energySupplyRatio, ENERGY_ZERO_RATIO, ENERGY_FULL_MARKS_RATIO) +
    READINESS_WEIGHTS.trade * score(inputs.exportSharePct, 0, EXPORT_FULL_MARKS_PCT);
  return Math.round(readiness * 1000) / 1000;
}

/** Readiness assumed for a country with no readiness entry at all. */
export const DEFAULT_TECH_READINESS = 0.5;

export const ADOPTION_LAG_YEARS = { high: 3, mid: 7, low: 12 } as const;
export const HIGH_READINESS = 0.7;
export const LOW_READINESS = 0.4;
/** Most years licensing from a foreign operator can take off the lag. */
export const LICENSING_DISCOUNT_YEARS = 3;

/** Years after a tier's start before a country of this readiness adopts its methods. */
export function adoptionLagYears(readiness: number): number {
  if (readiness > HIGH_READINESS) return ADOPTION_LAG_YEARS.high;
  if (readiness >= LOW_READINESS) return ADOPTION_LAG_YEARS.mid;
  return ADOPTION_LAG_YEARS.low;
}

/** Who is adopting: a player company may license, an NPP corporation follows the country. */
export type DiffusionAdopter = "player" | "npp";

export interface StrategyCountryContext {
  readiness: number;
  /** A company in another country already runs the method. */
  foreignOperated: boolean;
  adopter: DiffusionAdopter;
}

/**
 * First calendar year the method is open in the country, or undefined for a
 * method with no tier (no `minDecade`), which diffusion does not delay.
 */
export function strategyOpenYear(
  strategy: Pick<SectorStrategy, "minDecade">,
  country: StrategyCountryContext
): number | undefined {
  if (!strategy.minDecade) return undefined;
  const tier = getDecadeById(strategy.minDecade);
  if (!tier) return undefined;
  const lag = adoptionLagYears(country.readiness);
  const licensing =
    country.adopter === "player" && country.foreignOperated
      ? Math.min(LICENSING_DISCOUNT_YEARS, lag)
      : 0;
  return tier.startYear + lag - licensing;
}

/** Per-turn diffusion facts: readiness by country and where each gated method already runs. */
export interface TechDiffusionSnapshot {
  readinessByCountry: ReadonlyMap<string, number>;
  /** Strategy id to the countries where some company runs it. */
  operatorCountriesByStrategy: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The country context for one company in one country, from the turn's snapshot. */
export function countryDiffusionContext(
  snapshot: TechDiffusionSnapshot | undefined,
  countryId: string | undefined,
  adopter: DiffusionAdopter,
  strategyId: string
): StrategyCountryContext | undefined {
  if (!snapshot || !countryId) return undefined;
  const operators = snapshot.operatorCountriesByStrategy.get(strategyId);
  let foreignOperated = false;
  if (operators) {
    for (const operatorCountry of operators) {
      if (operatorCountry !== countryId) {
        foreignOperated = true;
        break;
      }
    }
  }
  return {
    readiness: snapshot.readinessByCountry.get(countryId) ?? DEFAULT_TECH_READINESS,
    foreignOperated,
    adopter,
  };
}

/** Collect which countries run each strategy, from sector rows. */
export function operatorCountriesByStrategy(
  sectors: Iterable<{ strategyId?: string | null; countryId?: string | null; mothballed?: boolean }>
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const sector of sectors) {
    if (!sector.strategyId || !sector.countryId || sector.mothballed === true) continue;
    const set = out.get(sector.strategyId) ?? new Set<string>();
    set.add(sector.countryId);
    out.set(sector.strategyId, set);
  }
  return out;
}

/** Population-weighted mean of the readings present; undefined when none are. */
export function weightedMean(
  rows: readonly { value: number | undefined; weight: number }[]
): number | undefined {
  let total = 0;
  let weighted = 0;
  for (const row of rows) {
    if (row.value === undefined || !Number.isFinite(row.value)) continue;
    const weight = Number.isFinite(row.weight) && row.weight > 0 ? row.weight : 1;
    total += weight;
    weighted += row.value * weight;
  }
  return total > 0 ? weighted / total : undefined;
}
