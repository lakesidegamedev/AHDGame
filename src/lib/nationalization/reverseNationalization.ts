import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { isStateOwned } from "./nationalCorporation";
import { privatizeAsset } from "./privatizeAsset";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { getCorporateSectorsCollection } from "@/lib/db/collections/corporateSectors";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import {
  completeCompensationRecovery,
  discardCompensationRecovery,
  recordCompensationRecovery,
  rehomeSpinOutRecovery,
} from "./clawbackCompensation";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

export interface ReverseNationalizationParams {
  countryId: string;
  /** Surviving NatCorp sector rows to return to private hands (see NationalizeSectorResult.resultingSectorId). */
  sectorIds: ObjectId[];
  turn: number;
  /** Short label used to name a fallback spin-out corp when no prior owner survives. */
  label: string;
}

export interface ReverseNationalizationResult {
  /** Sectors handed back to their originally-recorded prior owner. */
  restoredToPriorOwner: number;
  /** Sectors returned to private hands via a fresh spin-out (no prior owner). */
  spunOut: number;
  /** Sectors skipped (already private, missing, or the return threw). */
  skipped: number;
  /** Compensation recovered from former owners and credited back to the treasury, in ₳. */
  compensationRecoveredAnchor: number;
  /** Compensation former owners could not pay, recorded as debt owed to the country, in ₳. */
  compensationOwedAnchor: number;
}

/**
 * Reverse an emergency nationalization: return taken sectors to private hands.
 * Re-parents each sector to its recorded prior owner if that corporation still
 * exists, restoring pre-haircut economics; otherwise falls back to normal
 * privatization. Clears `absorbedAtTurn` to bypass the re-privatization cooldown,
 * since a court order overrides it. Idempotent: already-private sectors and
 * missing rows are skipped. A per-sector throw is caught and counted as skipped
 * so one bad row never wedges the docket turn.
 */
export async function reverseNationalizationTaking(
  db: Db,
  params: ReverseNationalizationParams
): Promise<ReverseNationalizationResult> {
  const now = new Date();
  const result: ReverseNationalizationResult = {
    restoredToPriorOwner: 0,
    spunOut: 0,
    skipped: 0,
    compensationRecoveredAnchor: 0,
    compensationOwedAnchor: 0,
  };
  for (const sectorId of params.sectorIds) {
    try {
      await reverseSector(db, params, sectorId, now, result);
    } catch (err) {
      console.error(
        `[reverseNationalization] failed to return sector ${sectorId.toString()}:`,
        err
      );
      result.skipped++;
    }
  }
  return result;
}

/**
 * Undo every taking recorded on one sector row, newest first, so a row that
 * folded several takings hands each one back in turn.
 */
async function reverseSector(
  db: Db,
  params: ReverseNationalizationParams,
  sectorId: ObjectId,
  now: Date,
  result: ReverseNationalizationResult
): Promise<void> {
  const progress = { reversedAny: false };
  while (await reverseNextTaking(db, params, sectorId, now, result, progress)) {
    // Each pass hands back one taking and reports whether another remains.
  }
  if (!progress.reversedAny) result.skipped++;
}

/** Hand back the newest taking on the row; true when another taking is left to try. */
async function reverseNextTaking(
  db: Db,
  params: ReverseNationalizationParams,
  sectorId: ObjectId,
  now: Date,
  result: ReverseNationalizationResult,
  progress: { reversedAny: boolean }
): Promise<boolean> {
  const sectorsCol = db.collection<CorporateSector>("corporateSectors");
  const corps = corporationsCollection(db);
  {
    const sector = await sectorsCol.findOne({ _id: sectorId });
    if (!sector) return false;

    // Only reverse a sector that is STILL held by a state-owned NatCorp of this
    // country. A row already handed back (idempotent re-run) is left alone.
    const holder = await corps.findOne({ _id: sector.corporationId });
    if (!holder || !isStateOwned(holder) || holder.countryOwnerId !== params.countryId) {
      return false;
    }

    const prov = sector.nationalizationProvenance;
    const priorOwner = prov?.formerCorporationId
      ? await corps.findOne({ _id: prov.formerCorporationId })
      : null;
    const compensation = prov?.compensationAnchor ?? 0;
    const compensationCountryId = prov?.compensationCountryId ?? params.countryId;

    // The recovery is recorded before the asset moves and finished after, so a
    // crash between the two is resumed rather than lost.
    let markerKey: string | null = null;
    let owingCorpId: ObjectId | null = null;
    let moved = false;
    const recordRecovery = async (corporationId: ObjectId) => {
      if (!prov || !(compensation > 0)) return;
      owingCorpId = corporationId;
      markerKey = await recordCompensationRecovery(db, {
        countryId: compensationCountryId,
        corporationId,
        sectorId: sector._id,
        takenAtTurn: prov.takenAtTurn,
        compensationAnchor: compensation,
      });
    };
    const finishRecovery = async () => {
      if (!markerKey || !owingCorpId) return;
      const recovered = await completeCompensationRecovery(db, owingCorpId, markerKey, now);
      result.compensationRecoveredAnchor += recovered.recoveredAnchor;
      result.compensationOwedAnchor += recovered.owedAnchor;
    };
    const abandonRecovery = async () => {
      if (!moved && markerKey && owingCorpId)
        await discardCompensationRecovery(db, owingCorpId, markerKey).catch(() => undefined);
    };

    try {
      // A row that folded this taking into holdings the state already had is
      // never handed back whole: only what the taking added returns.
      if (prov?.mergedIntoExisting) {
        if (!priorOwner || priorOwner._id.equals(holder._id)) return false;
        await recordRecovery(priorOwner._id);
        if (!(await returnMergedPortion(db, sector, priorOwner._id, now))) {
          await abandonRecovery();
          return false;
        }
        moved = true;
        result.restoredToPriorOwner++;
        progress.reversedAny = true;
        await finishRecovery();
        return (prov.earlierTakings?.length ?? 0) > 0;
      }

      if (prov && priorOwner && !priorOwner._id.equals(holder._id)) {
        // Re-parent to the recorded prior owner and restore pre-haircut economics.
        //
        // PLANTS-GATED: the `revenue` write below is the LEGACY nameplate, not
        // the quantity. `formerCapitalStock` is restored in the same `$set`, and
        // under plants `sectorTurn` restates revenue from owned capacity on the
        // next tick, so the nameplate converges on the restored capacity rather
        // than being double-counted against it. Restoring capacity without
        // revenue would leave a stale pre-haircut nameplate visible for one
        // turn; restoring revenue without capacity would be erased. Both, in one
        // write, is the correct pairing.
        await recordRecovery(priorOwner._id);
        await sectorsCol.updateOne(
          { _id: sector._id },
          {
            $set: {
              corporationId: priorOwner._id,
              ...(typeof prov.formerRevenue === "number" ? { revenue: prov.formerRevenue } : {}),
              ...(typeof prov.formerCapitalStock === "number"
                ? {
                    capitalStock: prov.formerCapitalStock,
                    ...seedPlantLedger(sector, prov.formerCapitalStock),
                  }
                : {}),
              updatedAt: now,
            },
            $unset: {
              absorbedAtTurn: "",
              nationalizedAtTurn: "",
              nationalizationTransitionMultiplier: "",
              nationalizationProvenance: "",
            },
          }
        );
        moved = true;
        result.restoredToPriorOwner++;
        progress.reversedAny = true;
        await finishRecovery();
        return false;
      }

      // Fallback: no surviving prior owner. Spin the sector out to a fresh private
      // corp via the normal privatization path. Clear the absorb stamp first so the
      // re-privatization cooldown does not reject a court-ordered return. The
      // recovery marker goes on the state corporation first, because the owner that
      // will owe it does not exist until the spin-out lands.
      if (prov && compensation > 0) {
        owingCorpId = holder._id;
        markerKey = await recordCompensationRecovery(db, {
          countryId: compensationCountryId,
          corporationId: holder._id,
          sectorId: sector._id,
          takenAtTurn: prov.takenAtTurn,
          compensationAnchor: compensation,
          spinOut: true,
        });
      }
      await sectorsCol.updateOne(
        { _id: sector._id },
        { $unset: { absorbedAtTurn: "" }, $set: { updatedAt: now } }
      );
      const carveName = `${params.label} Returned ${sector._id.toString().slice(-6)}`.slice(0, 60);
      const spun = await privatizeAsset(db, {
        countryId: params.countryId as CountryId,
        sourceNationalCorporationId: holder._id,
        selections: [{ sectorId: sector._id, carveFraction: 1 }],
        newCorpName: carveName,
        goldenSharePercent: 0,
        method: "ipo",
        turn: params.turn,
      });
      moved = true;
      await sectorsCol.updateOne(
        { _id: sector._id },
        { $unset: { nationalizationProvenance: "" }, $set: { updatedAt: now } }
      );
      result.spunOut++;
      // The corporation that now holds the asset owes the compensation back.
      if (markerKey && spun?.newCorporationId) {
        await rehomeSpinOutRecovery(db, holder._id, markerKey, spun.newCorporationId);
        owingCorpId = spun.newCorporationId;
        await finishRecovery();
      } else if (markerKey) {
        await discardCompensationRecovery(db, holder._id, markerKey);
      }
      progress.reversedAny = true;
      return false;
    } catch (err) {
      await abandonRecovery();
      throw err;
    }
  }
}

/**
 * Finish compensation recoveries a crash interrupted. A marker whose taking is
 * still on its sector never started (the asset did not move) and is dropped;
 * every other marker is completed.
 */
export async function resumePendingCompensationRecoveries(
  db: Db,
  now = new Date()
): Promise<number> {
  const corps = await getCorporationsCollection(db);
  const owing = await corps
    .find(
      { pendingCompensationRecoveries: { $exists: true, $ne: {} } },
      { projection: { _id: 1, pendingCompensationRecoveries: 1 } }
    )
    .limit(200)
    .toArray();
  let resumed = 0;
  // Spin-out markers are handed to the asset's new owner first, so a later
  // completion on that owner can never be followed by a second hand-over.
  const unresolved = new Set<string>();
  for (const corp of owing) {
    for (const [key, marker] of Object.entries(corp.pendingCompensationRecoveries ?? {})) {
      if (!marker.spinOut) continue;
      try {
        await resolveSpinOutMarker(db, corp._id, key, marker.sectorId);
      } catch (err) {
        unresolved.add(key);
        console.error(`[reverseNationalization] could not resume spin-out ${key}:`, err);
      }
    }
  }
  for (const corp of owing) {
    for (const [key, marker] of Object.entries(corp.pendingCompensationRecoveries ?? {})) {
      if (marker.spinOut || unresolved.has(key)) continue;
      try {
        if (
          marker.stage === "pending" &&
          (await takingStillInPlace(db, marker.sectorId, marker.takenAtTurn, corp._id))
        ) {
          await discardCompensationRecovery(db, corp._id, key);
          continue;
        }
        await completeCompensationRecovery(db, corp._id, key, now);
        resumed++;
      } catch (err) {
        console.error(`[reverseNationalization] could not resume recovery ${key}:`, err);
      }
    }
  }
  return resumed;
}

/**
 * A spin-out marker still on the state corporation: if the asset left it, the new
 * owner takes the marker over and the stale provenance is cleared; if not, the
 * spin-out never happened and the marker is dropped.
 */
async function resolveSpinOutMarker(
  db: Db,
  holderId: ObjectId,
  key: string,
  sectorId: ObjectId
): Promise<void> {
  const sectorsCol = await getCorporateSectorsCollection(db);
  const sector = await sectorsCol.findOne({ _id: sectorId });
  if (!sector || sector.corporationId.equals(holderId)) {
    await discardCompensationRecovery(db, holderId, key);
    return;
  }
  await rehomeSpinOutRecovery(db, holderId, key, sector.corporationId);
  await sectorsCol.updateOne({ _id: sectorId }, { $unset: { nationalizationProvenance: "" } });
}

async function takingStillInPlace(
  db: Db,
  sectorId: ObjectId,
  takenAtTurn: number,
  owingCorpId: ObjectId
): Promise<boolean> {
  const sector = await (await getCorporateSectorsCollection(db)).findOne({ _id: sectorId });
  const prov = sector?.nationalizationProvenance;
  if (!sector || !prov || sector.corporationId.equals(owingCorpId)) return false;
  return (
    prov.takenAtTurn === takenAtTurn ||
    (prov.earlierTakings ?? []).some((t) => t.takenAtTurn === takenAtTurn)
  );
}

/**
 * Hand back only what a folded taking added to a merged state holding. The
 * survivor keeps everything it held before; the former owner gets the pre-haircut
 * figures the taking removed, joining a row it already has for the same
 * (state, type) or receiving a fresh one. Build queues and inventory stay with
 * the state. Returns false when the amounts cannot be applied safely.
 */
async function returnMergedPortion(
  db: Db,
  survivor: CorporateSector,
  priorOwnerId: ObjectId,
  now: Date
): Promise<boolean> {
  if (!survivor.nationalizationProvenance) return false;
  const { earlierTakings = [], ...prov } = survivor.nationalizationProvenance;
  const previousTaking = earlierTakings[earlierTakings.length - 1];
  const remainingProvenance = previousTaking
    ? {
        ...previousTaking,
        ...(earlierTakings.length > 1 ? { earlierTakings: earlierTakings.slice(0, -1) } : {}),
      }
    : null;
  const sectorsCol = await getCorporateSectorsCollection(db);
  const plants = typeof prov.foldedCapitalStock === "number";
  const foldedStock = plants
    ? Math.min(prov.foldedCapitalStock ?? 0, survivor.capitalStock ?? 0)
    : 0;
  const foldedRevenue = Math.min(prov.foldedRevenue ?? 0, survivor.revenue ?? 0);
  const foldedWorkers = Math.min(prov.foldedWorkers ?? 0, survivor.workers ?? 0);
  const foldedGrowthCost = Math.min(prov.foldedGrowthCost ?? 0, survivor.currentGrowthCost ?? 0);
  const survivorStock = Math.max(0, (survivor.capitalStock ?? 0) - foldedStock);
  const bookFraction =
    plants && (survivor.capitalStock ?? 0) > 0 ? foldedStock / (survivor.capitalStock ?? 1) : 0;
  const foldedBook = (survivor.capacityBookAnchor ?? 0) * bookFraction;

  // Take the portion off the survivor first, guarded on the figures just read.
  const taken = await sectorsCol.updateOne(
    {
      _id: survivor._id,
      revenue: survivor.revenue,
      workers: survivor.workers,
      ...(plants ? { capitalStock: survivor.capitalStock } : {}),
    },
    {
      $set: {
        revenue: (survivor.revenue ?? 0) - foldedRevenue,
        workers: (survivor.workers ?? 0) - foldedWorkers,
        currentGrowthCost: (survivor.currentGrowthCost ?? 0) - foldedGrowthCost,
        ...(plants
          ? {
              capitalStock: survivorStock,
              ...seedPlantLedger(survivor, survivorStock),
              ...(typeof survivor.capacityBookAnchor === "number"
                ? { capacityBookAnchor: survivor.capacityBookAnchor - foldedBook }
                : {}),
            }
          : {}),
        ...(remainingProvenance ? { nationalizationProvenance: remainingProvenance } : {}),
        updatedAt: now,
      },
      ...(remainingProvenance ? {} : { $unset: { nationalizationProvenance: "" } }),
    }
  );
  if (taken.modifiedCount !== 1) return false;

  const returnedRevenue =
    typeof prov.formerRevenue === "number" ? prov.formerRevenue : foldedRevenue;
  const returnedStock = plants
    ? typeof prov.formerCapitalStock === "number"
      ? prov.formerCapitalStock
      : foldedStock
    : 0;
  const existing = await sectorsCol.findOne({
    corporationId: priorOwnerId,
    stateId: survivor.stateId,
    sectorType: survivor.sectorType,
    industryModel: survivor.industryModel ?? null,
  } as never);
  if (existing) {
    const mergedStock = (existing.capitalStock ?? 0) + returnedStock;
    await sectorsCol.updateOne(
      { _id: existing._id },
      {
        $inc: {
          revenue: returnedRevenue,
          workers: foldedWorkers,
          currentGrowthCost: foldedGrowthCost,
        },
        $set: {
          ...(plants
            ? { capitalStock: mergedStock, ...seedPlantLedger(existing, mergedStock) }
            : {}),
          updatedAt: now,
        },
      }
    );
    return true;
  }
  const {
    _id: _survivorId,
    nationalizationProvenance: _prov,
    absorbedAtTurn: _absorbed,
    nationalizedAtTurn: _nationalizedAt,
    nationalizationTransitionMultiplier: _multiplier,
    buildQueue: _queue,
    inventoryUnits: _inventoryUnits,
    inventoryValueAnchor: _inventoryValue,
    ...base
  } = survivor;
  void [
    _survivorId,
    _prov,
    _absorbed,
    _nationalizedAt,
    _multiplier,
    _queue,
    _inventoryUnits,
    _inventoryValue,
  ];
  await sectorsCol.insertOne({
    ...base,
    _id: new ObjectId(),
    corporationId: priorOwnerId,
    revenue: returnedRevenue,
    workers: foldedWorkers,
    currentGrowthCost: foldedGrowthCost,
    ...(plants
      ? {
          capitalStock: returnedStock,
          ...seedPlantLedger(survivor, returnedStock),
          capacityBookAnchor: foldedBook,
        }
      : {}),
    updatedAt: now,
  } as CorporateSector);
  return true;
}
