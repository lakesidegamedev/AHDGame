/**
 * Captive deliveries as sales (funded-market cutover). A plant that supplies
 * its own company's other sites books those units as internal deliveries: no
 * sale, no revenue. Every planning signal that reads sold units then sees a
 * plant that sells nothing. The demand plan cuts it to the probe run, the
 * zero-sales counter climbs, and an AI owner mothballs it after two turns,
 * which takes the input away from the sister plant it was feeding.
 *
 * Here internal deliveries count as sold units for those signals, valued at the
 * plant's own asking price for the profit test. No money moves: this changes
 * what the plan reads, not what the settlement pays.
 *
 * Pure: a settled receipt in, the receipt the planning signals read out.
 */
import type { PriorReceipt } from "./outputResponseRules";

export interface CaptiveProduct {
  commodity?: string;
  internalDeliveredUnits?: number;
  askingUnitPrice?: number | null;
  /**
   * What own-site deliveries are worth when the company's own sites were left
   * short of this good: what they bid for it, capped at the reference and never
   * under the ask. A mine feeding its own short steel plant is judged on what
   * that iron is worth to the company, not on a market price below its cost.
   */
  captiveUnitValue?: number | null;
  /** This plant's share of its own company's site demand for the good (production.ts). */
  ownSiteDemandUnits?: number;
  producedUnits?: number;
}

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/** Units the plant handed to its own sites last turn. */
export function internalDelivered(products: readonly CaptiveProduct[] | undefined): number {
  let units = 0;
  for (const p of products ?? []) units += positive(p.internalDeliveredUnits);
  return units;
}

/** Sold plus internally delivered units, the plant's real offtake. */
export function offtakeUnits(receipt: {
  soldUnits?: number;
  products?: readonly CaptiveProduct[];
}): number {
  return positive(receipt.soldUnits) + internalDelivered(receipt.products);
}

/** The receipt the planning signals read: internal deliveries as sales at the plant's ask. */
export function withCaptiveDeliveries<
  T extends PriorReceipt & { products?: readonly CaptiveProduct[] },
>(receipt: T): T {
  let units = 0;
  let value = 0;
  for (const p of receipt.products ?? []) {
    const u = positive(p.internalDeliveredUnits);
    units += u;
    value += u * (positive(p.captiveUnitValue) || positive(p.askingUnitPrice));
  }
  if (!(units > 0)) return receipt;
  return {
    ...receipt,
    soldUnits: positive(receipt.soldUnits) + units,
    revenue: (Number.isFinite(receipt.revenue) ? receipt.revenue : 0) + value,
  };
}

/**
 * The run that would cover the plant's share of its own company's demand for a
 * good it already supplies them. Without it a plant whose output all goes to
 * its own sites plans from what it delivered, so a site stuck at a sliver of
 * capacity plans that sliver again while its company buys the rest of the good
 * on the market. Read on the plan scale: last turn's planned run made
 * `producedUnits`, so covering `ownSiteDemandUnits` takes that run scaled by
 * their ratio. Capped at a full run; short inputs and cash still cut the run
 * when it settles. Only lines that delivered to own sites last turn count, so a
 * company that buys on the market first does not pull its plant up.
 *
 * Pure: the planning receipt and last turn's plan base in, a run share floor
 * out (0 when the plant has no such demand).
 */
export function ownDemandRunShare(
  receipt: { products?: readonly CaptiveProduct[] } | null | undefined,
  planBase: number | null | undefined
): number {
  const base = positive(planBase);
  if (!receipt || !(base > 0)) return 0;
  const lines = new Map<string, { demand: number; produced: number; internal: number }>();
  for (const p of receipt.products ?? []) {
    const key = p.commodity ?? "";
    const line = lines.get(key) ?? { demand: 0, produced: 0, internal: 0 };
    line.demand += positive(p.ownSiteDemandUnits);
    line.produced += positive(p.producedUnits);
    line.internal += positive(p.internalDeliveredUnits);
    lines.set(key, line);
  }
  let share = 0;
  for (const line of lines.values())
    if (line.demand > 0 && line.produced > 0 && line.internal > 0)
      share = Math.max(share, (base * line.demand) / line.produced);
  return Math.min(1, share);
}
