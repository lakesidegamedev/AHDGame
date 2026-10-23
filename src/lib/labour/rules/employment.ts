/**
 * Regional employment includes corporate jobs and the background economy.
 * advanceEmployment matches vacancies with jobseekers, records separations,
 * and lets funded policy and the output gap change background labor demand.
 */

export interface EmploymentState {
  version: 1;
  lastTurn: number;
  laborForce: number;
  corporateEmployed: number;
  backgroundEmployed: number;
  backgroundDemand: number;
  /** Fixed coverage anchor, not a new anchor every time ownership changes. */
  referenceCorporateShare: number;
  /** Last fresh corporate demand; paused phases do not become mass layoffs. */
  corporateDemand: number;
  corporateDemandKnown: boolean;
  structuralRate: number;
  vacancies: number;
  vacancyToUnemployment: number;
  hires: number;
  separations: number;
}

export interface EmploymentPolicy {
  matching: number;
  transport: number;
  childcare: number;
  /** Additional participation points only where no existing metric effect owns them. */
  participationBonus: number;
  /** Annual funded employment-program expenditure in the host currency. */
  publicEmploymentAnnual: number;
}

export const EMPTY_EMPLOYMENT_POLICY: Readonly<EmploymentPolicy> = {
  matching: 0,
  transport: 0,
  childcare: 0,
  participationBonus: 0,
  publicEmploymentAnnual: 0,
};

export interface EmploymentInput {
  turn: number;
  turnsPerYear: number;
  laborForce: number;
  unemployment: number;
  initialLaborForce?: number;
  /** Undefined means missing/stale, zero means a measured absence of demand. */
  corporateDemand?: number;
  matchingFriction?: number;
  workforceSkill?: number;
  /** Actual output vs its measured trend, percent. */
  outputGap?: number;
  medianIncome?: number;
  policy?: EmploymentPolicy;
  previous?: EmploymentState;
}

export interface EmploymentResult {
  state: EmploymentState;
  unemployment: number;
  targetUnemployment: number;
}

export const EMPLOYMENT_RECOVERY_HALF_LIFE_YEARS = 0.5;
/** Turns for half of a company's open positions to be filled at average skill. */
export const CORPORATE_VACANCY_HALF_LIFE_TURNS = 2;
export const OUTPUT_GAP_UNEMPLOYMENT_COEFFICIENT = 0.4;
export const EMPLOYMENT_UNEMPLOYMENT_BOUNDS = [1, 100] as const;

const finite = (v: number | undefined, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const nonnegative = (v: number | undefined): number => Math.max(0, finite(v, 0));

export function employmentUnemployment(state: EmploymentState): number {
  if (state.laborForce <= 0) return 0;
  return clamp(
    (100 * (state.laborForce - state.corporateEmployed - state.backgroundEmployed)) /
      state.laborForce,
    ...EMPLOYMENT_UNEMPLOYMENT_BOUNDS
  );
}

function usableEmployment(state: EmploymentState | undefined): state is EmploymentState {
  return (
    state?.version === 1 &&
    Number.isInteger(state.lastTurn) &&
    [
      state.laborForce,
      state.corporateEmployed,
      state.backgroundEmployed,
      state.referenceCorporateShare,
      state.corporateDemand,
    ].every((v) => Number.isFinite(v) && v >= 0) &&
    state.referenceCorporateShare <= 0.99 &&
    state.corporateEmployed + state.backgroundEmployed <= state.laborForce + 1e-6
  );
}

/** No country-size, currency, ownership, or corporation-count multipliers. */
export function advanceEmployment(input: EmploymentInput): EmploymentResult {
  const supply = nonnegative(input.laborForce);
  const prev =
    usableEmployment(input.previous) && input.previous.lastTurn <= input.turn
      ? input.previous
      : undefined;
  if (prev?.version === 1 && prev.lastTurn >= input.turn) {
    return {
      state: prev,
      unemployment:
        prev.laborForce > 0
          ? employmentUnemployment(prev)
          : clamp(finite(input.unemployment, 4.5), 1, 100),
      targetUnemployment:
        prev.laborForce > 0
          ? clamp(
              100 * (1 - (prev.backgroundDemand + prev.corporateDemand) / prev.laborForce),
              1,
              100
            )
          : prev.structuralRate,
    };
  }
  const policy = input.policy ?? EMPTY_EMPLOYMENT_POLICY;
  const skill = clamp(finite(input.workforceSkill, 50), 0, 100);
  const structural = clamp(
    finite(input.matchingFriction, 4.5) -
      1.5 * clamp(finite(policy.matching, 0), 0, 1) -
      0.5 * clamp(finite(policy.transport, 0), 0, 1) -
      0.5 * clamp(finite(policy.childcare, 0), 0, 1),
    1,
    15
  );
  const cyclicalRate = clamp(
    structural - OUTPUT_GAP_UNEMPLOYMENT_COEFFICIENT * clamp(finite(input.outputGap, 0), -15, 15),
    1,
    15
  );
  const freshDemand =
    input.corporateDemand !== undefined &&
    Number.isFinite(input.corporateDemand) &&
    input.corporateDemand >= 0;
  const demand = freshDemand
    ? nonnegative(input.corporateDemand)
    : nonnegative(prev?.corporateDemand);
  const openingSupply = Math.min(supply, Math.max(0, finite(input.initialLaborForce, supply)));
  const openingEmployment =
    openingSupply * (1 - clamp(finite(input.unemployment, 4.5), 1, 100) / 100);
  const firstDemand = freshDemand && !prev?.corporateDemandKnown;
  let corporateOpening = prev
    ? nonnegative(prev.corporateEmployed)
    : Math.min(demand, openingEmployment);
  const referenceShare = clamp(
    finite(
      firstDemand ? undefined : prev?.referenceCorporateShare,
      supply > 0 ? Math.min(demand / supply, 0.99) : 0
    ),
    0,
    0.99
  );
  // People leaving the labor force leave employers proportionally. Entrants
  // start as jobseekers; they do not arrive with fictional jobs attached.
  const retainedSupply = prev && prev.laborForce > 0 ? Math.min(1, supply / prev.laborForce) : 1;
  let backgroundOpening = prev
    ? nonnegative(prev.backgroundEmployed)
    : Math.max(0, openingEmployment - corporateOpening);
  const beforeShock = corporateOpening + backgroundOpening;
  if (
    prev &&
    prev.laborForce > 0 &&
    Math.abs(
      finite(input.unemployment, employmentUnemployment(prev)) - employmentUnemployment(prev)
    ) > 0.01
  ) {
    // Crisis and administrative metric shocks retain their meaning. Legislative
    // point bonuses are suppressed by their writers once the ledger exists.
    const shockedEmployment =
      prev.laborForce * (1 - clamp(finite(input.unemployment, 4.5), 1, 100) / 100);
    if (beforeShock > 0) {
      corporateOpening *= shockedEmployment / beforeShock;
      backgroundOpening *= shockedEmployment / beforeShock;
    } else backgroundOpening = shockedEmployment;
  }
  const shockChange = (corporateOpening + backgroundOpening - beforeShock) * retainedSupply;
  let corporate = corporateOpening * retainedSupply;
  let background = prev
    ? backgroundOpening * retainedSupply
    : Math.max(0, openingEmployment - corporate);
  if (firstDemand && prev) {
    const transferred = Math.min(Math.max(0, demand - corporate), background);
    corporate += transferred;
    background -= transferred;
  }
  const income = finite(input.medianIncome, 0);
  const publicJobs = income > 0 ? nonnegative(policy.publicEmploymentAnnual) / income : 0;
  const backgroundTarget = Math.max(
    0,
    supply * (1 - cyclicalRate / 100 - referenceShare) + publicJobs
  );
  const rate =
    1 -
    Math.pow(
      0.5,
      (0.5 + skill / 100) /
        (Math.max(1, finite(input.turnsPerYear, 48)) * EMPLOYMENT_RECOVERY_HALF_LIFE_YEARS)
    );
  const corporateLoss = Math.max(0, corporate - demand);
  const backgroundLoss = Math.max(0, background - backgroundTarget) * rate;
  corporate -= corporateLoss;
  background -= backgroundLoss;
  // Bad old snapshots and a shrinking labor force cannot employ more people
  // than exist. This also keeps all count outputs consistent with the rate.
  const maximumEmployment = supply * 0.99;
  const total = corporate + background;
  if (total > maximumEmployment && total > 0) {
    corporate *= maximumEmployment / total;
    background *= maximumEmployment / total;
  }
  const corporateVacancies = Math.max(0, demand - corporate);
  const backgroundVacancies = Math.max(0, backgroundTarget - background);
  const vacancies = corporateVacancies + backgroundVacancies;
  // Jobseekers who can be matched this turn, the shared limit on all hiring.
  const matchable = Math.min(
    Math.max(0, maximumEmployment - corporate - background),
    Math.max(0, supply - corporate - background) *
      (1 - Math.exp(-12 / Math.max(1, finite(input.turnsPerYear, 48))))
  );
  // A company with a posted opening and jobseekers available fills it within a
  // few turns. Only the background economy drifts back at the slow recovery
  // rate; filling company openings at that rate left plants short for months
  // while the same state had double-digit unemployment (ticket 1628).
  const corporateFill = 1 - Math.pow(0.5, (0.5 + skill / 100) / CORPORATE_VACANCY_HALF_LIFE_TURNS);
  const corporateHires = Math.min(corporateVacancies * corporateFill, matchable);
  const backgroundHires = Math.min(
    backgroundVacancies * rate,
    Math.max(0, matchable - corporateHires)
  );
  const hires = corporateHires + backgroundHires;
  corporate += corporateHires;
  background += backgroundHires;
  const state: EmploymentState = {
    version: 1,
    lastTurn: input.turn,
    laborForce: supply,
    corporateEmployed: corporate,
    backgroundEmployed: background,
    backgroundDemand: backgroundTarget,
    referenceCorporateShare: referenceShare,
    corporateDemand: demand,
    corporateDemandKnown: (prev?.corporateDemandKnown ?? false) || freshDemand,
    structuralRate: structural,
    vacancies: Math.max(0, vacancies - hires),
    vacancyToUnemployment:
      Math.max(0, vacancies - hires) / Math.max(1, supply - corporate - background),
    hires: hires + Math.max(0, shockChange),
    separations: corporateLoss + backgroundLoss + Math.max(0, -shockChange),
  };
  return {
    state,
    unemployment:
      supply > 0 ? employmentUnemployment(state) : clamp(finite(input.unemployment, 4.5), 1, 100),
    targetUnemployment:
      supply > 0 ? clamp(100 * (1 - (backgroundTarget + demand) / supply), 1, 100) : cyclicalRate,
  };
}

/** Corporate staffing consumes the prior completed employment allocation. */
export function employmentStaffingTightness(
  state: EmploymentState | undefined
): number | undefined {
  if (
    !state?.corporateDemandKnown ||
    !Number.isFinite(state.corporateDemand) ||
    state.corporateDemand <= 0
  )
    return undefined;
  return state.corporateDemand / Math.max(1, nonnegative(state.corporateEmployed));
}

/** Snapshot initialization preserves existing employment before any future step. */
export function initializeEmployment(
  laborForce: number,
  unemployment: number,
  corporateDemand: number | undefined,
  turn: number
): EmploymentState {
  const supply = nonnegative(laborForce);
  const employed = supply * (1 - clamp(finite(unemployment, 4.5), 1, 100) / 100);
  const demand = nonnegative(corporateDemand);
  const corporate = Math.min(employed, demand);
  return {
    version: 1,
    lastTurn: turn,
    laborForce: supply,
    corporateEmployed: corporate,
    backgroundEmployed: employed - corporate,
    backgroundDemand: employed - corporate,
    referenceCorporateShare: supply > 0 ? Math.min(0.99, demand / supply) : 0,
    corporateDemand: demand,
    corporateDemandKnown:
      corporateDemand !== undefined && Number.isFinite(corporateDemand) && corporateDemand >= 0,
    structuralRate: clamp(finite(unemployment, 4.5), 1, 100),
    vacancies: 0,
    vacancyToUnemployment: 0,
    hires: 0,
    separations: 0,
  };
}

/** Legacy fallback for worlds that cannot yet supply a civilian labor force. */
export function legacyEmploymentSmoothing(
  previous: number,
  target: number,
  inertia: number
): number {
  return inertia * previous + (1 - inertia) * target;
}
