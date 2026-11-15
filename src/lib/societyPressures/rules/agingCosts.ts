/**
 * Pension and health cost pressure from the age structure (2027 world).
 *
 * Pension spending follows pensioners per worker: people at or above the
 * pension age over people of working age below it. Health spending follows
 * an age-weighted head count, because an 80-year-old costs a health system
 * several times what a 30-year-old does. Both are measured against the
 * country's own opening reading, so the existing budget lines keep their
 * calibrated level in 2027 and grow or shrink only as the population ages.
 *
 * The pension age is the retirement age plus the shift the pension age
 * indexation law sets; indexation lowers both the pensioner count and the
 * pension bill as life expectancy rises.
 */
import type { AgeSexVector } from "@/lib/demographics/cohortVector";

const LAST_AGE = 100;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** People at each single year of age, both sexes. */
function atAge(v: AgeSexVector, age: number): number {
  return (v.male[age] ?? 0) + (v.female[age] ?? 0);
}

/**
 * People aged at least `from` (fractional: the cohort at floor(from) counts
 * for the share of the year above the threshold).
 */
function atOrAbove(v: AgeSexVector, from: number): number {
  const lo = clamp(from, 0, LAST_AGE);
  const whole = Math.floor(lo);
  let total = atAge(v, whole) * (1 - (lo - whole));
  for (let age = whole + 1; age <= LAST_AGE; age++) total += atAge(v, age);
  return total;
}

/** Pensioners per person of working age. 0 when nobody works. */
export function oldAgeDependency(v: AgeSexVector, workingAge: number, pensionAge: number): number {
  const pensioners = atOrAbove(v, pensionAge);
  const workers = atOrAbove(v, workingAge) - pensioners;
  return workers > 0 ? pensioners / workers : 0;
}

/** Relative health cost per person by age band (game weights, not data). */
export const HEALTH_COST_WEIGHTS: readonly { from: number; weight: number }[] = [
  { from: 0, weight: 0.8 },
  { from: 18, weight: 1 },
  { from: 50, weight: 1.8 },
  { from: 65, weight: 3 },
  { from: 80, weight: 5 },
];

/** Age-weighted health demand per person. */
export function healthDemandPerCapita(v: AgeSexVector): number {
  let weighted = 0;
  let total = 0;
  for (let age = 0; age <= LAST_AGE; age++) {
    const people = atAge(v, age);
    let weight = HEALTH_COST_WEIGHTS[0].weight;
    for (const band of HEALTH_COST_WEIGHTS) if (age >= band.from) weight = band.weight;
    weighted += people * weight;
    total += people;
  }
  return total > 0 ? weighted / total : 0;
}

export const PENSION_SCALE_BOUNDS = [0.5, 3] as const;
export const HEALTH_SCALE_BOUNDS = [0.7, 2] as const;

export interface AgingCostPressure {
  /** Opening readings every later scale is measured against. */
  baselineOldAgeDependency: number;
  baselineHealthDemand: number;
  oldAgeDependency: number;
  healthDemand: number;
  pensionAge: number;
  /** Multiplier on pension spending lines. */
  pensionScale: number;
  /** Multiplier on health spending lines. */
  healthScale: number;
  asOfTurn: number;
}

export function computeAgingCostPressure(input: {
  ages: AgeSexVector;
  turn: number;
  workingAge: number;
  retirementAge: number;
  /** Years the pension age indexation law adds (negative lowers it). */
  pensionAgeShift: number;
  previous?: Pick<AgingCostPressure, "baselineOldAgeDependency" | "baselineHealthDemand">;
}): AgingCostPressure {
  const pensionAge = clamp(
    input.retirementAge + (Number.isFinite(input.pensionAgeShift) ? input.pensionAgeShift : 0),
    input.workingAge + 1,
    LAST_AGE
  );
  const dependency = oldAgeDependency(input.ages, input.workingAge, pensionAge);
  const health = healthDemandPerCapita(input.ages);
  const usable = (v: number | undefined): v is number =>
    typeof v === "number" && Number.isFinite(v) && v > 0;
  // The baseline is the opening age structure at the unshifted pension age, so
  // a law already on the book at the first reading still shows its effect.
  const baselineOldAgeDependency = usable(input.previous?.baselineOldAgeDependency)
    ? input.previous.baselineOldAgeDependency
    : oldAgeDependency(input.ages, input.workingAge, input.retirementAge);
  const baselineHealthDemand = usable(input.previous?.baselineHealthDemand)
    ? input.previous.baselineHealthDemand
    : health;
  return {
    baselineOldAgeDependency,
    baselineHealthDemand,
    oldAgeDependency: dependency,
    healthDemand: health,
    pensionAge,
    pensionScale:
      baselineOldAgeDependency > 0
        ? clamp(dependency / baselineOldAgeDependency, ...PENSION_SCALE_BOUNDS)
        : 1,
    healthScale:
      baselineHealthDemand > 0 ? clamp(health / baselineHealthDemand, ...HEALTH_SCALE_BOUNDS) : 1,
    asOfTurn: input.turn,
  };
}

/**
 * How much of each existing budget line is pensions or health care. Pension
 * lines carry the full pension scale; broad welfare lines are about half
 * pensions; health lines carry the full health scale.
 */
export const PENSION_CATEGORY_WEIGHTS: Readonly<Record<string, number>> = {
  socialSecurity: 1,
  statePensions: 1,
  pensions: 1,
  welfare: 0.5,
  social: 0.5,
  socialProtection: 0.5,
};
export const HEALTH_CATEGORY_WEIGHTS: Readonly<Record<string, number>> = {
  healthcare: 1,
  health: 1,
};

/** Scale the pension and health lines of a spending table; other lines pass through. */
export function applyAgingCostScale(
  byCategory: Record<string, number>,
  pressure: Pick<AgingCostPressure, "pensionScale" | "healthScale"> | undefined
): Record<string, number> {
  if (!pressure) return byCategory;
  const pension = Number.isFinite(pressure.pensionScale) ? pressure.pensionScale : 1;
  const health = Number.isFinite(pressure.healthScale) ? pressure.healthScale : 1;
  const out: Record<string, number> = {};
  for (const [key, amount] of Object.entries(byCategory)) {
    const pensionWeight = PENSION_CATEGORY_WEIGHTS[key] ?? 0;
    const healthWeight = HEALTH_CATEGORY_WEIGHTS[key] ?? 0;
    const scale = 1 + (pension - 1) * pensionWeight + (health - 1) * healthWeight;
    out[key] = amount > 0 ? amount * Math.max(0, scale) : amount;
  }
  return out;
}
