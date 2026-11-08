import type { Db, ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import type { CorporationType } from "@/lib/constants/corporations";
import {
  capacityRescaleRatio,
  rescaleBuildQueueForStrategyChange,
} from "@/lib/constants/capacityEconomy";
import type { SectorBuildOrder } from "@/lib/db/types";
import { mergeSectorPlantFields } from "@/lib/corporations/sectorTransferCapex";
import {
  hasProtectedConstructionProperty,
  unprotectedConstructionPropertyFilter,
} from "@/lib/corporations/securedConstructionProperty";
import {
  mergeSurvivorConstructionFilter,
  type ConstructionBorrowerTransferPlan,
} from "@/lib/banking/constructionBorrowerTransfer";

/**
 * Move one operating sector to `destCorpId`, re-denominating its revenue and
 * growth cost from the source corp's home currency to the destination's
 * (sector economic fields are stored in the owner's currency).
 *
 * Respects the unique (corporationId, stateId, sectorType) index: if the
 * destination already operates that (state, type), the donor is merged in
 * (capacity folded, donor row dropped); otherwise it is re-parented. No
 * haircut, since this is a consensual transfer, not a taking.
 *
 * A financed site moves only under `constructionTransfers`: the title write
 * names the new borrower in the same update; caller settles the plan after.
 * A financed site never merges into another row.
 */
export async function moveSectorToCorp(
  db: Db,
  sector: CorporateSector,
  destCorpId: ObjectId,
  srcCurrency: CurrencyCode | string | undefined,
  srcFxRate: number,
  destCurrency: CurrencyCode | string | undefined,
  destFxRate: number,
  now: Date,
  constructionTransfers?: ConstructionBorrowerTransferPlan
): Promise<void> {
  const financedMove = constructionTransfers?.hasTransfer(sector._id) === true;
  if (hasProtectedConstructionProperty(sector) && !financedMove) {
    throw new Error("A sector with secured construction cannot change ownership yet");
  }
  const sectors = db.collection<CorporateSector>("corporateSectors");
  const revenueAnchor = readCorpEconomicAnchor(sector.revenue ?? 0, srcCurrency, srcFxRate);
  const growthCostAnchor = readCorpEconomicAnchor(
    sector.currentGrowthCost ?? 0,
    srcCurrency,
    srcFxRate
  );
  const newRevenue = Math.round(writeCorpEconomicLocal(revenueAnchor, destCurrency, destFxRate));
  const newGrowthCost = Math.round(
    writeCorpEconomicLocal(growthCostAnchor, destCurrency, destFxRate)
  );

  const existing = await sectors.findOne({
    corporationId: destCorpId,
    stateId: sector.stateId,
    sectorType: sector.sectorType,
    industryModel: sector.industryModel ?? null,
    mediaDiscriminator: sector.mediaDiscriminator ?? null,
  });

  // Under plants, `revenue` is restated from `capitalStock × mixPrice` by the
  // turn processor every turn, so it is a DERIVED field on both sides of this
  // move. Merging it would double-count the donor's capacity for one turn
  // (capacity folded in AND revenue added on top) before being overwritten, and
  // re-denominating it on the re-parent branch buys nothing — the restatement
  // writes it in the sector's HOST currency next tick regardless of who owns
  // the row. So under plants the quantity that moves is capacity: `capitalStock`
  // (nameplate-invariant across a strategy difference, D9) and the in-flight
  // `buildQueue` (units rescaled by the same ratio). The turn derives CIP from
  // the queue as its single writer.
  const plantsEnabled = marketAtLeast(await getMarketSystemModeForDb(db), "plants");

  if (existing && !existing._id.equals(sector._id)) {
    if (financedMove || hasProtectedConstructionProperty(sector)) {
      throw new Error("A site with a construction loan cannot be merged into another site");
    }
    if (existing.constructionPropertyTransition) {
      throw new Error("The destination sector is in another ownership change");
    }
    const survivorFilter = mergeSurvivorConstructionFilter(existing);
    if (plantsEnabled) {
      const ratio = capacityRescaleRatio(
        sector.sectorType as CorporationType,
        sector.strategyId,
        existing.strategyId,
        sector.industryModel,
        sector.mediaDiscriminator
      );
      const donorStock =
        typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
          ? Math.max(0, sector.capitalStock)
          : 0;
      const donorQueue: SectorBuildOrder[] = Array.isArray(sector.buildQueue)
        ? rescaleBuildQueueForStrategyChange(sector.buildQueue, ratio)
        : [];
      // The strategy-ratio rescale is the only thing special about this merge path;
      // everything after is the shared fold. Do not hand-roll the fold: the shared
      // fold re-sorts the merged queue by `onlineTurn` (the turn processor's due scan
      // depends on it), takes the earlier `plantsStartTurn`, and merges `mothballed`.
      // `costPaidAnchor` is cash ALREADY SPENT and is deliberately not rescaled by the
      // strategy ratio (same rule as the retool path); CIP and cancellation refund
      // must report what was actually paid.
      const merged = mergeSectorPlantFields(
        {
          sectorType: existing.sectorType,
          industryModel: existing.industryModel,
          mediaDiscriminator: existing.mediaDiscriminator,
          capitalStock: existing.capitalStock,
          buildQueue: existing.buildQueue,
          mothballed: existing.mothballed,
          activeCapacityPercent: existing.activeCapacityPercent,
          plantsStartTurn: existing.plantsStartTurn,
          legacyRevenueShadow: existing.legacyRevenueShadow,
          inventoryUnits: existing.inventoryUnits,
          inventoryValueAnchor: existing.inventoryValueAnchor,
        },
        {
          sectorType: sector.sectorType,
          industryModel: sector.industryModel,
          mediaDiscriminator: sector.mediaDiscriminator,
          capitalStock: Math.round(donorStock * ratio * 100) / 100,
          buildQueue: donorQueue,
          mothballed: sector.mothballed,
          activeCapacityPercent: sector.activeCapacityPercent,
          plantsStartTurn: sector.plantsStartTurn,
          legacyRevenueShadow: sector.legacyRevenueShadow,
          // Goods, not capacity: the strategy ratio does not rescale a pile.
          inventoryUnits: sector.inventoryUnits,
          inventoryValueAnchor: sector.inventoryValueAnchor,
        }
      );
      const mergedSurvivor = await sectors.updateOne(
        { _id: existing._id, ...survivorFilter },
        {
          // Workers are recomputed from capacity next turn under plants, so the
          // headcount merge is informational only — kept so the row is not
          // visibly wrong between now and the next tick.
          $inc: {
            workers: sector.workers ?? 0,
            currentGrowthCost: newGrowthCost,
          },
          $set: {
            ...merged,
            updatedAt: now,
          },
        }
      );
      if (mergedSurvivor.matchedCount !== 1)
        throw new Error(
          "The destination sector became secured before the ownership merge completed"
        );
      const removed = await sectors.deleteOne({
        _id: sector._id,
        ...unprotectedConstructionPropertyFilter(),
      });
      if (removed.deletedCount !== 1)
        throw new Error("The source sector became secured before the ownership merge completed");
      return;
    }
    const mergedSurvivor = await sectors.updateOne(
      { _id: existing._id, ...survivorFilter },
      {
        $inc: {
          // PLANTS-GATED: unreachable under plants — the branch above returns
          // first. Below plants the nameplate IS the state, so it merges.
          revenue: newRevenue,
          workers: sector.workers ?? 0,
          currentGrowthCost: newGrowthCost,
        },
        $set: { updatedAt: now },
      }
    );
    if (mergedSurvivor.matchedCount !== 1)
      throw new Error("The destination sector became secured before the ownership merge completed");
    const removed = await sectors.deleteOne({
      _id: sector._id,
      ...unprotectedConstructionPropertyFilter(),
    });
    if (removed.deletedCount !== 1)
      throw new Error("The source sector became secured before the ownership merge completed");
  } else {
    const moved = await sectors.updateOne(
      {
        _id: sector._id,
        ...(constructionTransfers
          ? constructionTransfers.filterFor(sector)
          : unprotectedConstructionPropertyFilter()),
      },
      {
        $set: {
          corporationId: destCorpId,
          ...constructionTransfers?.setFor(sector._id),
          ...(plantsEnabled ? {} : { revenue: newRevenue }),
          currentGrowthCost: newGrowthCost,
          updatedAt: now,
        },
        $unset: { forSale: "" },
      }
    );
    if (moved.matchedCount !== 1)
      throw new Error("The sector became secured before its ownership transfer completed");
  }
}
