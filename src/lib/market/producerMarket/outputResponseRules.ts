/**
 * Output follows price (market recovery plan, phase 5), for the unified
 * producer market. Replaces the demand throttle and the loss run with one rule
 * read from the plant's own last settled receipt:
 *
 * - each unit sold did not pay for its inputs, wages and site costs -> run
 *   less, a step a turn;
 * - it sold out and each unit paid -> run more, a step a turn;
 * - otherwise move toward what actually sold, with a small probe above it so
 *   the plant keeps testing for more demand.
 *
 * - it sold almost nothing (a glut) -> drop straight to the probe run, so a plant
 *   stops buying inputs to make goods nobody buys, and grow back a step a turn
 *   once sales return.
 *
 * Wages and site running costs follow the run (producerPhysicalPreparation), so
 * they are in the per-unit test: running less saves them. A floor keeps a
 * probe run on the book so a plant can see prices recover.
 *
 * Pure: last receipt in, run share for this turn out.
 */

export const OUTPUT_RUN_FLOOR = 0.1;
/**
 * Probe run kept when gameConfig.producerLowUseCostStage >= 1: a plant that sells
 * almost nothing runs, staffs and bills a sliver of its capacity, not a tenth.
 */
export const LOW_USE_RUN_FLOOR = 0.01;
export const OUTPUT_GROW_STEP = 0.15;
export const OUTPUT_CUT_STEP = 0.1;
export const OUTPUT_PROBE = 0.1;
export const SOLD_OUT = 0.99;
/** Sell-through below which the last run is treated as a glut: drop to the probe run. */
export const GLUT_SELL_THROUGH = 0.05;

export interface PriorReceipt {
  /** Units the plant could run at (capacity x active share) last turn. */
  activeUnits: number;
  producedUnits: number;
  offeredUnits: number;
  soldUnits: number;
  revenue: number;
  /** Inputs consumed by what was made last turn. */
  inputsConsumed: number;
  /** Wages and site costs accrued last turn (paid plus arrears). */
  labourPaid?: number;
  labourArrears?: number;
  otherOperatingPaid?: number;
  otherOperatingArrears?: number;
}

export function nextRunShare(
  prior: PriorReceipt | null | undefined,
  floor: number = OUTPUT_RUN_FLOOR
): number {
  if (!prior) return 1;
  const finite = (x: number) => (Number.isFinite(x) ? x : 0);
  const active = finite(prior.activeUnits);
  const produced = finite(prior.producedUnits);
  if (!(active > 0)) return 1;
  // A plant that has not yet made or offered anything has no demand signal:
  // keep running in full until the market answers. On a cold start every
  // secondary producer begins with empty input stock and zero output, and a
  // plan read from that zero would park the whole chain at the floor forever.
  if (!(finite(prior.producedUnits) > 0) && !(finite(prior.offeredUnits) > 0)) return 1;
  const run = Math.max(floor, Math.min(1, produced / active));
  const offered = finite(prior.offeredUnits);
  const sold = finite(prior.soldUnits);
  const sellThrough = offered > 0 ? Math.min(1, sold / offered) : 0;
  const runningCost =
    finite(prior.inputsConsumed) +
    finite(prior.labourPaid ?? 0) +
    finite(prior.labourArrears ?? 0) +
    finite(prior.otherOperatingPaid ?? 0) +
    finite(prior.otherOperatingArrears ?? 0);
  const contributionPerUnit =
    sold > 0 ? (finite(prior.revenue) - (runningCost * sold) / Math.max(produced, sold)) / sold : 0;
  let next: number;
  if (offered > 0 && sellThrough < GLUT_SELL_THROUGH) next = floor;
  else if (sold > 0 && contributionPerUnit < 0) next = run * (1 - OUTPUT_CUT_STEP);
  else if (sellThrough >= SOLD_OUT) next = run * (1 + OUTPUT_GROW_STEP);
  else {
    const target = run * sellThrough * (1 + OUTPUT_PROBE);
    next =
      target < run
        ? Math.max(target, run * (1 - OUTPUT_CUT_STEP))
        : Math.min(target, run * (1 + OUTPUT_GROW_STEP));
  }
  return Math.max(floor, Math.min(1, next));
}

/** Probe above last turn's sales, so a demand-planned plant keeps testing for more. */
export const DEMAND_PLAN_PROBE = 0.1;

/**
 * Production follows demand (gameConfig.producerDemandPlanStage >= 1).
 *
 * A plant plans its output as expected sales minus the stock it already
 * holds: expected sales is what it sold last turn plus a probe margin, stock is
 * what it offered and did not sell. It buys inputs and staffs for that plan
 * only, because wages, site costs and input buying all follow the run share.
 * Unlike the stepped rule the cut is immediate, so a glut cannot bleed for
 * many turns at ten percent a turn. A plant that sold out still grows a step,
 * and a floor keeps a probe run on the book.
 *
 * Pure: last receipt in, run share for this turn out.
 */
export function demandPlanRunShare(
  prior: PriorReceipt | null | undefined,
  floor: number = OUTPUT_RUN_FLOOR,
  /** Growth factor for a line that sold out at a profit (see shortageGrowthRules). */
  soldOutGrowth: number = 1 + OUTPUT_GROW_STEP
): number {
  if (!prior) return 1;
  const finite = (x: number) => (Number.isFinite(x) ? x : 0);
  const active = finite(prior.activeUnits);
  if (!(active > 0)) return 1;
  // A plant that has not yet made or offered anything has no demand signal:
  // keep running in full until the market answers. On a cold start every
  // secondary producer begins with empty input stock and zero output, and a
  // plan read from that zero would park the whole chain at the floor forever.
  if (!(finite(prior.producedUnits) > 0) && !(finite(prior.offeredUnits) > 0)) return 1;
  const produced = finite(prior.producedUnits);
  const run = Math.max(floor, Math.min(1, produced / active));
  const offered = finite(prior.offeredUnits);
  const sold = finite(prior.soldUnits);
  const sellThrough = offered > 0 ? Math.min(1, sold / offered) : 0;
  // The loss brake comes first, as in the stepped rule: a line that sells out
  // at a price under its running cost must not grow.
  const runningCost =
    finite(prior.inputsConsumed) +
    finite(prior.labourPaid ?? 0) +
    finite(prior.labourArrears ?? 0) +
    finite(prior.otherOperatingPaid ?? 0) +
    finite(prior.otherOperatingArrears ?? 0);
  const contributionPerUnit =
    sold > 0 ? (finite(prior.revenue) - (runningCost * sold) / Math.max(produced, sold)) / sold : 0;
  if (sold > 0 && contributionPerUnit < 0) return Math.max(floor, run * (1 - OUTPUT_CUT_STEP));
  if (sellThrough >= SOLD_OUT) return Math.min(1, run * soldOutGrowth);
  const expectedSales = sold * (1 + DEMAND_PLAN_PROBE);
  const heldStock = Math.max(0, offered - sold);
  const planned = Math.max(0, expectedSales - heldStock);
  return Math.max(floor, Math.min(1, planned / active));
}

/**
 * Pacing (gameConfig.producerRunPaceDrop > 0): a plant's planned run may fall
 * by at most `drop` of last turn's run per turn, so a plan that reads a
 * glut cuts output over several turns while the workforce persists. Growth is
 * never limited. Pure: the unpaced plan and last receipt in, the paced run out.
 */
export function pacedRunShare(
  next: number,
  prior: PriorReceipt | null | undefined,
  drop: number,
  floor: number = OUTPUT_RUN_FLOOR
): number {
  if (!(drop > 0) || !prior) return next;
  const active = Number.isFinite(prior.activeUnits) ? prior.activeUnits : 0;
  if (!(active > 0)) return next;
  const produced = Number.isFinite(prior.producedUnits) ? prior.producedUnits : 0;
  const prevRun = Math.max(floor, Math.min(1, produced / active));
  return Math.min(1, Math.max(next, prevRun * (1 - Math.min(1, drop))));
}
