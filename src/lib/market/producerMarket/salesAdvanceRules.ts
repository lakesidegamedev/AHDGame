/**
 * Sales fund the run. A company that spent its cash (on construction, say) can
 * still run a plant whose sales pay for it: the run's wages, site running costs
 * and inputs are financed against the revenue the run earns in the same
 * settlement, and settled from that revenue before the turn closes. Whatever
 * the sales do not cover stays owed as an ordinary producer payable, so money
 * is never created.
 *
 * The advance is capped by what the run is expected to earn: last turn's
 * realized price times last turn's sell-through, on the units this run makes,
 * with a margin for the market moving against it. A run that does not pay for
 * itself gets no advance beyond its revenue, so it still runs only the share
 * its own cash covers.
 *
 * Pure: plain data in, plain data out. Anchor units throughout.
 */

/** Share of the expected run revenue the advance may finance; the rest absorbs a weaker market. */
export const SALES_ADVANCE_REVENUE_SHARE = 0.9;

/** One product row of last turn's settled receipt. */
export interface SalesAdvanceLine {
  commodity: string;
  offeredUnits?: number;
  soldUnits?: number;
  revenue?: number;
}

/**
 * Revenue one unit of this turn's run is expected to earn: for each output the
 * plant makes, units per run unit times last turn's realized price times its
 * sell-through (revenue over units offered). Lines with no prior row earn
 * nothing here, so a new line gets no advance until it has sold.
 */
export function expectedUnitRevenue(
  outputs: readonly { commodity: string; unitsPerOutput: number }[],
  lastProducts: readonly SalesAdvanceLine[] | null | undefined
): number {
  if (!lastProducts || lastProducts.length === 0) return 0;
  const finite = (x: number | undefined) =>
    typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
  let total = 0;
  for (const output of outputs) {
    if (!(output.unitsPerOutput > 0)) continue;
    let offered = 0,
      revenue = 0;
    for (const row of lastProducts)
      if (row.commodity === output.commodity) {
        offered += finite(row.offeredUnits);
        revenue += finite(row.revenue);
      }
    if (offered > 0) total += output.unitsPerOutput * (revenue / offered);
  }
  return Number.isFinite(total) ? total : 0;
}

/**
 * Share of a full run a company can make when the run's own sales help pay for
 * it. `need` is the run's variable cost at a full run (wages, site running
 * costs and inputs at the bid ceiling); `free` is the cash left after old bills
 * and idle upkeep; `expectedRevenue` is what a full run is expected to earn.
 * A run whose revenue covers its cost runs in full on no cash at all; one that
 * does not runs the share its cash covers the gap on.
 */
export function salesFundedRunShare(input: {
  free: number;
  need: number;
  expectedRevenue: number;
  revenueShare?: number;
}): number {
  const free = Math.max(0, Number.isFinite(input.free) ? input.free : 0);
  const need = Math.max(0, Number.isFinite(input.need) ? input.need : 0);
  if (need <= 0) return 1;
  const share = input.revenueShare ?? SALES_ADVANCE_REVENUE_SHARE;
  const revenue =
    Math.max(0, Number.isFinite(input.expectedRevenue) ? input.expectedRevenue : 0) *
    Math.min(1, Math.max(0, share));
  if (revenue >= need) return 1;
  const result = free / (need - revenue);
  return Number.isFinite(result) ? Math.min(1, Math.max(0, result)) : 0;
}

/**
 * Cash the run borrows against its own sales at share `runShare`: the part of
 * the run's cost its free cash does not cover. Never more than the run's
 * expected revenue at that share.
 */
export function salesAdvanceAmount(input: {
  free: number;
  need: number;
  runShare: number;
}): number {
  const amount = input.runShare * Math.max(0, input.need) - Math.max(0, input.free);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * What the run's sales pay toward the bills it deferred: closing cash first
 * covers what was bought on the advance (already netted in `closingCash`), then
 * the deferred wages and site bills pro rata. The rest stays owed.
 */
export function deferredBillFraction(closingCash: number, deferred: number): number {
  if (!(deferred > 0)) return 0;
  if (!(closingCash > 0)) return 0;
  return Math.min(1, closingCash / deferred);
}
