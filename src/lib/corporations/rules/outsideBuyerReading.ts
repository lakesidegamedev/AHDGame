/**
 * Who bought an output sold outside the company, and why the average price paid
 * sat under the regional price.
 *
 * Buyers come from the settled market's order outcomes for the commodity: they
 * are market-wide totals by buyer kind, not this plant's own customers (the
 * clearing pools sellers, so a plant's sales are not tracked per buyer). Company
 * plants are not in that split.
 *
 * Pure: recorded figures in, a reading out.
 */
import {
  FUNDED_BUYER_LABELS,
  type FundedBuyerDemandRow,
  type FundedBuyerKind,
} from "@/lib/market/producerMarket/fundedBuyerDemandRules";

export interface OutsideBuyerRow {
  kind: FundedBuyerKind;
  name: string;
  /** Units delivered a day across the whole market. */
  delivered: number;
  /** Units ordered a day across the whole market. */
  requested: number;
}

/** Why sales averaged under the regional price, most direct cause first. */
export type BelowRegionalReason = "ask_below_regional" | "book_below_regional" | "mixed_lanes";

export interface OutsidePriceReading {
  askUnitPrice: number;
  paidUnitPrice: number;
  /** What buyers in this plant's book paid, when recorded. */
  bookUnitPrice: number | null;
  regionalUnitPrice: number;
  /** Paid over regional, minus 1: negative is under. */
  gapShare: number;
  /** Set only when the average paid is under the regional price by more than the tolerance. */
  belowRegional: BelowRegionalReason | null;
}

export interface OutsideBuyerReading {
  buyers: OutsideBuyerRow[];
  price: OutsidePriceReading | null;
}

const GAP_TOLERANCE = 0.01;

export function outsideBuyerRows(
  buyerDemand: readonly FundedBuyerDemandRow[] | undefined,
  commodity: string
): OutsideBuyerRow[] {
  return (buyerDemand ?? [])
    .filter((row) => row.commodity === commodity && (row.delivered > 0 || row.requested > 0))
    .map((row) => ({
      kind: row.kind,
      name: FUNDED_BUYER_LABELS[row.kind].name,
      delivered: row.delivered,
      requested: row.requested,
    }))
    .sort((a, b) => b.delivered - a.delivered);
}

export function outsidePriceReading(input: {
  askUnitPrice: number | null | undefined;
  paidUnitPrice: number | null | undefined;
  bookUnitPrice: number | null | undefined;
  regionalUnitPrice: number | null | undefined;
}): OutsidePriceReading | null {
  const ask = input.askUnitPrice;
  const paid = input.paidUnitPrice;
  const regional = input.regionalUnitPrice;
  if (typeof ask !== "number" || !(ask > 0)) return null;
  if (typeof paid !== "number" || !(paid > 0)) return null;
  if (typeof regional !== "number" || !(regional > 0)) return null;
  const book =
    typeof input.bookUnitPrice === "number" && input.bookUnitPrice > 0 ? input.bookUnitPrice : null;
  const gapShare = paid / regional - 1;
  let belowRegional: BelowRegionalReason | null = null;
  if (gapShare < -GAP_TOLERANCE) {
    if (ask < regional * (1 - GAP_TOLERANCE)) belowRegional = "ask_below_regional";
    else if (book != null && book < regional * (1 - GAP_TOLERANCE))
      belowRegional = "book_below_regional";
    else belowRegional = "mixed_lanes";
  }
  return {
    askUnitPrice: ask,
    paidUnitPrice: paid,
    bookUnitPrice: book,
    regionalUnitPrice: regional,
    gapShare,
    belowRegional,
  };
}
