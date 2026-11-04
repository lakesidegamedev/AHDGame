/**
 * Wage share of value added in the funded producer economy.
 *
 * Plant payroll comes from the labour model (headcount times the state wage),
 * which pays workers about an eighth of the value a plant adds. Most of the
 * rest stays with the company as profit, and households, who spend only the
 * cash they receive, buy a small share of output. With the stage on, a plant
 * pays its workers more where its own last receipt shows room for it: wages
 * rise toward a target share of value added, but the raise never takes more
 * than a set share of the surplus left after the base wage and site bills.
 * A plant that made no surplus last turn pays the base wage only.
 *
 * Everything is per unit of output, so a plant that runs harder or lighter
 * this turn than last pays the raise on this turn's run. The raise is read
 * from last turn's value added and site bill, never from last turn's wages,
 * so it does not feed back on itself.
 *
 * Pure: plain data in, a wage bill out.
 */

/** Target wage share of a plant's value added when the stage is on. Tunable. */
export const WAGE_SHARE_DEFAULT_TARGET = 0.6;
/** Largest share of last turn's surplus after base wages the raise may take. Tunable. */
export const WAGE_SHARE_DEFAULT_SURPLUS_CAP = 0.75;

/** The parts of a plant's last settled receipt the raise reads. */
export interface WageShareReceipt {
  producedUnits: number;
  soldUnits?: number;
  revenue: number;
  inputsConsumed: number;
  minorInputPremium?: number;
  inventoryWriteOff?: number;
  otherOperatingPaid?: number;
  otherOperatingArrears?: number;
  /** Wages paid and owed last turn; read only by the labour-linked target's step limit. */
  labourPaid?: number;
  labourArrears?: number;
}

export interface WageShareInput {
  /** This turn's payroll at the full planned run, before any raise. */
  baseLabourCost: number;
  /** Units the plant makes at the full planned run this turn. */
  fullRunUnits: number;
  /** Last turn's settled receipt for this plant, or null on its first turn. */
  last: WageShareReceipt | null;
  /** Target wage share of value added, 0 to 1. 0 = off. */
  targetShare: number;
  /** Share of surplus after base wages the raise may take, 0 to 1. */
  surplusCap: number;
}

function clampShare(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Revenue less the inputs the run used up: the value the plant added. */
export function receiptValueAdded(last: WageShareReceipt): number {
  return (
    last.revenue -
    last.inputsConsumed -
    (last.minorInputPremium ?? 0) -
    (last.inventoryWriteOff ?? 0)
  );
}

function receiptSiteBill(last: WageShareReceipt): number {
  return (last.otherOperatingPaid ?? 0) + (last.otherOperatingArrears ?? 0);
}

/** This turn's wage bill at the full planned run, never below the base payroll. */
export function wageShareLabourCost(input: WageShareInput): number {
  const base = input.baseLabourCost;
  const target = clampShare(input.targetShare);
  const cap = clampShare(input.surplusCap);
  const last = input.last;
  if (!(target > 0) || !(cap > 0) || !(base > 0) || !(input.fullRunUnits > 0)) return base;
  if (!last || !(last.producedUnits > 0)) return base;
  // A plant that sold old stock earned more than its run made: spread over
  // the larger count so a thin run cannot read as a rich one.
  const units = Math.max(last.producedUnits, last.soldUnits ?? 0);
  const valueAdded = receiptValueAdded(last);
  const siteBill = receiptSiteBill(last);
  if (!Number.isFinite(valueAdded) || !Number.isFinite(siteBill)) return base;
  const valueAddedPerUnit = valueAdded / units;
  const sitePerUnit = siteBill / units;
  const basePerUnit = base / input.fullRunUnits;
  const raisePerUnit = Math.min(
    target * valueAddedPerUnit - basePerUnit,
    cap * (valueAddedPerUnit - sitePerUnit - basePerUnit)
  );
  return raisePerUnit > 0 ? base + raisePerUnit * input.fullRunUnits : base;
}

/*
 * Labour-linked target.
 *
 * With the labour stage on, the target share is no longer one constant: it
 * follows the plant's state labour market. At or below the natural rate of
 * unemployment workers are scarce and the target sits at its maximum; at the
 * slack rate or above it falls to its floor; in between it moves in a straight
 * line. Wages are sticky: a plant's effective target moves at most `step` of
 * value added a turn away from the wage share it actually paid last turn, so a
 * jump in unemployment (or switching the stage on) walks wages over several
 * turns instead of in one.
 */

/** Tunables for the labour-linked target. Shares are of value added; rates in percent. */
export interface LabourWageParams {
  /** Unemployment (%) at or below which the target is at its maximum. */
  naturalRate: number;
  /** Unemployment (%) at or above which the target is at its floor. */
  slackRate: number;
  /** Target share in a tight labour market. */
  maxShare: number;
  /** Target share in a slack labour market. */
  floorShare: number;
  /** Largest move of the effective target a turn, as a share of value added. 0 = no limit. */
  step: number;
}

/**
 * Defaults. Most value added sits in states at or near the natural rate, so the
 * maximum share sets the level: 0.55 brings households to about 38% of buying
 * with 0.2% of profitable plants pushed to a loss on the turn 651 receipt
 * (0.65 reached 40% with 1.0%).
 */
export const LABOUR_WAGE_DEFAULTS: Readonly<LabourWageParams> = Object.freeze({
  naturalRate: 4.5,
  slackRate: 12,
  maxShare: 0.55,
  floorShare: 0.3,
  step: 0.03,
});

/** The target share for a state's unemployment rate, or the fallback when it is unknown. */
export function labourWageShareTarget(
  unemploymentRate: number | null | undefined,
  params: LabourWageParams,
  fallback: number
): number {
  const max = clampShare(params.maxShare);
  const floor = Math.min(max, clampShare(params.floorShare));
  if (typeof unemploymentRate !== "number" || !Number.isFinite(unemploymentRate))
    return clampShare(fallback);
  const span = params.slackRate - params.naturalRate;
  if (!(span > 0)) return unemploymentRate <= params.naturalRate ? max : floor;
  const slack = Math.min(1, Math.max(0, (unemploymentRate - params.naturalRate) / span));
  return max + (floor - max) * slack;
}

/** The wage share of value added a plant actually paid on its last receipt, or null. */
export function lastWageShare(last: WageShareReceipt | null): number | null {
  if (!last) return null;
  const valueAdded = receiptValueAdded(last);
  const labour = (last.labourPaid ?? 0) + (last.labourArrears ?? 0);
  if (!Number.isFinite(valueAdded) || !(valueAdded > 0) || !Number.isFinite(labour)) return null;
  return Math.max(0, labour / valueAdded);
}

/** Moves toward the labour target by at most `step` from last turn's paid share. */
export function stickyWageShareTarget(
  target: number,
  lastShare: number | null,
  step: number
): number {
  if (lastShare == null || !(step > 0)) return target;
  return Math.max(0, Math.min(lastShare + step, Math.max(lastShare - step, target)));
}

/** A plant's effective target this turn under the labour stage. */
export function labourLinkedWageShareTarget(input: {
  unemploymentRate: number | null | undefined;
  last: WageShareReceipt | null;
  params: LabourWageParams;
  fallback: number;
}): number {
  return stickyWageShareTarget(
    labourWageShareTarget(input.unemploymentRate, input.params, input.fallback),
    lastWageShare(input.last),
    input.params.step
  );
}

/*
 * Wage growth from the labour market.
 *
 * Inflation and the income-tax base read one annual wage growth rate per
 * country. With the labour stage on it is built from two parts per state:
 *
 * - tightness: `tightnessPerPoint` x (natural rate - unemployment), so a tight
 *   market adds growth and a slack one takes it away (the same 0.3 a point the
 *   median income node uses);
 * - wage move: the change in the state's wage bill the labour target implies
 *   for next turn (each plant steps its paid share toward its state target,
 *   limited by `step` and by its surplus), annualized and scaled by
 *   `movePassthrough`, then capped at `moveCap` points either way. This is the
 *   rise or fall in the effective average wage the plants are making; it is
 *   large while wages walk to a new level and near zero once they arrive.
 *
 * States are weighted by GDP. The country rate is `neutral` plus that mean,
 * smoothed against last turn's rate with `inertia` so one noisy receipt cannot
 * swing inflation, then held inside [floor, ceiling].
 */
export const LABOUR_WAGE_GROWTH = Object.freeze({
  /** Annual wage growth (%) with unemployment at the natural rate and wages at rest. */
  neutral: 3.0,
  tightnessPerPoint: 0.3,
  movePassthrough: 0.01,
  moveCap: 4,
  floor: -5,
  ceiling: 15,
  inertia: 0.6,
});

/** One funded plant's settled receipt, reduced to what the wage move reads. */
export interface LabourWagePlant {
  labour: number;
  valueAdded: number;
  siteBill: number;
}

/**
 * A state's wage bill next turn relative to this turn's, minus one (per turn).
 * A plant paying more than `ceilingShare` (the most the labour target can ask)
 * plus a step is paying its base wage on thin value added, not a raise, and the
 * plant rule never cuts below the base, so it is counted as holding its wage.
 */
export function stateWageMove(
  plants: readonly LabourWagePlant[],
  target: number,
  step: number,
  surplusCap: number,
  ceilingShare: number = 1
): number {
  const cap = clampShare(surplusCap);
  const baseBound = clampShare(ceilingShare) + Math.max(0, step);
  let labourNow = 0;
  let labourNext = 0;
  for (const p of plants) {
    if (!(p.valueAdded > 0) || !(p.labour > 0) || !Number.isFinite(p.siteBill)) continue;
    const share = p.labour / p.valueAdded;
    const effective = share > baseBound ? share : stickyWageShareTarget(target, share, step);
    // A raise comes out of the surplus left after wages and site bills, as in the plant rule.
    const reach = share + (cap * Math.max(0, p.valueAdded - p.siteBill - p.labour)) / p.valueAdded;
    const next = effective >= share ? Math.min(effective, Math.max(share, reach)) : effective;
    labourNow += p.labour;
    labourNext += next * p.valueAdded;
  }
  return labourNow > 0 ? labourNext / labourNow - 1 : 0;
}

export interface LabourWageGrowthState {
  unemploymentRate: number | null | undefined;
  gdp: number;
  plants: readonly LabourWagePlant[];
}

/** A country's annual wage growth (%) from its states' labour markets, or null with no states. */
export function labourWageGrowth(input: {
  states: readonly LabourWageGrowthState[];
  params: LabourWageParams;
  fallbackTarget: number;
  surplusCap: number;
  /** Last turn's country rate, the smoothing anchor; non-finite = no smoothing. */
  previous: number | null | undefined;
  turnsPerYear: number;
}): number | null {
  const g = LABOUR_WAGE_GROWTH;
  if (input.states.length === 0) return null;
  const totalGdp = input.states.reduce((sum, s) => sum + (s.gdp > 0 ? s.gdp : 0), 0);
  let weighted = 0;
  for (const s of input.states) {
    const weight = totalGdp > 0 ? (s.gdp > 0 ? s.gdp / totalGdp : 0) : 1 / input.states.length;
    if (weight === 0) continue;
    const u = s.unemploymentRate;
    const gap = typeof u === "number" && Number.isFinite(u) ? input.params.naturalRate - u : 0;
    const target = labourWageShareTarget(u, input.params, input.fallbackTarget);
    const move = stateWageMove(
      s.plants,
      target,
      input.params.step,
      input.surplusCap,
      input.params.maxShare
    );
    const moveTerm = Math.max(
      -g.moveCap,
      Math.min(g.moveCap, move * input.turnsPerYear * 100 * g.movePassthrough)
    );
    weighted += weight * (g.tightnessPerPoint * gap + moveTerm);
  }
  const raw = g.neutral + weighted;
  const prev = input.previous;
  const smoothed =
    typeof prev === "number" && Number.isFinite(prev)
      ? g.inertia * prev + (1 - g.inertia) * raw
      : raw;
  return Math.round(Math.max(g.floor, Math.min(g.ceiling, smoothed)) * 100) / 100;
}
