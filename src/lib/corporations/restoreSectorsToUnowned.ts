import { ObjectId, type Db } from "mongodb";
import type { Corporation, CorporateSector, UnownedSector } from "@/lib/db/types";
import {
  loadFxRatesByCurrency,
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import type { CorporationType } from "@/lib/constants/corporations";
import {
  unownedHeadroomUnitsPerAnchor,
  unownedPoolCreditBaseExpr,
  unownedPoolLeadingField,
  unownedPoolTrailingSet,
} from "@/lib/market/unownedHeadroom";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { revenuePerCapacityUnitForStrategy } from "@/lib/constants/capacityEconomy";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { reserveSectorsForRestore } from "@/lib/corporations/securedConstructionProperty";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

const RESTORE_IDEMPOTENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface RestoreSectorsToUnownedResult {
  sectorsProcessed: number;
  sectorsDeleted: number;
  poolsUpdated: number;
  totalRevenueRestored: number;
}

type RestorableSector = Pick<
  CorporateSector,
  | "_id"
  | "corporationId"
  | "countryId"
  | "stateId"
  | "sectorType"
  | "industryModel"
  | "mediaDiscriminator"
  | "revenue"
  | "constructionFinancing"
  | "constructionPropertyTransition"
> &
  Partial<Pick<CorporateSector, "capitalStock" | "strategyId" | "buildQueue">>;

interface RestorableSectorDelta {
  sectorId: ObjectId;
  stateId: string;
  countryId: CorporateSector["countryId"];
  sectorType: CorporateSector["sectorType"];
  industryModel: CorporateSector["industryModel"];
  mediaDiscriminator: CorporateSector["mediaDiscriminator"];
  revenue: number;
  /** Capacity units returned to the pool (plants only; 0 otherwise). */
  units: number;
}

/**
 * Return deleted corporate-sector revenue to the persistent unowned pool,
 * then remove the original sector rows.
 *
 * Production can reject Mongo multi-document transactions, so this must be
 * safe under retries and duplicate submits: an idempotent per-sector restore
 * token on the destination `unownedSectors` doc makes retry a no-op. Tokens
 * are pruned to a short rolling window so market docs do not grow without
 * bound. Only after the pool is credited do we delete the sector rows, so a
 * crash cannot lose the market.
 *
 * PLANTS RETURNS CAPACITY, NOT FILL-DEPENDENT REVENUE: at marketSystemMode
 * >= "plants", `revenue` is derived (`capitalStock × mixPrice` scaled by
 * cleared fraction and ramp). Returning it would leak market on every
 * abandon (a 40%-utilized plant returns 40% of its market). Under plants we
 * return `capitalStock` priced through the sector's mix into the pool's
 * default-mix units; below plants, legacy ₳ revenue credit.
 */
export async function restoreSectorsToUnowned(
  db: Db,
  sectors: RestorableSector[],
  now: Date
): Promise<RestoreSectorsToUnownedResult> {
  if (sectors.length === 0) {
    return {
      sectorsProcessed: 0,
      sectorsDeleted: 0,
      poolsUpdated: 0,
      totalRevenueRestored: 0,
    };
  }

  const corporationIds = [...new Set(sectors.map((sector) => sector.corporationId.toString()))].map(
    (id) => new ObjectId(id)
  );
  // The pool row carries a countryId that every reader filters on, so it must
  // be the country the state is in, not the sector's last stored value:
  // a stale value would return capacity to a market the country cannot see.
  // Batched alongside the corporation read.
  const [corporations, fxByCurrency, sectorStates] = await Promise.all([
    corporationsCollection(db)
      .find({ _id: { $in: corporationIds } })
      .project<Pick<Corporation, "_id" | "countryId" | "liquidCurrencyCode">>({
        _id: 1,
        countryId: 1,
        liquidCurrencyCode: 1,
      })
      .toArray(),
    loadFxRatesByCurrency(db),
    db
      .collection<{ _id: string; countryId: string }>("states")
      .find({ _id: { $in: [...new Set(sectors.map((sector) => sector.stateId))] } })
      .project<{ _id: string; countryId: string }>({ countryId: 1 })
      .toArray(),
  ]);
  const countryByStateId = new Map(sectorStates.map((state) => [state._id, state.countryId]));
  const corporationById = new Map(
    corporations.map((corporation) => [corporation._id.toString(), corporation])
  );

  const plantsEnabled = marketAtLeast(await getMarketSystemModeForDb(db), "plants");
  const eraUnitScale = await loadWorldEraUnitScale(db);

  const deltas: RestorableSectorDelta[] = [];

  // Secure every row before crediting its market pool. The marker closes the
  // otherwise unsafe interval between a snapshot read and the pool credit:
  // construction claim installation refuses marked rows, and retrying this
  // restore may reacquire its deterministic per-sector token.
  if (!(await reserveSectorsForRestore(db, sectors))) {
    throw new Error("restoreSectorsToUnowned: secured construction property cannot be disposed");
  }

  for (const sector of sectors) {
    const owningCorporation = corporationById.get(sector.corporationId.toString());
    if (!owningCorporation) {
      throw new Error(
        `restoreSectorsToUnowned: missing owning corporation ${sector.corporationId.toString()} for sector ${sector._id.toString()}`
      );
    }

    // Sector revenue is stored in the sector's host-state currency; convert to
    // the ₳-native unowned pool at the host rate, not the owning corp's.
    const revenue = Number.isFinite(sector.revenue)
      ? readCorpEconomicAnchor(
          sector.revenue,
          resolveSectorHostCurrencyCode(sector, owningCorporation),
          fxRateForSectorHostFromMap(sector, owningCorporation, fxByCurrency)
        )
      : 0;
    // Plants: capacity units, routed through the ₳ nameplate so the corp's
    // strategy mix and the pool's default mix stay commensurable (both legs are
    // ₳-native, so no FX enters — unlike the revenue leg above).
    const stock =
      typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
        ? Math.max(0, sector.capitalStock)
        : 0;
    // Undelivered build orders count too. Founding DRAWS the starter units out
    // of the pool but delivers them through `buildQueue` (`capitalStock` starts
    // at 0), so a sector that leaves during its build window would otherwise
    // return only its built capacity — nothing — while the pool keeps the hole.
    // Found-then-abandon inside the build window would permanently shrink that
    // market and ratchet share toward incumbents, which is exactly the leak the
    // founding drawdown was added to close, running in the other direction.
    //
    // Headroom returns in FULL here even when the cash refund is partial (0.75
    // on abandon) or zero (dissolution forfeits). Headroom is unmet demand, not
    // money: the demand did not stop existing because the builder walked away.
    const queuedUnits = plantsEnabled
      ? (Array.isArray(sector.buildQueue) ? sector.buildQueue : []).reduce(
          (sum, order) =>
            sum +
            (order != null && Number.isFinite(order.unitsOrdered) && order.unitsOrdered > 0
              ? order.unitsOrdered
              : 0),
          0
        )
      : 0;
    const units = plantsEnabled
      ? (stock + queuedUnits) *
        revenuePerCapacityUnitForStrategy(
          sector.sectorType as CorporationType,
          sector.strategyId,
          eraUnitScale,
          sector.industryModel,
          sector.mediaDiscriminator
        ) *
        unownedHeadroomUnitsPerAnchor(
          sector.sectorType as CorporationType,
          eraUnitScale,
          sector.industryModel,
          sector.mediaDiscriminator
        )
      : 0;

    if (plantsEnabled ? units > 0 : revenue > 0) {
      deltas.push({
        sectorId: sector._id,
        countryId: (countryByStateId.get(sector.stateId) ??
          sector.countryId) as RestorableSectorDelta["countryId"],
        stateId: sector.stateId,
        sectorType: sector.sectorType,
        industryModel: sector.industryModel,
        mediaDiscriminator: sector.mediaDiscriminator,
        revenue,
        units,
      });
    }
  }

  const updatedPools = new Set<string>();
  let totalRevenueRestored = 0;
  const retryWindowStart = new Date(now.getTime() - RESTORE_IDEMPOTENCY_WINDOW_MS);

  for (const delta of deltas) {
    const restoreToken = delta.sectorId.toString();
    const unitsPerAnchor = unownedHeadroomUnitsPerAnchor(
      delta.sectorType as CorporationType,
      eraUnitScale,
      delta.industryModel,
      delta.mediaDiscriminator
    );
    const anchorPerUnit = unitsPerAnchor > 0 ? 1 / unitsPerAnchor : 0;
    const creditField = unownedPoolLeadingField(plantsEnabled);
    const creditAmount = plantsEnabled ? delta.units : delta.revenue;
    // Base to add onto: the field's own value, healing a pre-backfill doc that
    // has revenue but no units.
    const creditBaseExpr = unownedPoolCreditBaseExpr(
      delta.sectorType as CorporationType,
      plantsEnabled,
      eraUnitScale,
      delta.industryModel
    );
    const before = await db.collection<UnownedSector>("unownedSectors").findOneAndUpdate(
      {
        stateId: delta.stateId,
        sectorType: delta.sectorType,
        ...(delta.industryModel != null || delta.sectorType === "manufacturing"
          ? { industryModel: delta.industryModel ?? null }
          : {}),
        mediaDiscriminator: delta.mediaDiscriminator ?? null,
      },
      [
        {
          $set: {
            stateId: { $ifNull: ["$stateId", delta.stateId] },
            countryId: { $ifNull: ["$countryId", delta.countryId] },
            sectorType: { $ifNull: ["$sectorType", delta.sectorType] },
            ...(delta.industryModel != null || delta.sectorType === "manufacturing"
              ? { industryModel: { $ifNull: ["$industryModel", delta.industryModel ?? null] } }
              : {}),
            mediaDiscriminator: {
              $ifNull: ["$mediaDiscriminator", delta.mediaDiscriminator ?? null],
            },
            createdAt: { $ifNull: ["$createdAt", now] },
            updatedAt: now,
            // The credited field is the AUTHORITATIVE one for the tier:
            // `headroomUnits` under plants, `revenue` below it. The idempotency
            // token guards whichever it is, identically.
            [creditField]: {
              $let: {
                vars: {
                  currentValue: creditBaseExpr,
                  recentRestores: {
                    $filter: {
                      input: { $ifNull: ["$recentCorporateSectorRestores", []] },
                      as: "restore",
                      cond: {
                        $or: [
                          { $eq: ["$$restore.pendingSourceDelete", true] },
                          { $gte: ["$$restore.restoredAt", retryWindowStart] },
                        ],
                      },
                    },
                  },
                },
                in: {
                  $let: {
                    vars: {
                      recentRestoreIds: {
                        $map: {
                          input: "$$recentRestores",
                          as: "restore",
                          in: "$$restore.sectorId",
                        },
                      },
                    },
                    in: {
                      $cond: [
                        { $in: [restoreToken, "$$recentRestoreIds"] },
                        "$$currentValue",
                        { $add: ["$$currentValue", creditAmount] },
                      ],
                    },
                  },
                },
              },
            },
            recentCorporateSectorRestores: {
              $let: {
                vars: {
                  recentRestores: {
                    $filter: {
                      input: { $ifNull: ["$recentCorporateSectorRestores", []] },
                      as: "restore",
                      cond: {
                        $or: [
                          { $eq: ["$$restore.pendingSourceDelete", true] },
                          { $gte: ["$$restore.restoredAt", retryWindowStart] },
                        ],
                      },
                    },
                  },
                },
                in: {
                  $let: {
                    vars: {
                      recentRestoreIds: {
                        $map: {
                          input: "$$recentRestores",
                          as: "restore",
                          in: "$$restore.sectorId",
                        },
                      },
                    },
                    in: {
                      $cond: [
                        { $in: [restoreToken, "$$recentRestoreIds"] },
                        "$$recentRestores",
                        {
                          $concatArrays: [
                            "$$recentRestores",
                            [{ sectorId: restoreToken, restoredAt: now }],
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        {
          // Second stage so it sees the total the stage above settled on (a
          // no-op when the idempotency token already fired). The DERIVED field
          // is always recomputed from the authoritative total rather than
          // incremented, so a doc predating the `headroomUnits` backfill heals
          // instead of accumulating from a missing base. `impliedOutputUnits`
          // is strictly linear, so the two directions are exact inverses.
          $set: unownedPoolTrailingSet(
            delta.sectorType as CorporationType,
            plantsEnabled,
            eraUnitScale,
            delta.industryModel,
            delta.mediaDiscriminator
          ),
        },
      ],
      { upsert: true, returnDocument: "before" }
    );

    const alreadyRestored =
      before?.recentCorporateSectorRestores?.some(
        (restore) =>
          restore.sectorId === restoreToken &&
          (restore.pendingSourceDelete === true ||
            restore.restoredAt.getTime() >= retryWindowStart.getTime())
      ) ?? false;
    if (!alreadyRestored) {
      // Under plants the ₳ figure callers report is the NAMEPLATE value of the
      // capacity handed back, not the sector's last realized revenue.
      totalRevenueRestored += plantsEnabled ? delta.units * anchorPerUnit : delta.revenue;
      updatedPools.add(`${delta.stateId}:${delta.sectorType}`);
    }
  }

  const sectorIds = sectors.map((sector) => sector._id);
  const deleteResult = await db.collection<CorporateSector>("corporateSectors").deleteMany({
    _id: { $in: sectorIds },
    "constructionPropertyTransition.kind": "restore",
  });
  if (deleteResult.deletedCount !== sectorIds.length) {
    const remaining = await db
      .collection<CorporateSector>("corporateSectors")
      .countDocuments({ _id: { $in: sectorIds } });
    if (remaining > 0) {
      throw new Error(
        `restoreSectorsToUnowned: expected to delete ${sectorIds.length} sectors, deleted ${deleteResult.deletedCount}, remaining ${remaining}`
      );
    }
  }

  return {
    sectorsProcessed: sectors.length,
    sectorsDeleted: sectorIds.length,
    poolsUpdated: updatedPools.size,
    totalRevenueRestored,
  };
}
