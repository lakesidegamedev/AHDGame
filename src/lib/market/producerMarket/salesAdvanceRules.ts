/**
 * Sales fund the run. A company that spent its cash (on construction, say) can still run a
 * plant whose sales pay for it: the run's wages, site running costs and inputs are financed
 * against the revenue the run earns in the same settlement, and settled from that revenue
 * before the turn closes. Whatever sales do not cover stays owed as an ordinary producer
 * payable, so money is never created.
 *
 * The advance is capped by expected run revenue: last turn's realized price times last turn's
 * sell-through on this run's units, with a margin for the market moving against it. A run that
 * does not pay for itself gets no advance beyond its revenue, so it still runs only the share
 * its own cash covers.
 *
 * Whether a run pays for itself is judged on expected input cost
 * (gameConfig.producerSalesAdvancePriceStage): last turn's clearing price, never above the bid
 * ceiling. Judged at the ceiling, a run that clears at a quarter of it reads as losing money and
 * is held to opening cash. The bid ceiling still caps what the run may bid.
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
  /** Units the company's own sites took from this line, paid at `captiveUnitValue` (not in `revenue`). */
  internalDeliveredUnits?: number;
  captiveUnitValue?: number;
  realizedUnitPrice?: number;
}

/**
 * Revenue one unit of this turn's run is expected to earn: for each output the
 * plant makes, units per run unit times last turn's realized price times its
 * sell-through (revenue over units offered). Units its own sites took count at
 * their captive value. Lines with no prior row earn
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
        // Units delivered to the company's own sites are offered but not in
        // `revenue`; the sites pay for them, and their inputs sit in the run's
        // bills, so they earn at the captive value.
        revenue +=
          finite(row.revenue) +
          finite(row.internalDeliveredUnits) *
            (finite(row.captiveUnitValue) || finite(row.realizedUnitPrice));
      }
    if (offered > 0) total += output.unitsPerOutput * (revenue / offered);
  }
  return Number.isFinite(total) ? total : 0;
}

/**
 * Price one unit of a run's input is expected to cost: last turn's clearing
 * price on its lane, never above the bid ceiling. A lane with no clearing
 * price is priced at the ceiling.
 */
export function expectedInputUnitPrice(ceiling: number, clearing: number | undefined): number {
  if (typeof clearing !== "number" || !Number.isFinite(clearing) || !(clearing > 0)) return ceiling;
  return Math.min(ceiling, clearing);
}

/** Expected revenue after the margin for a weaker market. */
function haircutRevenue(expectedRevenue: number, revenueShare: number | undefined): number {
  const share = revenueShare ?? SALES_ADVANCE_REVENUE_SHARE;
  return (
    Math.max(0, Number.isFinite(expectedRevenue) ? expectedRevenue : 0) *
    Math.min(1, Math.max(0, share))
  );
}

/**
 * Share of a full run a company can make when the run's own sales help pay for
 * it. `need` is the run's variable cost at a full run (wages, site running
 * costs and inputs at the bid ceiling); `free` is the cash left after old bills
 * and idle upkeep; `expectedRevenue` is what a full run is expected to earn.
 * `expectedNeed`, when given, is the same run with inputs at their expected
 * price (expectedInputUnitPrice); the run is then judged on that cost instead
 * of the ceiling. A run whose revenue covers its cost runs in full on no cash
 * at all; one that does not runs the share its cash covers the gap on.
 */
export function salesFundedRunShare(input: {
  free: number;
  need: number;
  expectedRevenue: number;
  revenueShare?: number;
  expectedNeed?: number;
}): number {
  const free = Math.max(0, Number.isFinite(input.free) ? input.free : 0);
  let need = Math.max(0, Number.isFinite(input.need) ? input.need : 0);
  if (input.expectedNeed != null)
    need = Math.min(
      need,
      Math.max(0, Number.isFinite(input.expectedNeed) ? input.expectedNeed : need)
    );
  if (need <= 0) return 1;
  const revenue = haircutRevenue(input.expectedRevenue, input.revenueShare);
  if (revenue >= need) return 1;
  const result = free / (need - revenue);
  return Number.isFinite(result) ? Math.min(1, Math.max(0, result)) : 0;
}

/**
 * Cash the run borrows against its own sales at share `runShare`: the part of
 * the run's cost its free cash does not cover. Never more than the run's
 * expected revenue at that share: when `expectedRevenue` is given the amount
 * is capped there explicitly (a run judged on expected input prices has a
 * ceiling-priced gap larger than its revenue).
 */
export function salesAdvanceAmount(input: {
  free: number;
  need: number;
  runShare: number;
  expectedRevenue?: number;
  revenueShare?: number;
}): number {
  let amount = input.runShare * Math.max(0, input.need) - Math.max(0, input.free);
  if (input.expectedRevenue != null)
    amount = Math.min(
      amount,
      input.runShare * haircutRevenue(input.expectedRevenue, input.revenueShare)
    );
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
