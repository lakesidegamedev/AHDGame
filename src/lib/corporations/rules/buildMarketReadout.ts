/** Per-product buyer readout for the build dialog. Pure; no rendering. */
import type { CommodityType } from "@/lib/constants/commodities";
import type { BuildDemandRow } from "./fundedBuildDemand";
import { fullMixBuildRoom } from "./buildDemandCapacity";

export type ProductVerdict =
  /** Paid orders went unfilled and at least one new site would serve them. */
  | "waiting"
  /** Orders went unfilled, but idle or queued capacity already covers them. */
  | "idle-covers"
  /** Every paid order was filled. */
  | "covered"
  /** No paid orders in this market. */
  | "no-orders"
  | "unknown";

export interface ProductReadout {
  commodity: CommodityType;
  ordered: number | null;
  filled: number | null;
  unmet: number | null;
  /** New sites the unmet orders would keep busy for this product alone. */
  facilities: number | null;
  capHiddenUnmet?: number;
  verdict: ProductVerdict;
}

export type ReadoutSummary = "all-waiting" | "some-waiting" | "none-waiting" | "unknown";

export interface MarketReadout {
  products: ProductReadout[];
  summary: ReadoutSummary;
  /** Sites that would sell every output they make. */
  fullMixFacilities: number | null;
}

function verdictFor(row: BuildDemandRow, facilities: number | null): ProductVerdict {
  if (row.funded == null || row.delivered == null || row.unmet == null) return "unknown";
  if (row.funded <= 0) return "no-orders";
  if (row.unmet <= 0) return "covered";
  if (facilities == null) return "unknown";
  return facilities >= 1 ? "waiting" : "idle-covers";
}

/**
 * One readout per product. Rows hold a regional subset and the full market for
 * the same product; the full market is the last row for each product.
 */
export function buildMarketReadout(
  rows: readonly BuildDemandRow[],
  unitsPerFacility: number
): MarketReadout {
  const primary = [...new Map(rows.map((row) => [row.commodity, row])).values()];
  const perFacility = unitsPerFacility > 0 ? unitsPerFacility : 1;
  const products = primary.map((row): ProductReadout => {
    const facilities =
      row.capacityUnits == null ? null : Math.max(0, Math.floor(row.capacityUnits / perFacility));
    return {
      commodity: row.commodity,
      ordered: row.funded,
      filled: row.delivered,
      unmet: row.unmet,
      facilities,
      ...(row.capHiddenUnmet ? { capHiddenUnmet: row.capHiddenUnmet } : {}),
      verdict: verdictFor(row, facilities),
    };
  });
  const known = products.filter((p) => p.verdict !== "unknown");
  const waiting = known.filter((p) => p.verdict === "waiting").length;
  const summary: ReadoutSummary =
    known.length === 0
      ? "unknown"
      : waiting === 0
        ? "none-waiting"
        : waiting === known.length
          ? "all-waiting"
          : "some-waiting";
  const fullMix = fullMixBuildRoom(rows);
  return {
    products,
    summary,
    fullMixFacilities: fullMix == null ? null : Math.floor(fullMix / perFacility),
  };
}
