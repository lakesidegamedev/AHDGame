/**
 * Output follows price, from the plant's last settled receipt:
 * - unit did not pay for inputs, wages, site -> run less, a step a turn;
 * - sold out and unit paid -> run more, a step a turn;
 * - otherwise move toward what sold, with a small probe above it;
 * - glut (sold almost nothing) -> drop to the probe run, grow back a step
 *   once sales return.
 *
 * Wages and site costs follow the run, so they are in the per-unit test.
 * A floor keeps a probe run on the book.
 *
 * Pure: last receipt in, run share out.
 */

export const OUTPUT_RUN_FLOOR = 0.1;
/**
 * Probe run kept when gameConfig.producerLowUseCostStage >= 1: a plant that sells
 * almost nothing runs, staffs and bills a sliver of its capacity, not a tenth.
 */
export const LOW_USE_RUN_FLOOR = 0.01;
export const OUTPUT_GROW_STEP = 0.15;
export const OUTPUT_CUT_STEP = 0.1;
const OUTPUT_PROBE = 0.1;
const SOLD_OUT = 0.99;
/** Sell-through below which the last run is treated as a glut: drop to the probe run. */
const GLUT_SELL_THROUGH = 0.05;

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
  /**
   * Run share the plant planned for that turn, before input and cash cuts.
   * Absent on receipts settled before it was recorded.
   */
  plannedRunShare?: number;
  /**
   * Units the plant planned to make that turn, before input and cash cuts.
   * Absent on receipts settled before it was recorded.
   */
  plannedUnits?: number;
  /** Cold upkeep on idle capacity inside the site bill; owed whether or not the line runs. */
  idleOperatingCost?: number;
  /**
   * Why the run fell short of its plan: the company's cash could not fund it,
   * or short inputs cut it. Absent when the run was not cut, or on receipts
   * settled before it was recorded.
   */
  runCutBy?: readonly string[];
  /**
   * Consecutive glut turns before this receipt's turn, recorded on the plan
   * when gameConfig.producerRunPlanStage >= 1. Absent on older receipts.
   */
  priorGlutTurns?: number;
}

/** One product row of a settled receipt, as the run signals read it. */
export interface ReceiptLine {
  commodity: string;
  offeredUnits?: number;
  soldUnits?: number;
  revenue?: number;
}

/**
 * The receipt the run signals read: only the lines the plant makes now. After
 * a retool the old lines' leftover stock is still offered and sold, but a glut
 * in goods the plant no longer makes must not hold back the line it does make
 * (it would keep sell-through under the sold-out mark and count the dead stock
 * as held stock against the plan). A receipt with no row for a current line is
 * returned as it is.
 */
export function liveLineReceipt<T extends PriorReceipt & { products?: readonly ReceiptLine[] }>(
  receipt: T,
  liveCommodities: ReadonlySet<string>
): T {
  const products = receipt.products;
  if (!products || products.length === 0) return receipt;
  const live = products.filter((p) => liveCommodities.has(p.commodity));
  if (live.length === 0 || live.length === products.length) return receipt;
  const finite = (x: number | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  let offeredUnits = 0,
    soldUnits = 0,
    revenue = 0;
  for (const p of live) {
    offeredUnits += finite(p.offeredUnits);
    soldUnits += finite(p.soldUnits);
    revenue += finite(p.revenue);
  }
  return { ...receipt, products: live, offeredUnits, soldUnits, revenue };
}

// Whether a plant lost money on the margin, not just from spreading
// fixed costs over a small run. Braking sold-out plants that covered
// materials would shrink them further and spiral into mothballing.
// Chronic-loss mothball catches plants that never turn profitable.
function marginalLoss(input: {
  sold: number;
  produced: number;
  sellThrough: number;
  revenue: number;
  inputsConsumed: number;
  contributionPerUnit: number;
}): boolean {
  if (!(input.sold > 0) || !(input.contributionPerUnit < 0)) return false;
  if (input.sellThrough < SOLD_OUT) return true;
  const materialsPerUnit = input.inputsConsumed / Math.max(input.produced, input.sold);
  return !(input.revenue / input.sold > materialsPerUnit);
}

/**
 * The signals the run rules read from a receipt, for a page that has to say
 * why a plant runs where it does. Same arithmetic as the rules: sell-through,
 * the per-unit contribution, and the marginal-loss test (`marginalLoss`). Pass
 * the receipt the planner reads (after `withCaptiveDeliveries` when that stage
 * is on), or own-site deliveries read as unsold.
 */
export interface RunSignals {
  /** Made / active capacity, floored. */
  run: number;
  sellThrough: number;
  soldOut: boolean;
  /** Under the glut line: almost nothing sold. */
  glut: boolean;
  /** The loss brake fires: each unit sold paid less than it cost to make. */
  losing: boolean;
  /** Revenue per unit sold. Null when nothing sold. */
  unitPrice: number | null;
  /**
   * Inputs consumed per unit sold. The whole bill for what was made is
   * spread over what sold, so units made but left unsold are paid for by the
   * ones that sold and the figure reconciles with the sector's profit and loss.
   * Null when nothing sold.
   */
  unitMaterials: number | null;
  /** Wages per unit sold. Null when nothing sold. */
  unitWages: number | null;
  /** Running site bill per unit sold. Null when nothing sold. */
  unitSite: number | null;
  /** Share of what was made that did not sell, 0-1. */
  unsoldShare: number;
}

export function runSignals(
  prior: PriorReceipt | null | undefined,
  floor: number = OUTPUT_RUN_FLOOR
): RunSignals | null {
  if (!prior) return null;
  const finite = (x: number | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const active = finite(prior.activeUnits);
  if (!(active > 0)) return null;
  const produced = finite(prior.producedUnits);
  const offered = finite(prior.offeredUnits);
  const sold = finite(prior.soldUnits);
  const sellThrough = offered > 0 ? Math.min(1, sold / offered) : 0;
  const labour = finite(prior.labourPaid) + finite(prior.labourArrears);
  const site = finite(prior.otherOperatingPaid) + finite(prior.otherOperatingArrears);
  const runningCost = finite(prior.inputsConsumed) + labour + site;
  const contributionPerUnit =
    sold > 0 ? (finite(prior.revenue) - (runningCost * sold) / Math.max(produced, sold)) / sold : 0;
  const made = Math.max(produced, sold);
  return {
    run: Math.max(floor, Math.min(1, produced / active)),
    sellThrough,
    soldOut: sellThrough >= SOLD_OUT,
    glut: offered > 0 && sellThrough < GLUT_SELL_THROUGH,
    losing: marginalLoss({
      sold,
      produced,
      sellThrough,
      revenue: finite(prior.revenue),
      inputsConsumed: finite(prior.inputsConsumed),
      contributionPerUnit,
    }),
    unitPrice: sold > 0 ? finite(prior.revenue) / sold : null,
    unitMaterials: sold > 0 ? finite(prior.inputsConsumed) / sold : null,
    unitWages: sold > 0 ? labour / sold : null,
    unitSite: sold > 0 ? site / sold : null,
    unsoldShare: made > 0 ? Math.max(0, made - sold) / made : 0,
  };
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
  const losing = marginalLoss({
    sold,
    produced,
    sellThrough,
    revenue: finite(prior.revenue),
    inputsConsumed: finite(prior.inputsConsumed),
    contributionPerUnit,
  });
  if (offered > 0 && sellThrough < GLUT_SELL_THROUGH) next = floor;
  else if (losing) next = run * (1 - OUTPUT_CUT_STEP);
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

/** Sell-through at or above which a plant at the floor may step up (the market is only a few percent oversupplied). */
export const FLOOR_RECOVERY_SELL_THROUGH = 0.9;
/** A plant whose run is below this share of capacity counts as at or near the floor. */
export const FLOOR_RECOVERY_BAND = 0.05;
/** Share of capacity a floor plant adds per turn: small, so many plants rising at once cannot swamp a market. */
export const FLOOR_RECOVERY_STEP = 0.01;
/** Turns of sales a floor plant may already carry in stock and still step up. */
export const FLOOR_RECOVERY_STOCK_COVER = 1;

/**
 * Floor recovery. In a market oversupplied by a few percent every seller is
 * rationed pro rata and nobody reads sold out, so a plant at the floor plans
 * only expected sales (below the floor) and never grows. A plant at or near the
 * floor that still sells most of what it offers steps up by a small fixed share
 * of capacity a turn instead, capped at the band.
 *
 * Holds back when: the plant lost money per unit sold (marginal-loss brake), it
 * sold out already (the sold-out growth owns that), sell-through is under
 * FLOOR_RECOVERY_SELL_THROUGH, or it already carries more than
 * FLOOR_RECOVERY_STOCK_COVER turns of sales in stock (stock still piling up).
 * Returns `next` unchanged when it does not apply. Pure.
 */
export function floorRecoveryRunShare(
  prior: PriorReceipt | null | undefined,
  floor: number,
  next: number
): number {
  if (!prior) return next;
  const finite = (x: number) => (Number.isFinite(x) ? x : 0);
  const active = finite(prior.activeUnits);
  if (!(active > 0)) return next;
  const base = planBaseRunShare(prior, floor);
  if (base == null || !(base < FLOOR_RECOVERY_BAND)) return next;
  const produced = finite(prior.producedUnits);
  const offered = finite(prior.offeredUnits);
  const sold = finite(prior.soldUnits);
  if (!(sold > 0) || !(offered > 0)) return next;
  const sellThrough = Math.min(1, sold / offered);
  if (sellThrough < FLOOR_RECOVERY_SELL_THROUGH || sellThrough >= SOLD_OUT) return next;
  const runningCost =
    finite(prior.inputsConsumed) +
    finite(prior.labourPaid ?? 0) +
    finite(prior.labourArrears ?? 0) +
    finite(prior.otherOperatingPaid ?? 0) +
    finite(prior.otherOperatingArrears ?? 0);
  const contributionPerUnit =
    (finite(prior.revenue) - (runningCost * sold) / Math.max(produced, sold)) / sold;
  if (
    marginalLoss({
      sold,
      produced,
      sellThrough,
      revenue: finite(prior.revenue),
      inputsConsumed: finite(prior.inputsConsumed),
      contributionPerUnit,
    })
  )
    return next;
  const carriedStock = Math.max(0, offered - produced);
  if (carriedStock > FLOOR_RECOVERY_STOCK_COVER * sold) return next;
  return Math.max(next, Math.min(1, Math.min(FLOOR_RECOVERY_BAND, base + FLOOR_RECOVERY_STEP)));
}

/** Probe above last turn's sales, so a demand-planned plant keeps testing for more. */
const DEMAND_PLAN_PROBE = 0.1;

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
  if (
    marginalLoss({
      sold,
      produced,
      sellThrough,
      revenue: finite(prior.revenue),
      inputsConsumed: finite(prior.inputsConsumed),
      contributionPerUnit,
    })
  )
    return Math.max(floor, run * (1 - OUTPUT_CUT_STEP));
  if (sellThrough >= SOLD_OUT) {
    // Grow from what the plant planned, not only from what it made: short
    // inputs cut a sold-out line's output below its plan, and growing from the
    // cut output would cut it again next turn, compounding the shortage toward
    // the floor. The plan is held only while the run paid its running costs, so
    // a starved plant paying a full crew for a cut output falls back to what it
    // made.
    // Idle upkeep is owed whether or not the line runs, so it does not count
    // against holding the plan: an input-starved line pays it on a tiny output.
    const planned = Math.min(1, finite(prior.plannedRunShare ?? 0));
    const runContribution =
      contributionPerUnit +
      Math.max(0, finite(prior.idleOperatingCost ?? 0)) / Math.max(produced, sold);
    // The fallback for a run that did not pay its crew is on the plan scale,
    // not the production scale: produced units already reflect staffing and
    // resource yield, so produced / active reads far below the planned share
    // and would restart the plant near the floor every turn. Reading what was
    // made against what was planned keeps the shortfall proportional.
    const plannedUnits = finite(prior.plannedUnits ?? 0);
    const base =
      runContribution >= 0
        ? Math.max(run, planned)
        : plannedUnits > 0 && planned > 0
          ? Math.max(floor, planned * Math.min(1, produced / plannedUnits))
          : run;
    return Math.min(1, base * soldOutGrowth);
  }
  const expectedSales = sold * (1 + DEMAND_PLAN_PROBE);
  const heldStock = Math.max(0, offered - sold);
  // A run the game cut (no cash, short inputs) is a stoppage, not lost demand:
  // read demand from the sell-through of what the plant did make, at the run it
  // planned, so a cut output does not cap the next plan and lose its customers.
  const plannedShare = Math.min(1, Math.max(0, finite(prior.plannedRunShare ?? 0)));
  const cutSales =
    (prior.runCutBy?.length ?? 0) > 0 && plannedShare * active > produced
      ? plannedShare * active * sellThrough * (1 + DEMAND_PLAN_PROBE)
      : 0;
  const planned = Math.max(0, Math.max(expectedSales, cutSales) - heldStock);
  return floorRecoveryRunShare(prior, floor, Math.max(floor, Math.min(1, planned / active)));
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
  floor: number = OUTPUT_RUN_FLOOR,
  /** Pace from the planned run (producerRunPlanStage), so a cut run does not speed the fall. */
  fromPlan = false
): number {
  if (!(drop > 0) || !prior) return next;
  const active = Number.isFinite(prior.activeUnits) ? prior.activeUnits : 0;
  if (!(active > 0)) return next;
  const produced = Number.isFinite(prior.producedUnits) ? prior.producedUnits : 0;
  const prevRun = fromPlan
    ? planBaseRunShare(prior, floor)!
    : Math.max(floor, Math.min(1, produced / active));
  return Math.min(1, Math.max(next, prevRun * (1 - Math.min(1, drop))));
}

/** Additive recovery step under the plan-recovery rule: a share of capacity a turn. */
export const PLAN_RECOVERY_STEP = 0.15;
/** Consecutive glut turns before the plan-recovery rule drops a plant to its floor. */
export const GLUT_TURNS_TO_FLOOR = 2;

function sellThroughOf(prior: PriorReceipt): { offered: number; sellThrough: number } {
  const offered = Number.isFinite(prior.offeredUnits) ? prior.offeredUnits : 0;
  const sold = Number.isFinite(prior.soldUnits) ? prior.soldUnits : 0;
  return { offered, sellThrough: offered > 0 ? Math.min(1, sold / offered) : 0 };
}

/**
 * Consecutive glut turns ending with this receipt's turn: the plan of the next
 * turn records it, so the run rule can tell a one-turn glut from a lasting one.
 */
export function glutTurnsThrough(prior: PriorReceipt | null | undefined): number {
  if (!prior) return 0;
  const { offered, sellThrough } = sellThroughOf(prior);
  if (!(offered > 0) || !(sellThrough < GLUT_SELL_THROUGH)) return 0;
  const before = Number.isFinite(prior.priorGlutTurns) ? Math.max(0, prior.priorGlutTurns!) : 0;
  return before + 1;
}

/**
 * The run a plant steps from under the plan-recovery rule: the share it
 * planned last turn, not only what it made. Short inputs or cash cut what a
 * plant makes below its plan; starting from the cut output would lower the
 * plan every turn a plant is a little short, while it sells everything. A
 * receipt without a recorded plan falls back to what was made.
 */
export function planBaseRunShare(
  prior: PriorReceipt | null | undefined,
  floor: number = OUTPUT_RUN_FLOOR
): number | null {
  if (!prior) return null;
  const finite = (x: number) => (Number.isFinite(x) ? x : 0);
  const active = finite(prior.activeUnits);
  if (!(active > 0)) return null;
  const run = Math.max(floor, Math.min(1, finite(prior.producedUnits) / active));
  const planned = Math.min(1, finite(prior.plannedRunShare ?? 0));
  return planned > 0 ? Math.max(floor, run, planned) : run;
}

/**
 * Output follows price, recovering from the plan (gameConfig.producerRunPlanStage >= 1).
 *
 * The same signals as nextRunShare and demandPlanRunShare, read differently:
 * - grow and cut from the planned run share (planBaseRunShare), so a run cut
 *   by inputs or cash does not lower the next plan;
 * - a plant that sold out at a profit grows by a fixed step of capacity a
 *   turn (or faster with shortage growth), so a plant at the floor is back to
 *   a full run in about seven turns instead of seventeen or more;
 * - one glut turn steps the plan down; only a second glut turn in a row
 *   drops it to the floor.
 *
 * Pure: last receipt in, run share for this turn out.
 */
function planRecoveryRunShareCore(
  prior: PriorReceipt | null | undefined,
  options: {
    floor?: number;
    /** Growth factor for a line that sold out at a profit (see shortageGrowthRules). */
    soldOutGrowth?: number;
    /** Partial sell-through plans from expected sales (producerDemandPlanStage >= 1). */
    demandPlan?: boolean;
    /**
     * producerRunPlanStage >= 2: turns of sales a plant may hold in stock before
     * the never-below-sales floor counts the excess (see planRecoveryRunShare).
     */
    stockCoverTurns?: number;
    /**
     * producerRunPlanStage >= 3: a line whose sold units lost money after inputs,
     * wages and site costs steps down instead of holding or growing, and may plan
     * below last turn's sales (see planRecoveryRunShare).
     */
    lossCutBelowSales?: boolean;
  } = {}
): number {
  const floor = options.floor ?? OUTPUT_RUN_FLOOR;
  if (!prior) return 1;
  const finite = (x: number) => (Number.isFinite(x) ? x : 0);
  const active = finite(prior.activeUnits);
  if (!(active > 0)) return 1;
  // No output and no offer yet: no demand signal, run in full (see nextRunShare).
  if (!(finite(prior.producedUnits) > 0) && !(finite(prior.offeredUnits) > 0)) return 1;
  const base = planBaseRunShare(prior, floor)!;
  const produced = finite(prior.producedUnits);
  const sold = finite(prior.soldUnits);
  const { offered, sellThrough } = sellThroughOf(prior);
  const clamp = (x: number) => Math.max(floor, Math.min(1, x));
  if (offered > 0 && sellThrough < GLUT_SELL_THROUGH)
    return glutTurnsThrough(prior) >= GLUT_TURNS_TO_FLOOR
      ? floor
      : clamp(base * (1 - OUTPUT_CUT_STEP));
  const runningCost =
    finite(prior.inputsConsumed) +
    finite(prior.labourPaid ?? 0) +
    finite(prior.labourArrears ?? 0) +
    finite(prior.otherOperatingPaid ?? 0) +
    finite(prior.otherOperatingArrears ?? 0);
  const contributionPerUnit =
    sold > 0 ? (finite(prior.revenue) - (runningCost * sold) / Math.max(produced, sold)) / sold : 0;
  if (
    marginalLoss({
      sold,
      produced,
      sellThrough,
      revenue: finite(prior.revenue),
      inputsConsumed: finite(prior.inputsConsumed),
      contributionPerUnit,
    })
  )
    return clamp(base * (1 - OUTPUT_CUT_STEP));
  if (sellThrough >= SOLD_OUT)
    return clamp(
      Math.max(base + PLAN_RECOVERY_STEP, base * (options.soldOutGrowth ?? 1 + OUTPUT_GROW_STEP))
    );
  if (options.demandPlan) {
    // Partial sell-through: plan expected sales less held stock, as the demand
    // plan does; a cut run reads demand at the run it planned.
    const expectedSales = sold * (1 + DEMAND_PLAN_PROBE);
    const heldStock = Math.max(0, offered - sold);
    const cutSales =
      (prior.runCutBy?.length ?? 0) > 0 && base * active > produced
        ? base * active * sellThrough * (1 + DEMAND_PLAN_PROBE)
        : 0;
    return clamp((Math.max(expectedSales, cutSales) - heldStock) / active);
  }
  const target = base * sellThrough * (1 + OUTPUT_PROBE);
  return clamp(
    target < base
      ? Math.max(target, base * (1 - OUTPUT_CUT_STEP))
      : Math.min(target, base + PLAN_RECOVERY_STEP)
  );
}

/**
 * Invariant: a plant never plans to make less than it sold last turn. Glut,
 * loss and ratchet rules can only lower the plan down to that line. The one
 * exception is a plant that has gone a second consecutive turn without
 * selling (sell-through under GLUT_SELL_THROUGH): it may drop to the floor,
 * and on the first such turn it already only steps down gradually.
 */
export function planRecoveryRunShare(
  prior: PriorReceipt | null | undefined,
  options: Parameters<typeof planRecoveryRunShareCore>[1] = {}
): number {
  // Stage 3 (owner 2026-11-08): a line selling every unit below its running cost
  // was held at its sales by the floor and grew on the sell-out, so it ran until
  // its company's cash hit zero and every plant stopped at once (49 car plants
  // on turn 761). It now steps down a cut a turn and may plan below its sales.
  if (options.lossCutBelowSales && prior) {
    const signals = runSignals(prior, options.floor ?? OUTPUT_RUN_FLOOR);
    const base = planBaseRunShare(prior, options.floor ?? OUTPUT_RUN_FLOOR);
    const unitCost =
      (signals?.unitMaterials ?? 0) + (signals?.unitWages ?? 0) + (signals?.unitSite ?? 0);
    if (
      signals &&
      base != null &&
      finiteSold(prior) > 0 &&
      signals.unitPrice != null &&
      signals.unitPrice < unitCost
    )
      return Math.max(options.floor ?? OUTPUT_RUN_FLOOR, base * (1 - OUTPUT_CUT_STEP));
  }
  const next = floorRecoveryRunShare(
    prior,
    options.floor ?? OUTPUT_RUN_FLOOR,
    planRecoveryRunShareCore(prior, options)
  );
  if (!prior) return next;
  const finite = (x: number) => (Number.isFinite(x) ? x : 0);
  const active = finite(prior.activeUnits);
  if (!(active > 0)) return next;
  const { offered, sellThrough } = sellThroughOf(prior);
  if (
    offered > 0 &&
    sellThrough < GLUT_SELL_THROUGH &&
    glutTurnsThrough(prior) >= GLUT_TURNS_TO_FLOOR
  )
    return next;
  const sold = finite(prior.soldUnits);
  // Stage 2 (owner 2026-11-08): stock held beyond the cover is sold from the pile,
  // not made again. Gas plants sold what they made each turn and kept an equal
  // pile, so the floor held the run at full and world stock grew ~28k units a turn.
  const cover = options.stockCoverTurns;
  const excessStock =
    typeof cover === "number" && Number.isFinite(cover) && cover >= 0
      ? Math.max(0, Math.max(0, offered - sold) - cover * sold)
      : 0;
  const soldShare = Math.min(1, Math.max(0, sold - excessStock) / active);
  return Math.max(next, soldShare);
}

function finiteSold(prior: PriorReceipt): number {
  return Number.isFinite(prior.soldUnits) ? prior.soldUnits : 0;
}
