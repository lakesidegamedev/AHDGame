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
export function annualDeathProbability(age: number): number {
  if (!Number.isFinite(age) || age < 0) return 0;
  const p = 0.00005 * Math.exp(0.095 * age);
  return Math.min(p, 0.5);
}

/** Roll one turn of mortality using an injected RNG and turns-per-year value. */
export function nppDiesThisTurn(age: number, rng: () => number, turnsPerYear: number): boolean {
  if (!Number.isFinite(turnsPerYear) || turnsPerYear <= 0) return false;
  return rng() < annualDeathProbability(age) / turnsPerYear;
}

/** Generate a working-age replacement birth year from an injected RNG. */
export function randomReplacementBirthYear(currentYear: number, rng: () => number): number {
  const age = 32 + Math.floor(rng() * 37);
  return currentYear - age;
}

/**
 * Annual retirement probability for a sitting politician at the supplied age.
 * Nobody retires before 70; from 70 the chance climbs linearly from 5% to 35%
 * at 80 and holds there.
 */
export function annualRetirementProbability(age: number): number {
  if (!Number.isFinite(age) || age < 70) return 0;
  return Math.min(0.35, 0.05 + ((age - 70) * 0.3) / 10);
}

/** Roll one turn of retirement using an injected RNG and turns-per-year value. */
export function nppRetiresThisTurn(age: number, rng: () => number, turnsPerYear: number): boolean {
  if (!Number.isFinite(turnsPerYear) || turnsPerYear <= 0) return false;
  return rng() < annualRetirementProbability(age) / turnsPerYear;
}

/**
 * Deterministic stand-in birth year for an office-holder seeded without one,
 * so they can age out. The id seeds an age of 35-70 at the supplied year; the
 * same id always gets the same age.
 */
export function backfillBirthYear(id: string, currentYear: number): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const age = 35 + ((hash >>> 0) % 36);
  return currentYear - age;
}
