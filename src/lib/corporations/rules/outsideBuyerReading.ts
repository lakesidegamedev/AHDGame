/**
 * Who bought an output sold outside the company, and why the average price paid
 * sat under the regional price.
 *
 * When the plant's settled receipt recorded who bought its sales, the buyers are
 * this plant's own customers. Older receipts fall back to the settled market's
 * order outcomes for the commodity: market-wide totals by buyer kind, without
 * company plants.
 *
 * Pure: recorded figures in, a reading out.
 */
import {
  FUNDED_BUYER_LABELS,
  type FundedBuyerDemandRow,
  type FundedBuyerKind,
} from "@/lib/market/producerMarket/fundedBuyerDemandRules";

export type OutsideBuyerKind = FundedBuyerKind | "companies";

export interface OutsideBuyerRow {
  kind: OutsideBuyerKind;
  name: string;
  /** Units delivered a day (this plant's sales, or the whole market's). */
  delivered: number;
  /** Units ordered a day across the whole market. Zero for a plant's own sales. */
  requested: number;
}

/** Whose buyers the rows are: this plant's own sales, or the market-wide split. */
export type OutsideBuyerBasis = "plant" | "market";

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
  /** Absent on payloads from before the plant's buyers were recorded: read as market-wide. */
  basis?: OutsideBuyerBasis;
  price: OutsidePriceReading | null;
}

const GAP_TOLERANCE = 0.01;

const COMPANY_LABEL = "Other companies";

/** This plant's outside sales by buyer kind, from its settled receipt; per-turn units in, per-day rows out. */
export function plantBuyerRows(
  soldTo: Readonly<Partial<Record<string, number>>> | undefined,
  unitsPerDay: number
): OutsideBuyerRow[] | null {
  if (!soldTo) return null;
  const rows: OutsideBuyerRow[] = [];
  for (const [kind, units] of Object.entries(soldTo)) {
    if (typeof units !== "number" || !(units > 0)) continue;
    const known = kind in FUNDED_BUYER_LABELS;
    if (!known && kind !== "companies") continue;
    rows.push({
      kind: kind as OutsideBuyerKind,
      name: known ? FUNDED_BUYER_LABELS[kind as FundedBuyerKind].name : COMPANY_LABEL,
      delivered: units * unitsPerDay,
      requested: 0,
    });
  }
  return rows.length > 0 ? rows.sort((a, b) => b.delivered - a.delivered) : null;
}

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
