import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { applyFacilityLoss } from "@/lib/market/brandLoyalty";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { loadValuationFxRates } from "@/lib/currency/corporationCapital";
import { sectorMoneyAnchor } from "@/lib/corporations/sectorRevenueScale";

/** A sector being lost: its stored revenue is in its host country's currency. */
export type LostSector = Pick<CorporateSector, "revenue"> & { countryId?: string | null };

/**
 * Brand facility-loss hook (the "Boeing rule", Package A). Losing a sector —
 * to a sale, a hostile takeover, closure, or nationalization — dents the
 * corp's brand proportional to how big that sector was for it. Losing your
 * flagship plant costs more reputation than shedding a rounding-error outpost.
 *
 * Pure math lives in {@link applyFacilityLoss}; this wrapper resolves the
 * sector's share of the corp's total revenue and persists the new loyalty.
 * A no-op when the corp has no loyalty yet (feature off / never accrued), so
 * it is safe to call unconditionally from any removal path.
 *
 * NOTE: call this BEFORE the sector docs are deleted/reassigned. Revenue is
 * compared in ₳ because the corp's sites are stored in different host currencies.
 */
export async function applyBrandFacilityLoss(
  db: Db,
  corpId: ObjectId,
  lostSectors: readonly LostSector[]
): Promise<void> {
  const corp = await corporationsCollection(db).findOne(
    { _id: corpId },
    { projection: { brandLoyalty: 1, countryId: 1, liquidCurrencyCode: 1 } }
  );
  const loyalty = corp?.brandLoyalty ?? 0;
  if (loyalty <= 0) return; // nothing to lose

  const fx = await loadValuationFxRates(db);
  const lostRevenue = lostSectors.reduce(
    (sum, s) => sum + sectorMoneyAnchor(s.revenue ?? 0, s, corp, fx),
    0
  );
  if (!(lostRevenue > 0)) return;

  const agg = await corporateSectorsCollection(db)
    .aggregate<{ _id: string | null; total: number }>([
      { $match: { corporationId: corpId } },
      { $group: { _id: "$countryId", total: { $sum: "$revenue" } } },
    ])
    .toArray();
  const remainingRevenue = agg.reduce(
    (sum, row) => sum + sectorMoneyAnchor(row.total, { countryId: row._id }, corp, fx),
    0
  );
  // Robust to call order: if the aggregate already includes the lost sector
  // (called BEFORE removal), remainingRevenue >= lostRevenue and is the
  // pre-loss total; if the sector was already removed, add it back.
  const denom = remainingRevenue >= lostRevenue ? remainingRevenue : remainingRevenue + lostRevenue;
  if (!(denom > 0)) return;

  const share = Math.min(1, lostRevenue / denom);
  const next = applyFacilityLoss(loyalty, share);
  if (next === loyalty) return;
  await corporationsCollection(db).updateOne(
    { _id: corpId },
    { $set: { brandLoyalty: Math.round(next * 100) / 100 } }
  );
}
