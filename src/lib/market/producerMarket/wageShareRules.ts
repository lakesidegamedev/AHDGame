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
  const valueAdded =
    last.revenue -
    last.inputsConsumed -
    (last.minorInputPremium ?? 0) -
    (last.inventoryWriteOff ?? 0);
  const siteBill = (last.otherOperatingPaid ?? 0) + (last.otherOperatingArrears ?? 0);
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
