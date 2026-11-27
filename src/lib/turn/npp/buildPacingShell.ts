/**
 * Shell for rules/buildPacing: reads last turn's price snapshot once, and
 * answers whether a lane's price signal has persisted and how much new
 * capacity the pass may still grant a cell.
 */
import type { Db } from "mongodb";
import { getStrategy } from "@/lib/constants/sectorStrategies";
import type { CommodityType } from "@/lib/constants/commodities";
import { foundingStarterUnits } from "@/lib/corporations/foundingPlant";
import type { CorporationType } from "@/lib/constants/corporations";
import { commodityPriceHistoryCollection } from "@/lib/db/repositories/commodityPriceHistory";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { paceRoomUnits, priceSignalPersisted } from "@/lib/turn/npp/rules/buildPacing";

export interface PricedCommodityLike {
  commodity: CommodityType;
  basePrice?: number;
  turn?: number;
  statePrices?: Record<string, number> | null;
  nationalPrices?: Record<string, number> | null;
}

type PriorSnapshots = ReadonlyMap<
  string,
  Pick<PricedCommodityLike, "statePrices" | "nationalPrices">
>;

interface PaceCell {
  stateId: string;
  countryId: string;
  sectorType: string;
  /** Extraction recipe, so a mine's pace reads its own resource's gap. */
  strategyId?: string | null;
}

/** The snapshot one turn before the loaded price books; empty when none exists. */
export async function loadPriorPriceSnapshots(
  db: Db,
  priceDocs: readonly PricedCommodityLike[]
): Promise<PriorSnapshots> {
  let priceTurn = Number.NEGATIVE_INFINITY;
  for (const doc of priceDocs) {
    if (typeof doc.turn === "number" && Number.isFinite(doc.turn)) {
      priceTurn = Math.max(priceTurn, doc.turn);
    }
  }
  if (!Number.isFinite(priceTurn)) return new Map();
  const rows = await commodityPriceHistoryCollection(db)
    .find(
      { turn: priceTurn - 1 },
      { projection: { commodity: 1, statePrices: 1, nationalPrices: 1 } }
    )
    .toArray();
  return new Map(rows.map((row) => [row.commodity, row]));
}

function priceOf(
  book: Pick<PricedCommodityLike, "statePrices" | "nationalPrices"> | undefined,
  commodity: CommodityType,
  cell: PaceCell
): number | null {
  if (!book) return null;
  const state = isStateScopedCommodity(commodity) ? book.statePrices?.[cell.stateId] : undefined;
  const value = state ?? book.nationalPrices?.[cell.countryId];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Persisted-price test over the loaded books and the prior snapshot. */
export function createPricePersistence(
  current: ReadonlyMap<string, PricedCommodityLike>,
  prior: PriorSnapshots
): (cell: PaceCell, options?: { strategyId?: string | null }) => boolean {
  return (cell, options) => {
    const mix = getStrategy(cell.sectorType, options?.strategyId ?? "").supply;
    const legs: [number | null, number | null][] = [];
    for (const [commodity, rate] of Object.entries(mix) as [CommodityType, number][]) {
      if (!(rate > 0)) continue;
      const doc = current.get(commodity);
      const base = doc?.basePrice;
      if (!doc || !base) continue;
      const now = priceOf(doc, commodity, cell);
      const before = priceOf(prior.get(commodity), commodity, cell);
      legs.push([now == null ? null : now / base, before == null ? null : before / base]);
    }
    return priceSignalPersisted(legs);
  };
}

/**
 * Ledger of capacity granted this pass, and the room left in a cell. A cell
 * shares its grants with the gap it is measured against (`gapKey`). The gap is
 * read net of the capacity under construction when the pass started
 * (`inFlightOf`); grants made during the pass are counted here instead.
 */
export function createPaceLedger(keys: {
  gapKeyOf: (cell: PaceCell) => string;
  grossUnmetOf: (
    cell: PaceCell,
    options?: { strategyId?: string | null; aggregate?: "mean" | "max" }
  ) => number | null;
  /** Undelivered queued capacity against a gap when the pass started. */
  inFlightOf?: (gapKey: string) => number;
}) {
  const byGap = new Map<string, number>();
  return {
    grant(cell: PaceCell, units: number) {
      if (!Number.isFinite(units) || units <= 0) return;
      byGap.set(keys.gapKeyOf(cell), (byGap.get(keys.gapKeyOf(cell)) ?? 0) + units);
    },
    roomOf(
      cell: PaceCell,
      pending: readonly (PaceCell & { units: number })[],
      options?: { strategyId?: string | null; aggregate?: "mean" | "max" }
    ): number {
      const gapKey = keys.gapKeyOf({ ...cell, strategyId: options?.strategyId ?? cell.strategyId });
      let pendingGap = 0;
      for (const claim of pending) {
        if (!(claim.units > 0)) continue;
        if (keys.gapKeyOf(claim) === gapKey) pendingGap += claim.units;
      }
      const gross = keys.grossUnmetOf(cell, options);
      const inFlight = keys.inFlightOf?.(gapKey) ?? 0;
      const starter = foundingStarterUnits(cell.sectorType as CorporationType);
      return paceRoomUnits({
        netUnmetUnits:
          gross == null || !Number.isFinite(gross)
            ? null
            : Math.max(0, gross - (Number.isFinite(inFlight) ? Math.max(0, inFlight) : 0)),
        grantedAgainstGapUnits: (byGap.get(gapKey) ?? 0) + pendingGap,
        plantUnits: starter,
      });
    },
  };
}
