import { withTurnValueSettlement } from "../withTurnValueSettlement";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import type { Db } from "mongodb";
import { applyPlantChange } from "@/lib/corporations/wholePlants/rules";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { ObjectId } from "mongodb";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import type { CorporationLookups } from "./types";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import type { Document } from "mongodb";

// PLANTS-GATED: under plants the shed removes `capitalStock` units; the revenue
// writes below run only below the plants tier. Shed capacity simply ceases, it
// is not handed to any pool: capacity is created only by paid orders and seeds.
export interface SectorShedResult {
  corporateSectorsUpdated: number;
  totalRevenueShed: number;
  /**
   * Capacity units shed. Always 0 below the plants tier, where the shed moves
   * revenue instead.
   */
  totalCapacityUnitsShed?: number;
}

/**
 * Sheds `rate` of each sector's revenue + workers from the given corps. Mutates `lookups.sectorsByCorp` entries in place so any
 * downstream turn-step in the same pipeline sees the reduced values.
 *
 * Caller must filter `sheddingCorps` to the right candidate set. `reasonLabel`
 * appears in the diagnostic log (e.g. "Vacant CEO" or "Inactive CEO").
 *
 * ─── UNDER PLANTS THIS SHEDS CAPACITY, NOT REVENUE ────────────────────────
 * At `marketSystemMode >= "plants"` the turn processor restates
 * `sector.revenue` from `capitalStock × mixPrice` every turn, so a revenue
 * `$inc` is undone next tick and the corp keeps its capacity. Under plants the
 * shed instead removes `rate × capitalStock` plant from the corp, never
 * touching revenue.
 */
export async function shedSectorsForCorps(
  db: Db,
  lookups: CorporationLookups,
  sheddingCorps: Corporation[],
  rate: number,
  now: Date,
  reasonLabel: string,
  /** `marketSystemMode >= "plants"`. Defaults false — legacy revenue shed. */
  plantsEnabled: boolean = false,
  currentTurn?: number
): Promise<SectorShedResult> {
  if (sheddingCorps.length === 0)
    return { corporateSectorsUpdated: 0, totalRevenueShed: 0, totalCapacityUnitsShed: 0 };
  const turn =
    currentTurn ??
    (await gameStateCollection(db).findOne({ _id: "current" }, { projection: { currentTurn: 1 } }))
      ?.currentTurn ??
    0;
  const outcome = await withTurnValueSettlement(
    db,
    reasonLabel === "Vacant CEO" ? "vacant-ceo-shed" : "inactive-ceo-shed",
    turn,
    async (db) => {
      const ids = sheddingCorps.flatMap((c) =>
        (lookups.sectorsByCorp.get(String(c._id)) ?? []).map((s) => s._id)
      );
      const sectors = await corporateSectorsCollection<CorporateSector>(db)
        .find(
          { _id: { $in: ids } },
          {
            projection: {
              corporationId: 1,
              sectorType: 1,
              strategyId: 1,
              revenue: 1,
              workers: 1,
              capitalStock: 1,
              plantsStartTurn: 1,
              capacityBookAnchor: 1,
              plantUnitRemainder: 1,
              plantWearUnits: 1,
              plantCount: 1,
            },
          }
        )
        .toArray();
      const sectorsByCorp = new Map<string, CorporateSector[]>();
      for (const sector of sectors) {
        const key = String(sector.corporationId);
        sectorsByCorp.set(key, [...(sectorsByCorp.get(key) ?? []), sector]);
      }
      const result = await applySectorShed(
        db,
        { ...lookups, sectorsByCorp },
        sheddingCorps,
        rate,
        now,
        reasonLabel,
        plantsEnabled
      );
      return { result, sectors };
    }
  );
  const byId = new Map(outcome.sectors.map((s) => [String(s._id), s]));
  for (const sectors of lookups.sectorsByCorp.values())
    for (const sector of sectors) {
      const settled = byId.get(String(sector._id));
      if (settled) Object.assign(sector, settled);
    }
  return outcome.result;
}

async function applySectorShed(
  db: Db,
  lookups: CorporationLookups,
  sheddingCorps: Corporation[],
  rate: number,
  now: Date,
  reasonLabel: string,
  plantsEnabled: boolean
): Promise<SectorShedResult> {
  if (sheddingCorps.length === 0) {
    return {
      corporateSectorsUpdated: 0,
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
        Object.assign(s, plantLedger);
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
    }
  }

  if (sectorOps.length === 0) {
    return {
      corporateSectorsUpdated: 0,
      totalRevenueShed: 0,
      totalCapacityUnitsShed: 0,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await corporateSectorsCollection<Document>(db).bulkWrite(sectorOps as any[]);

  return {
    corporateSectorsUpdated: sectorOps.length,
    totalRevenueShed,
    totalCapacityUnitsShed,
  };
}
