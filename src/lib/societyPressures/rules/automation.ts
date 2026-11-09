/**
 * Automation labour displacement for the 2027 world.
 *
 * The four automation production methods staff a unit of capacity with a
 * fraction of the usual crew. The workers a plant no longer needs leave its
 * payroll at once and become jobseekers. The wider economy then absorbs them
 * over a few years as new work appears: absorption is a stock that closes on
 * the displaced stock with a half-life, shortened by wage insurance and
 * retraining, by an economy running above trend and by a better educated
 * workforce. Absorbed workers become ordinary background labour demand.
 */

/** Crew per unit of capacity relative to a conventional plant in the same sector. */
export const AUTOMATION_LABOUR_FACTORS: Readonly<Record<string, number>> = {
  humanoid_robotics: 0.55,
  agentic_services: 0.5,
  autonomous_factory: 0.45,
  autonomous_freight: 0.4,
};

export function automationLabourFactor(
  strategyId: string | null | undefined,
  enabled: boolean
): number {
  if (!enabled || !strategyId) return 1;
  return AUTOMATION_LABOUR_FACTORS[strategyId] ?? 1;
}

/**
 * Workers an automated plant shed, from the crew it now wants and its crew
 * factor. A factor of 1 sheds no one.
 */
export function displacedWorkers(desiredWorkers: number, factor: number): number {
  if (!(factor > 0) || factor >= 1 || !(desiredWorkers > 0)) return 0;
  return (desiredWorkers * (1 - factor)) / factor;
}

/** Years for half of the displaced workers to find new work with no help. */
export const BASE_ABSORPTION_HALF_LIFE_YEARS = 3;
const MIN_HALF_LIFE_YEARS = 1;
const MAX_HALF_LIFE_YEARS = 6;
/** Education index at which schooling neither speeds nor slows re-employment. */
export const NEUTRAL_EDUCATION_INDEX = 35;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const finiteOr = (v: number | undefined, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function absorptionHalfLifeYears(input: {
  /** 0..1 from the wage insurance law. */
  wageInsuranceSupport: number;
  /** 0..1 from the retraining guarantee and hiring subsidy; adds to the speed. */
  policySupport?: number;
  /** Output gap, percent. Above trend creates new jobs faster. */
  outputGap?: number;
  /** Regional education index, percent of adults with tertiary education. */
  educationIndex?: number;
}): number {
  const support =
    clamp(finiteOr(input.wageInsuranceSupport, 0), 0, 1) +
    clamp(finiteOr(input.policySupport, 0), 0, 1);
  const demand = clamp(finiteOr(input.outputGap, 0), -10, 10) * 0.04;
  const schooling =
    (clamp(finiteOr(input.educationIndex, NEUTRAL_EDUCATION_INDEX), 0, 100) -
      NEUTRAL_EDUCATION_INDEX) /
    100;
  const speed = Math.max(0.2, 1 + support + demand + schooling);
  return clamp(BASE_ABSORPTION_HALF_LIFE_YEARS / speed, MIN_HALF_LIFE_YEARS, MAX_HALF_LIFE_YEARS);
}

/**
 * Next absorbed stock. Absorption never exceeds the displaced stock, so if
 * automated plants close or revert, the extra jobs created for their former
 * workers wind down with them.
 */
export function advanceAutomationAbsorption(input: {
  displaced: number;
  previousAbsorbed: number;
  turnsPerYear: number;
  halfLifeYears: number;
}): number {
  const displaced = Math.max(0, finiteOr(input.displaced, 0));
  const absorbed = clamp(finiteOr(input.previousAbsorbed, 0), 0, displaced);
  const perTurn =
    1 -
    Math.pow(
      0.5,
      1 / (Math.max(1, finiteOr(input.turnsPerYear, 48)) * Math.max(0.1, input.halfLifeYears))
    );
  return absorbed + (displaced - absorbed) * perTurn;
}
