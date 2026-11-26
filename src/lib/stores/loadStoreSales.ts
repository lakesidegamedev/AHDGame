/** Latest store sales the funded turn recorded, for NPP founding and the market and store screens. */
import type { CollectionSource } from "@/lib/db/repositories/source";
import { producerMarketOutcomesCollection } from "@/lib/db/repositories/producerMarketOutcomes";
import type { StoreSales } from "@/lib/market/producerMarket/storeSalesRules";
import {
  householdChannelTotals,
  storeRoutedShare,
  type HouseholdChannelTotals,
} from "@/lib/stores/rules/storeRules";

export async function loadLatestStoreSales(
  db: CollectionSource,
  worldEpoch: string,
  turn: number
): Promise<{ turn: number; sales: StoreSales } | null> {
  const doc = (
    await producerMarketOutcomesCollection<{ turn: number; storeSales?: StoreSales }>(db)
      .find(
        { worldEpoch, turn: { $lte: turn }, storeSales: { $exists: true } },
        { projection: { turn: 1, storeSales: 1 } }
      )
      .sort({ turn: -1 })
      .limit(1)
      .toArray()
  )[0];
  return doc?.storeSales ? { turn: doc.turn, sales: doc.storeSales } : null;
}

/** Household purchases of one good, through stores and direct, from the latest settled turn. */
export async function loadHouseholdChannel(
  db: CollectionSource,
  worldEpoch: string | null | undefined,
  turn: number | null | undefined,
  commodity: string
): Promise<(HouseholdChannelTotals & { turn: number }) | null> {
  if (!worldEpoch || typeof turn !== "number" || storeRoutedShare(commodity) <= 0) return null;
  const latest = await loadLatestStoreSales(db, worldEpoch, turn);
  if (!latest) return null;
  const totals = householdChannelTotals(latest.sales.channels, commodity, latest.sales.markup);
  return totals ? { ...totals, turn: latest.turn } : null;
}
