/**
 * Why part of an output went unsold last turn (issue #5448 / #5450).
 *
 * The sector page showed a sold share and nothing else, so a player could not
 * tell a price problem from a demand problem. The settled receipt has the ask,
 * the offered and the delivered units; the market outcome has what buyers in
 * each book paid. Their comparison names the cause:
 *
 * - `ask_above_market`: buyers in the book paid less than the ask, so they
 *   bought from cheaper sellers first.
 * - `shared_at_market`: the ask matched what buyers paid, and the buyers at
 *   that price were split between every seller asking it.
 * - `buyers_exhausted`: the ask was below what buyers paid, yet units were
 *   left: every buyer who would pay that much was already supplied.
 * - `no_buyers`: nothing traded in the book at all.
 *
 * Routing and production constraints are not inferred here: a plant that could
 * not make its output does not offer it, so it never shows as unsold.
 *
 * Pure: receipt figures in, a reading out.
 */

export type UnsoldReason =
  "ask_above_market" | "shared_at_market" | "buyers_exhausted" | "no_buyers";

export interface UnsoldReading {
  reason: UnsoldReason;
  /** Share of the offer left unsold across every plant and book (0-1). */
  unsoldShare: number;
  /** Offer-weighted ask in the book that left the most units unsold. */
  askUnitPrice: number;
  /** What buyers in that book paid on average; null only for `no_buyers`. */
  marketUnitPrice: number | null;
}

/** An ask within this share of the market price reads as at the market. */
export const PRICE_TOLERANCE = 0.005;
/** Below this unsold share the output reads as sold out. */
export const SOLD_OUT_SHARE = 0.01;

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/** The reason for one book, from its ask against what buyers paid there. */
export function unsoldReasonFor(
  askUnitPrice: number,
  marketUnitPrice: number | null | undefined
): UnsoldReason {
  const market = positive(marketUnitPrice);
  if (market <= 0) return "no_buyers";
  const ask = positive(askUnitPrice);
  if (ask > market * (1 + PRICE_TOLERANCE)) return "ask_above_market";
  if (ask < market * (1 - PRICE_TOLERANCE)) return "buyers_exhausted";
  return "shared_at_market";
}

export interface ReceiptProductRow {
  commodity: string;
  /** Book the row sold into; a row without one cannot be priced. */
  book?: string | null;
  offeredUnits: number;
  /** Units that left the plant: market sales plus own-site deliveries. */
  deliveredUnits: number;
  askingUnitPrice: number;
}

/**
 * One reading per commodity across every receipt row (a sector receipt holds
 * one row per plant per book). The unsold share comes from the commodity's
 * totals; the reason comes from the book with the most unsold units, at that
 * book's offer-weighted ask, so no single plant's row speaks for the sector.
 */
export function unsoldByCommodity(
  rows: readonly ReceiptProductRow[],
  lanePrice: (commodity: string, book: string) => number | null | undefined
): Map<string, UnsoldReading> {
  type Lane = { book: string | null; offered: number; delivered: number; askValue: number };
  const byCommodity = new Map<string, Map<string, Lane>>();
  for (const row of rows) {
    const offered = positive(row.offeredUnits);
    if (offered <= 0) continue;
    const book = row.book ? row.book : null;
    const lanes = byCommodity.get(row.commodity) ?? new Map<string, Lane>();
    const key = book ?? "";
    const lane = lanes.get(key) ?? { book, offered: 0, delivered: 0, askValue: 0 };
    lane.offered += offered;
    lane.delivered += Math.min(offered, positive(row.deliveredUnits));
    lane.askValue += offered * positive(row.askingUnitPrice);
    lanes.set(key, lane);
    byCommodity.set(row.commodity, lanes);
  }
  const out = new Map<string, UnsoldReading>();
  for (const [commodity, lanes] of byCommodity) {
    let offered = 0;
    let delivered = 0;
    let worst: Lane | null = null;
    for (const lane of lanes.values()) {
      offered += lane.offered;
      delivered += lane.delivered;
      if (!worst || lane.offered - lane.delivered > worst.offered - worst.delivered) worst = lane;
    }
    if (!(offered > 0) || !worst) continue;
    const unsoldShare = Math.max(0, 1 - delivered / offered);
    if (unsoldShare < SOLD_OUT_SHARE) continue;
    const ask = worst.offered > 0 ? worst.askValue / worst.offered : 0;
    const market = worst.book ? positive(lanePrice(commodity, worst.book)) : 0;
    const reason = unsoldReasonFor(ask, market > 0 ? market : null);
    out.set(commodity, {
      reason,
      unsoldShare,
      askUnitPrice: ask,
      marketUnitPrice: reason === "no_buyers" ? null : market,
    });
  }
  return out;
}
