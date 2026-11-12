import type { NppTurnoverConfig } from "./turnoverConfig";

/**
 * When NPP turnover is on (or under V5), seated NPPs age each game year, can die
 * and, with the turnover flag, retire; successors inherit seats.
 * These pure calculations use the supplied year, turn count, and RNG, with no database access.
 * @see nppDiesThisTurn
 */

export interface NppMortalityEligibilityInput {
  birthYear?: number | null;
  isTechnocrat?: boolean;
  currentOffice?: unknown | null;
  retiredAt?: Date | null;
  /** A financial actor represents filed individual people, rather than one deputy. */
  representsNativeSlate?: boolean;
}

export function isEligibleNppForMortality(npp: NppMortalityEligibilityInput): boolean {
  return (
    npp.retiredAt == null &&
    npp.birthYear != null &&
    Number.isFinite(npp.birthYear) &&
    npp.isTechnocrat !== true &&
    npp.representsNativeSlate !== true &&
    npp.currentOffice != null
  );
}

/** Age in whole game years. Null means the birth year is not recorded. */
export function nppAgeAtYear(
  npp: Pick<NppMortalityEligibilityInput, "birthYear">,
  year: number
): number | null {
  if (npp.birthYear == null || !Number.isFinite(npp.birthYear)) return null;
  return year - npp.birthYear;
}

/** Annual death probability for a sitting politician at the supplied age. */
export function annualDeathProbability(age: number, config: NppTurnoverConfig["death"]): number {
  if (!Number.isFinite(age) || age < 0) return 0;
  const p = config.baseAnnual * Math.exp(config.exponentPerYear * age);
  return Math.min(p, config.maxAnnual);
}

/** Roll one turn of mortality using an injected RNG and turns-per-year value. */
export function nppDiesThisTurn(
  age: number,
  rng: () => number,
  turnsPerYear: number,
  config: NppTurnoverConfig["death"]
): boolean {
  if (!Number.isFinite(turnsPerYear) || turnsPerYear <= 0) return false;
  return rng() < annualDeathProbability(age, config) / turnsPerYear;
}

/** Generate a working-age replacement birth year from an injected RNG. */
export function randomReplacementBirthYear(
  currentYear: number,
  rng: () => number,
  config: NppTurnoverConfig["replacement"]
): number {
  const age = config.minAge + Math.floor(rng() * config.ageSpan);
  return currentYear - age;
}

/**
 * Annual retirement probability for a sitting politician at the supplied age.
 * Zero below the start age, then a linear climb to the maximum, held after.
 */
export function annualRetirementProbability(
  age: number,
  config: NppTurnoverConfig["retirement"]
): number {
  if (!Number.isFinite(age) || age < config.startAge) return 0;
  const climb = (age - config.startAge) / (config.maxAge - config.startAge);
  return Math.min(
    config.maxAnnual,
    config.startAnnual + climb * (config.maxAnnual - config.startAnnual)
  );
}

/** Roll one turn of retirement using an injected RNG and turns-per-year value. */
export function nppRetiresThisTurn(
  age: number,
  rng: () => number,
  turnsPerYear: number,
  config: NppTurnoverConfig["retirement"]
): boolean {
  if (!Number.isFinite(turnsPerYear) || turnsPerYear <= 0) return false;
  return rng() < annualRetirementProbability(age, config) / turnsPerYear;
}

/**
 * Per-turn retirement chance for a party leader or head of government.
 * Outside the window before their term ends it is zero, unless the leader is
 * past the mid-term age or has no known term end. Inside it, the chance a
 * leader would have retired over a whole term is spread across the window, so
 * leaders retire between terms as often as they would have mid-term.
 */
export function leaderRetirementChancePerTurn(
  age: number,
  turnsToTermEnd: number | null,
  turnsPerYear: number,
  retirement: NppTurnoverConfig["retirement"],
  leaders: NppTurnoverConfig["leaders"]
): number {
  const perTurn = annualRetirementProbability(age, retirement) / turnsPerYear;
  if (age >= leaders.midTermRetirementAge || turnsToTermEnd === null) return perTurn;
  if (turnsToTermEnd < 0 || turnsToTermEnd > leaders.windowTurns) return 0;
  const overTerm = 1 - Math.pow(1 - perTurn, leaders.termTurns);
  return 1 - Math.pow(1 - overTerm, 1 / leaders.windowTurns);
}

/**
 * Deterministic stand-in birth year for an office-holder seeded without one,
 * so they can age out. The id seeds an age in the configured range; the same
 * id always gets the same age.
 */
export function backfillBirthYear(
  id: string,
  currentYear: number,
  config: NppTurnoverConfig["backfill"]
): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const age = config.minAge + ((hash >>> 0) % config.ageSpan);
  return currentYear - age;
}
