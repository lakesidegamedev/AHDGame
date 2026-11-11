import type { Db } from "mongodb";
import { applyPlantChange } from "@/lib/corporations/wholePlants/rules";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector, UnownedSector } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import {
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import {
  bucketKey,
  computeStateControlledBuckets,
} from "@/lib/nationalization/stateControlledBuckets";
import type { CorporationType, OperatingSectorType } from "@/lib/constants/corporations";
import { revenuePerCapacityUnitForStrategy } from "@/lib/constants/capacityEconomy";
import {
  unownedHeadroomUnitsPerAnchor,
  unownedPoolCreditBaseExpr,
  unownedPoolTrailingSet,
} from "@/lib/market/unownedHeadroom";
import type { CorporationLookups } from "./types";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import type { Document } from "mongodb";

// PLANTS-GATED: under plants the shed moves `capitalStock` units into the
// unowned pool's `headroomUnits`; the revenue writes below run only below the
// plants tier. Corp units and pool units are converted through the ₳ nameplate
// because each is priced at its own mix.
export interface SectorShedResult {
  corporateSectorsUpdated: number;
  unownedSectorsUpdated: number;
  totalRevenueShed: number;
  /**
   * Capacity units shed to the unowned headroom pool. Always 0 below the
   * plants tier, where the shed moves ₳ revenue instead.
   */
  totalCapacityUnitsShed?: number;
}

/**
 * Sheds `rate` of each sector's revenue + workers from the given corps to the
 * unowned-sector pool. Mutates `lookups.sectorsByCorp` entries in place so any
 * downstream turn-step in the same pipeline sees the reduced values.
 *
 * Caller must filter `sheddingCorps` to the right candidate set. `reasonLabel`
 * appears in the diagnostic log (e.g. "Vacant CEO" or "Inactive CEO").
 *
 * ─── UNDER PLANTS THIS SHEDS CAPACITY, NOT REVENUE ────────────────────────
 * At `marketSystemMode >= "plants"` the turn processor restates
 * `sector.revenue` from `capitalStock × mixPrice` every turn, so a revenue
 * `$inc` is undone next tick: the corp keeps its capacity while the pool is
 * credited anyway, minting market-share per turn. Under plants the shed
 * instead removes `rate × capitalStock` plant from the corp and credits the
 * same demand-side headroom to the pool, never touching revenue.
 */
export async function shedSectorsForCorps(
  db: Db,
  lookups: CorporationLookups,
  sheddingCorps: Corporation[],
  rate: number,
  now: Date,
  reasonLabel: string,
  /** `marketSystemMode >= "plants"`. Defaults false — legacy revenue shed. */
  plantsEnabled: boolean = false
): Promise<SectorShedResult> {
  if (sheddingCorps.length === 0) {
    return {
      corporateSectorsUpdated: 0,
      unownedSectorsUpdated: 0,
      totalRevenueShed: 0,
      totalCapacityUnitsShed: 0,
    };
  }

  for (const c of sheddingCorps) {
    console.log(
      `[Turn] ${reasonLabel} shed: corp ${c.name ?? c._id} — ceoId=${c.ceoId ?? "null"}, ceoVacant=${c.ceoVacant}, isNationalized=${c.isNationalized}, countryOwnerId=${c.countryOwnerId ?? "null"}`
    );
  }

  const sheddingIds = new Set(sheddingCorps.map((c) => c._id.toString()));

  // Don't re-seed unowned market in a sector the state has nationalized — a private
  // holder that shed capacity there would otherwise spawn an unowned pool that
  // re-fragments the state monopoly (the shed still shrinks the corp; the freed
  // capacity simply isn't released back to the market in a nationalized bucket).
  const nationalCorpIds = new Set(
    lookups.corporations.filter((c) => c.countryOwnerId != null).map((c) => c._id.toString())
  );
  const stateControlled = computeStateControlledBuckets(
    [...lookups.sectorsByCorp.values()].flat(),
    nationalCorpIds
  );

  const unownedDeltas = new Map<
    string,
    {
      stateId: string;
      sectorType: string;
      industryModel: string | null;
      mediaDiscriminator: CorporateSector["mediaDiscriminator"];
      countryId: CountryId;
      revenue: number;
      /** Capacity units freed to the pool (plants only; 0 otherwise). */
      units: number;
    }
  >();

  const sectorOps: {
    updateOne: {
      filter: { _id: ObjectId };
      update: {
        $inc: { revenue?: number; workers: number; capitalStock?: number };
        $set: { updatedAt: Date; capacityBookAnchor?: number };
      };
    };
  }[] = [];

  let totalRevenueShed = 0;
  let totalCapacityUnitsShed = 0;

  for (const cid of sheddingIds) {
    for (const s of lookups.sectorsByCorp.get(cid) ?? []) {
      const rev = Math.max(0, s.revenue ?? 0);
      const workers = Math.max(0, s.workers ?? 0);
      let shedRev = Math.round(rev * rate);
      let shedWorkers = Math.round(workers * rate);
      shedRev = Math.min(shedRev, rev);
      shedWorkers = Math.min(shedWorkers, workers);

      if (plantsEnabled) {
        // FLIP TURN: capacity shed is DEFERRED one turn. Until sectorTurn stamps
        // plantsStartTurn and makes capitalStock authoritative, shedding is unsound:
        // capitalStock may read 0 (shed silently drops stock but still removes workers),
        // or the flip adoption would restore the pre-shed capacity and mint market
        // share globally. One turn of attrition preserves conservation.
        const plantsCapacityEstablished = s.plantsStartTurn != null;
        // Capacity is the quantity; revenue is derived and must not be touched.
        const stock =
          typeof s.capitalStock === "number" && Number.isFinite(s.capitalStock)
            ? Math.max(0, s.capitalStock)
            : 0;
        // Round ONCE, here, and use the same number for the in-memory mutation,
        // the pool credit and the persisted `$inc`. If they disagree,
        // `processSectors` derives revenue from a `capitalStock` that differs
        // from what was written, and the gap compounds turn over turn.
        //
        // On the flip turn this is ZERO rather than a skipped iteration: `stock`
        // keeps the doc's real value, so the mutation and `$inc` are no-ops on
        // capacity (they must not write 0 over a real stock) while the WORKER
        // shed still runs.
        const continuousShedUnits = plantsCapacityEstablished
          ? Math.round(Math.min(stock, stock * rate) * 100) / 100
          : 0;
        // Whole plants: the shed is wear. A whole plant leaves when the wear
        // reaches one plant, and the last plant stays.
        const wholeShed =
          lookups.wholePlantsOn === true && plantsCapacityEstablished && stock > 0
            ? applyPlantChange(
                {
                  capitalStock: stock,
                  plantUnitRemainder: s.plantUnitRemainder,
                  plantWearUnits: s.plantWearUnits,
                },
                plantSizeForSector(s),
                { lossUnits: continuousShedUnits }
              )
            : null;
        const shedUnits = wholeShed
          ? Math.max(0, stock - wholeShed.capitalStock)
          : continuousShedUnits;
        if (shedUnits <= 0 && shedWorkers <= 0 && !wholeShed) continue;

        totalCapacityUnitsShed += shedUnits;
        // P5: the paid basis leaves with the plant, pro-rata. Written as an
        // absolute `$set` rather than an `$inc` on purpose — a row that has no
        // recorded basis yet must keep taking the list-price FALLBACK, and an
        // `$inc` would materialise the field at a negative number and book the
        // whole sector at zero. Only a sector that already carries a basis is
        // touched; the rest are corrected by `sectorTurn` on the same turn.
        const remainingFraction = wholeShed
          ? wholeShed.bookRetention
          : stock > 0
            ? Math.max(0, stock - shedUnits) / stock
            : 1;
        const priorBook =
          typeof s.capacityBookAnchor === "number" &&
          Number.isFinite(s.capacityBookAnchor) &&
          s.capacityBookAnchor >= 0
            ? s.capacityBookAnchor
            : null;
        const nextBook = priorBook != null ? priorBook * remainingFraction : null;

        s.capitalStock = wholeShed ? wholeShed.capitalStock : stock - shedUnits;
        const plantLedger = wholeShed
          ? {
              plantCount: wholeShed.plantCount,
              plantUnitRemainder: wholeShed.plantUnitRemainder,
              plantWearUnits: wholeShed.plantWearUnits,
            }
          : seedPlantLedger(s, s.capitalStock);
        s.workers = workers - shedWorkers;
        if (nextBook != null) s.capacityBookAnchor = nextBook;
        s.updatedAt = now;

        sectorOps.push({
          updateOne: {
            filter: { _id: s._id },
            update: {
              $inc: {
                capitalStock: wholeShed ? wholeShed.capitalStock - stock : -shedUnits,
                workers: -shedWorkers,
              },
              $set: {
                updatedAt: now,
                ...plantLedger,
                ...(nextBook != null ? { capacityBookAnchor: nextBook } : {}),
              },
            },
          },
        });

        if (
          shedUnits > 0 &&
          !stateControlled.has(
            bucketKey(s.stateId, s.sectorType, s.industryModel, s.mediaDiscriminator)
          )
        ) {
          // Corp units and pool units are BOTH "output units/day", but each is
          // priced by its own mix: the corp's at its live `strategyId`, the pool
          // at the sector type's default mix (unowned docs carry no strategy).
          // Route through the ₳ nameplate so the two are commensurable — the
          // same round trip `impliedOutputUnits` performs, and currency-free on
          // both legs (RPU and the base prices are ₳-native, so no FX enters).
          const nameplateAnchor =
            shedUnits *
            revenuePerCapacityUnitForStrategy(
              s.sectorType as CorporationType,
              s.strategyId,
              lookups.eraUnitScale,
              s.industryModel,
              s.mediaDiscriminator
            );
          const poolUnits =
            nameplateAnchor *
            unownedHeadroomUnitsPerAnchor(
              s.sectorType as CorporationType,
              lookups.eraUnitScale,
              s.industryModel,
              s.mediaDiscriminator
            );
          const industryModel = s.industryModel ?? null;
          const mediaDiscriminator = s.mediaDiscriminator ?? null;
          const key = `${s.stateId}\0${s.sectorType}\0${industryModel ?? ""}\0${mediaDiscriminator ?? ""}`;
          // Host country, not a hardcoded one: the pool row this creates carries
          // a countryId every reader filters on (ticket #1271).
          const countryId = (lookups.stateCountryMap.get(s.stateId) ?? s.countryId) as CountryId;
          const prev = unownedDeltas.get(key);
          if (prev) prev.units += poolUnits;
          else
            unownedDeltas.set(key, {
              stateId: s.stateId,
              sectorType: s.sectorType,
              industryModel,
              mediaDiscriminator,
              countryId,
              revenue: 0,
              units: poolUnits,
            });
        }
        continue;
      }

      if (shedRev <= 0 && shedWorkers <= 0) continue;

      totalRevenueShed += shedRev;
      s.revenue = rev - shedRev;
      s.workers = workers - shedWorkers;
      s.updatedAt = now;

      sectorOps.push({
        updateOne: {
          filter: { _id: s._id },
          update: {
            $inc: { revenue: -shedRev, workers: -shedWorkers },
            $set: { updatedAt: now },
          },
        },
      });

      if (
        shedRev > 0 &&
        !stateControlled.has(
          bucketKey(s.stateId, s.sectorType, s.industryModel, s.mediaDiscriminator)
        )
      ) {
        // shedRev is in the sector's host-state currency; convert to the
        // ₳-native unowned pool at the host rate, not the owning corp's.
        const shedRevAnchor = readCorpEconomicAnchor(
          shedRev,
          resolveSectorHostCurrencyCode(s, null),
          fxRateForSectorHostFromMap(s, null, lookups.exchangeRatesByCurrency)
        );
        const industryModel = s.industryModel ?? null;
        const mediaDiscriminator = s.mediaDiscriminator ?? null;
        const key = `${s.stateId}\0${s.sectorType}\0${industryModel ?? ""}\0${mediaDiscriminator ?? ""}`;
        // The pool row this shed creates carries a countryId every reader filters
        // on, so use the country the STATE is in, never a hardcoded one.
        const countryId = (lookups.stateCountryMap.get(s.stateId) ?? s.countryId) as CountryId;
        const prev = unownedDeltas.get(key);
        if (prev) prev.revenue += shedRevAnchor;
        else
          unownedDeltas.set(key, {
            stateId: s.stateId,
            sectorType: s.sectorType,
            industryModel,
            mediaDiscriminator,
            countryId,
            revenue: shedRevAnchor,
            units: 0,
          });
      }
    }
  }

  if (sectorOps.length === 0) {
    return {
      corporateSectorsUpdated: 0,
      unownedSectorsUpdated: 0,
      totalRevenueShed: 0,
      totalCapacityUnitsShed: 0,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await corporateSectorsCollection<Document>(db).bulkWrite(sectorOps as any[]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unownedOps: any[] = [];

  for (const {
    stateId,
    sectorType,
    industryModel,
    mediaDiscriminator,
    countryId,
    revenue,
    units,
  } of unownedDeltas.values()) {
    if (plantsEnabled) {
      // Units are AUTHORITATIVE on the pool under plants, and `revenue` is the
      // derived display/legacy-reader value — the mirror image of the owned
      // side, where `capitalStock` is authoritative and revenue is restated
      // from it. Written as an update PIPELINE (not `$inc`) for the same
      // self-healing reason `restoreSectorsToUnowned` uses one: a doc that
      // predates the `headroomUnits` backfill has no base to increment, so the
      // base is derived from its revenue first, then the shed is added, then
      // revenue is re-derived from the new total. Nothing accumulates from a
      // missing field, and the two fields cannot drift.
      unownedOps.push({
        updateOne: {
          filter: {
            stateId,
            sectorType,
            ...(industryModel != null || sectorType === "manufacturing" ? { industryModel } : {}),
            mediaDiscriminator,
          },
          update: [
            {
              $set: {
                stateId: { $ifNull: ["$stateId", stateId] },
                countryId: { $ifNull: ["$countryId", countryId] },
                sectorType: { $ifNull: ["$sectorType", sectorType] },
                ...(industryModel != null || sectorType === "manufacturing"
                  ? { industryModel: { $ifNull: ["$industryModel", industryModel] } }
                  : {}),
                mediaDiscriminator: { $ifNull: ["$mediaDiscriminator", mediaDiscriminator] },
                createdAt: { $ifNull: ["$createdAt", now] },
                updatedAt: now,
                headroomUnits: {
                  $add: [
                    unownedPoolCreditBaseExpr(
                      sectorType as OperatingSectorType,
                      true,
                      lookups.eraUnitScale,
                      industryModel,
                      mediaDiscriminator
                    ),
                    units,
                  ],
                },
              },
            },
            {
              $set: unownedPoolTrailingSet(
                sectorType as OperatingSectorType,
                true,
                lookups.eraUnitScale,
                industryModel,
                mediaDiscriminator
              ),
            },
          ],
          upsert: true,
        },
      });
      continue;
    }

    unownedOps.push({
      updateOne: {
        filter: {
          stateId,
          sectorType,
          ...(industryModel != null || sectorType === "manufacturing" ? { industryModel } : {}),
          mediaDiscriminator,
        },
        update: {
          $inc: { revenue },
          $set: { updatedAt: now },
          $setOnInsert: {
            _id: new ObjectId(),
            stateId,
            countryId,
            sectorType: sectorType as UnownedSector["sectorType"],
            ...(industryModel != null || sectorType === "manufacturing" ? { industryModel } : {}),
            mediaDiscriminator,
            createdAt: now,
          },
        },
        upsert: true,
      },
    });
  }

  if (unownedOps.length > 0) {
    await db.collection("unownedSectors").bulkWrite(unownedOps);
  }

  return {
    corporateSectorsUpdated: sectorOps.length,
    unownedSectorsUpdated: unownedOps.length,
    totalRevenueShed,
    totalCapacityUnitsShed,
  };
}
