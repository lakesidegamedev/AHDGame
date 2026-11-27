/**
 * Unmet demand for one output leg of an NPP placement cell, read from the
 * funded order book the player build dialog uses (rules/fundedBuildDemand):
 * cash-backed orders less what buyers received. The price documents' state and
 * national demand omit government buying and company build spending for goods
 * sold beyond one region, so they hid real shortages from NPPs. They remain the
 * reading only on a world with no funded book. Plain data in, plain data out.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import type { BuildDemandRow } from "@/lib/corporations/rules/fundedBuildDemand";

/** Supply and demand totals as the price documents store them, keyed by region or country. */
export interface PriceDocGapSource {
  stateSupply?: Record<string, number> | null;
  stateDemand?: Record<string, number> | null;
  nationalSupply?: Record<string, number> | null;
  nationalDemand?: Record<string, number> | null;
}

export interface GapCell {
  stateId: string;
  countryId: string;
}

/**
 * The leg's unmet funded orders from its build-demand rows. The market-wide row
 * is last (fundedBuildDemand puts it there). A country with no row in a
 * published book placed no orders for the good, which is a measured zero; a
 * regional row the receipt never measured stays unknown.
 */
export function fundedLegUnmetUnits(rows: readonly BuildDemandRow[] | undefined): number | null {
  const primary = rows?.at(-1);
  if (!primary) return null;
  if (primary.unmet != null && Number.isFinite(primary.unmet)) return Math.max(0, primary.unmet);
  return primary.scope === "national" ? 0 : null;
}

/** The legacy reading: price-document demand less supply in the leg's own scope. */
export function priceDocLegUnmetUnits(
  doc: PriceDocGapSource | undefined,
  cell: GapCell,
  stateScoped: boolean
): number | null {
  if (!doc) return null;
  const [supply, demand] = stateScoped
    ? [doc.stateSupply?.[cell.stateId], doc.stateDemand?.[cell.stateId]]
    : [doc.nationalSupply?.[cell.countryId], doc.nationalDemand?.[cell.countryId]];
  if (typeof supply !== "number" || typeof demand !== "number") return null;
  return Math.max(0, demand - supply);
}

/**
 * Gap reader for one leg: the funded book when the world publishes one, else
 * the price documents. `fundedRows` is the funded build-demand lookup (null on
 * a world without a funded book).
 */
export function createLegGapReader(args: {
  fundedRows:
    | ((
        supply: Partial<Record<CommodityType, number>>,
        stateId: string,
        countryId: string
      ) => BuildDemandRow[])
    | null;
  priceDocOf: (commodity: CommodityType) => PriceDocGapSource | undefined;
  isStateScoped: (commodity: CommodityType) => boolean;
}): (commodity: CommodityType, cell: GapCell) => number | null {
  return (commodity, cell) => {
    if (args.fundedRows) {
      const funded = fundedLegUnmetUnits(
        args.fundedRows({ [commodity]: 1 }, cell.stateId, cell.countryId)
      );
      if (funded != null) return funded;
    }
    return priceDocLegUnmetUnits(args.priceDocOf(commodity), cell, args.isStateScoped(commodity));
  };
}
