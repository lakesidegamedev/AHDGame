/**
 * Sales fund the run. A company that spent its cash (on construction, say) can still run a
 * plant whose sales pay for it: the run's wages, site running costs and inputs are financed
 * against the revenue the run earns in the same settlement, and settled from that revenue
 * before the turn closes. Whatever sales do not cover stays owed as an ordinary producer
 * payable, so money is never created.
 *
 * A run whose expected revenue (last turn's realized price times last turn's sell-through on
 * this run's units) covers its expected bills runs in full, whatever the company's opening
 * cash, zero or below. Its input line is bounded by what its sales actually bring in during
 * the settlement, so it never closes below zero. A run that does not pay for itself is
 * financed only against its revenue less a margin for the market moving against it, so it
 * still runs only the share its own cash covers.
 *
 * A company's plants are judged one by one: a plant that pays for itself runs in full even
 * when another of the company's plants loses money.
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

/** True when a run's expected revenue covers its expected cost in full. */
function paysForItself(need: number, expectedRevenue: number): boolean {
  return need <= 0 || (Number.isFinite(expectedRevenue) && expectedRevenue >= need);
}

/**
 * Share of a full run a company can make when the run's own sales help pay for
 * it. `need` is the run's variable cost at a full run (wages, site running
 * costs and inputs at the bid ceiling); `free` is the cash left after old bills
 * and idle upkeep; `expectedRevenue` is what a full run is expected to earn.
 * `expectedNeed`, when given, is the same run with inputs at their expected
 * price (expectedInputUnitPrice); the run is then judged on that cost instead
 * of the ceiling. A run whose expected revenue covers its cost runs in full on
 * no cash at all, with no margin held back; one that does not runs the share
 * its cash covers the gap on, its revenue counted less that margin.
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
  if (paysForItself(need, input.expectedRevenue)) return 1;
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

/** One plant of a company, for salesFundedPlantShares. */
export interface SalesFundedPlant {
  /** Variable cost of a full run with inputs at the bid ceiling. */
  need: number;
  /** The same run with inputs at their expected price; absent = judged at `need`. */
  expectedNeed?: number;
  /** What a full run is expected to earn. */
  expectedRevenue: number;
}

/**
 * Run share of each of a company's plants and the cash it borrows against its
 * sales, from `free` cash (after old bills and idle upkeep). If the company's
 * run as a whole pays for itself, every plant runs in full. Otherwise a plant
 * that pays runs in full on its own sales, and the losing plants run on the
 * larger of what cash covers for them alone and the whole company's share.
 * A paying plant's advance covers its whole cost: the settlement cuts the input
 * line of a company whose sales fall short, and unpaid bills stay payables.
 */
export function salesFundedPlantShares(input: {
  free: number;
  plants: readonly SalesFundedPlant[];
  revenueShare?: number;
  /**
   * Fixed bills (idle upkeep) the opening cash does not cover. They are owed
   * with the run's deferred bills, so a paying run's advance carries them too;
   * otherwise they would come out of the cash its inputs are bought with.
   */
  unpaidFixedBills?: number;
}): { shares: number[]; advance: number } {
  const positive = (x: number | undefined) =>
    typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
  const free = positive(input.free);
  const unpaidFixed = positive(input.unpaidFixedBills);
  // The advance is capped by revenue only when the run is judged on expected prices.
  const capped = input.plants.some((p) => p.expectedNeed != null);
  const rows = input.plants.map((p) => {
    const need = positive(p.need);
    const expectedNeed = p.expectedNeed != null ? Math.min(need, positive(p.expectedNeed)) : need;
    const revenue = positive(p.expectedRevenue);
    return { need, expectedNeed, revenue, pays: paysForItself(expectedNeed, revenue) };
  });
  const sum = (list: typeof rows, key: "need" | "expectedNeed" | "revenue") =>
    list.reduce((n, r) => n + r[key], 0);
  const runOf = (list: typeof rows) => ({
    free,
    need: sum(list, "need"),
    expectedRevenue: sum(list, "revenue"),
    revenueShare: input.revenueShare,
    ...(capped ? { expectedNeed: sum(list, "expectedNeed") } : {}),
  });
  const advanceOf = (list: typeof rows, runShare: number) =>
    salesAdvanceAmount({
      free,
      need: sum(list, "need"),
      runShare,
      revenueShare: input.revenueShare,
      ...(capped ? { expectedRevenue: sum(list, "revenue") } : {}),
    });
  const whole = salesFundedRunShare(runOf(rows));
  if (whole >= 1) {
    // Paying run: borrow its whole cost; the settlement bounds it by real sales.
    const amount = sum(rows, "need") + unpaidFixed - free;
    return {
      shares: rows.map(() => 1),
      advance: Number.isFinite(amount) && amount > 0 ? amount : 0,
    };
  }
  const paying = rows.filter((r) => r.pays);
  const losing = rows.filter((r) => !r.pays);
  if (paying.length === 0)
    return { shares: rows.map(() => whole), advance: advanceOf(rows, whole) };
  const losingShare = Math.max(whole, salesFundedRunShare(runOf(losing)));
  // Cash the losing plants borrow, capped by their own revenue less the margin
  // plus what the paying plants are expected to earn beyond theirs (the margin
  // the whole-company share already counted on).
  const share = Math.min(1, Math.max(0, input.revenueShare ?? SALES_ADVANCE_REVENUE_SHARE));
  const surplus = paying.reduce((n, r) => n + Math.max(0, r.revenue * share - r.expectedNeed), 0);
  let losingAdvance = losingShare * sum(losing, "need") - free;
  if (capped)
    losingAdvance = Math.min(
      losingAdvance,
      losingShare * haircutRevenue(sum(losing, "revenue"), input.revenueShare) + surplus
    );
  const amount = sum(paying, "need") + unpaidFixed + losingAdvance;
  return {
    shares: rows.map((r) => (r.pays ? 1 : losingShare)),
    advance: Number.isFinite(amount) && amount > 0 ? amount : 0,
  };
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
