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
 * - `buyers_elsewhere`: the plant's own market ran out of buyers (or had none)
 *   while the good is still short in markets the plant cannot sell into: another
 *   state for a local service, another country's book for a traded good. The
 *   live world shows this is the most common cause (#5450, turn 645 reading).
 *
 * Routing and production constraints are not inferred here: a plant that could
 * not make its output does not offer it, so it never shows as unsold.
 *
 * Pure: receipt figures in, a reading out.
 */
import { laneKeyOf } from "@/lib/market/producerMarket/laneKey";
import type { ProducerOperatingResult } from "@/lib/market/producerMarket/production";

export type UnsoldReason =
  "ask_above_market" | "shared_at_market" | "buyers_exhausted" | "no_buyers" | "buyers_elsewhere";

/** Where the unmet buyers are, for `buyers_elsewhere`. */
export type UnsoldElsewhere = "state" | "country";

export interface UnsoldReading {
  reason: UnsoldReason;
  /** For `buyers_elsewhere`: other states (local service) or other countries. */
  elsewhere?: UnsoldElsewhere;
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
  lanePrice: (commodity: string, book: string) => number | null | undefined,
  /**
   * Whether the good is still short in markets this plant cannot reach, and
   * where. Null or absent: not short elsewhere, or unknown.
   */
  shortElsewhere: (commodity: string) => UnsoldElsewhere | null = () => null
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
    const local = unsoldReasonFor(ask, market > 0 ? market : null);
    // A competitive ask that still found no buyer here, while the good is short
    // elsewhere: the buyers exist, just not in a market this plant reaches.
    const elsewhere =
      local === "buyers_exhausted" || local === "no_buyers" ? shortElsewhere(commodity) : null;
    const reason: UnsoldReason = elsewhere ? "buyers_elsewhere" : local;
    out.set(commodity, {
      reason,
      unsoldShare,
      askUnitPrice: ask,
      marketUnitPrice: market > 0 ? market : null,
      ...(elsewhere ? { elsewhere } : {}),
    });
  }
  return out;
}

/**
 * The unsold reading per commodity for a sector page: nothing for a non-CEO,
 * without the receipt turn's lane prices, or without a receipt from last turn.
 */
export function unsoldReadingsFor(args: {
  isCeo: boolean;
  receipt: { turn: number; products?: readonly SettledProductRow[] | null } | null | undefined;
  currentTurn: number;
  laneClearingPrices: Readonly<Record<string, number | undefined>> | undefined;
  shortElsewhere?: (commodity: string) => UnsoldElsewhere | null;
}): Map<string, UnsoldReading> {
  const { receipt, laneClearingPrices } = args;
  if (!args.isCeo || !laneClearingPrices || !receipt || !(receipt.turn >= args.currentTurn - 1))
    return new Map();
  return unsoldByCommodity(
    (receipt.products ?? []).map((p) => ({
      commodity: p.commodity,
      book: p.book,
      offeredUnits: p.offeredUnits,
      deliveredUnits: p.deliveredUnits,
      askingUnitPrice: p.askingUnitPrice,
    })),
    (commodity, book) => laneClearingPrices[laneKeyOf(commodity, book)] ?? null,
    args.shortElsewhere
  );
}

/** The fields of a settled receipt product this reading uses. */
export type SettledProductRow = Pick<
  ProducerOperatingResult["products"][number],
  "commodity" | "book" | "offeredUnits" | "deliveredUnits" | "askingUnitPrice"
>;
