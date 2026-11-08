/**
 * Own-site deliveries at market value (producerCaptiveDeliveryStage >= 3). A
 * plant that hands output to its own company's other sites moves no cash and
 * books no sale, so its accounts show the cost of making the good and none of
 * its worth: a mine feeding its own steel plant reads as a loss.
 *
 * Each unit moved between own sites is valued at this turn's clearing price
 * for its lane, or the selling site's ask when the lane did not trade. The
 * seller books internal supply income and the receiver books the same amount
 * as an internal supply charge, so company totals are unchanged. Only opt-in
 * accounts are valued: Free transfer pricing books nothing, and an explicit
 * internal transfer price already books its own entries.
 *
 * Pure: settled internal deliveries, offers and lane prices in, matching
 * per-offer income and per-order charges out.
 */
import { laneKeyOf } from "./laneKey";

export interface InternalDeliveryRow {
  offerId: string;
  orderId: string;
  units: number;
}

export interface CaptiveMarketOffer {
  accountId: string;
  commodity: string;
  book: string;
  unitPrice: number;
}

export interface CaptiveMarketValue {
  incomeByOffer: Map<string, number>;
  chargeByOrder: Map<string, number>;
}

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/** This turn's clearing price per lane from the settled price rows. */
export function laneClearingPrices(
  prices: readonly { commodity: string; book: string; units: number; value: number }[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of prices)
    if (row.units > 0 && row.value > 0)
      out.set(laneKeyOf(row.commodity, row.book), row.value / row.units);
  return out;
}

export function captiveMarketValue(input: {
  deliveries: readonly InternalDeliveryRow[];
  offers: ReadonlyMap<string, CaptiveMarketOffer>;
  clearingByLane: ReadonlyMap<string, number>;
  /** Accounts that opted in to market-value entries; every other account books none. */
  valuedAccounts: ReadonlySet<string>;
}): CaptiveMarketValue {
  const incomeByOffer = new Map<string, number>();
  const chargeByOrder = new Map<string, number>();
  for (const row of input.deliveries) {
    const units = positive(row.units);
    const offer = input.offers.get(row.offerId);
    if (!(units > 0) || !offer || !input.valuedAccounts.has(offer.accountId)) continue;
    const unitPrice =
      positive(input.clearingByLane.get(laneKeyOf(offer.commodity, offer.book))) ||
      positive(offer.unitPrice);
    const amount = units * unitPrice;
    if (!Number.isFinite(amount)) throw new Error("Invalid captive market value");
    if (!(amount > 0)) continue;
    incomeByOffer.set(row.offerId, (incomeByOffer.get(row.offerId) ?? 0) + amount);
    chargeByOrder.set(row.orderId, (chargeByOrder.get(row.orderId) ?? 0) + amount);
  }
  return { incomeByOffer, chargeByOrder };
}
