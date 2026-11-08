import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { isStateOwned } from "./nationalCorporation";
import { privatizeAsset } from "./privatizeAsset";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { clawBackNationalizationCompensation } from "./clawbackCompensation";

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
  const sectorsCol = db.collection<CorporateSector>("corporateSectors");
  const corps = db.collection<Corporation>("corporations");

  let restoredToPriorOwner = 0;
  let spunOut = 0;
  let skipped = 0;
  let compensationRecoveredAnchor = 0;
  let compensationOwedAnchor = 0;

  for (const sectorId of params.sectorIds) {
    let releaseClaim: () => Promise<void> = async () => {};
    try {
      const sector = await sectorsCol.findOne({ _id: sectorId });
      if (!sector) {
        skipped++;
        continue;
      }

      // Only reverse a sector that is STILL held by a state-owned NatCorp of this
      // country. A row already handed back (idempotent re-run) is left alone.
      const holder = await corps.findOne({ _id: sector.corporationId });
      if (!holder || !isStateOwned(holder) || holder.countryOwnerId !== params.countryId) {
        skipped++;
        continue;
      }

      const prov = sector.nationalizationProvenance;
      const priorOwner = prov?.formerCorporationId
        ? await corps.findOne({ _id: prov.formerCorporationId })
        : null;

      // Claim the compensation before the asset moves so a retry cannot recover
      // it twice; the claim is handed back below if the return does not happen.
      let claimedAnchor = 0;
      if (prov && priorOwner && (prov.compensationAnchor ?? 0) > 0) {
        const claim = await sectorsCol.updateOne(
          {
            _id: sector._id,
            "nationalizationProvenance.compensationAnchor": prov.compensationAnchor,
          },
          { $unset: { "nationalizationProvenance.compensationAnchor": "" } }
        );
        if (claim.modifiedCount === 1) claimedAnchor = prov.compensationAnchor ?? 0;
      }
      releaseClaim = async () => {
        if (claimedAnchor <= 0) return;
        await sectorsCol.updateOne(
          { _id: sector._id, nationalizationProvenance: { $exists: true } },
          { $set: { "nationalizationProvenance.compensationAnchor": claimedAnchor } }
        );
      };
      const recoverCompensation = async () => {
        if (claimedAnchor <= 0 || !priorOwner) return;
        const recovered = await clawBackNationalizationCompensation(db, {
          countryId: prov?.compensationCountryId ?? params.countryId,
          corporationId: priorOwner._id,
          compensationAnchor: claimedAnchor,
          now,
        });
        compensationRecoveredAnchor += recovered.recoveredAnchor;
        compensationOwedAnchor += recovered.owedAnchor;
      };

      {
        // A row that folded this taking into holdings the state already had is
        // never handed back whole: only what the taking added returns.
        if (prov?.mergedIntoExisting) {
          if (!priorOwner || priorOwner._id.equals(holder._id)) {
            skipped++;
            continue;
          }
          if (await returnMergedPortion(db, sector, priorOwner._id, now)) {
            restoredToPriorOwner++;
            await recoverCompensation();
          } else {
            await releaseClaim();
            skipped++;
          }
          continue;
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
          restoredToPriorOwner++;
          await recoverCompensation();
          continue;
        }
      }

      // Fallback: no surviving prior owner. Spin the sector out to a fresh private
      // corp via the normal privatization path. Clear the absorb stamp first so the
      // re-privatization cooldown does not reject a court-ordered return.
      await sectorsCol.updateOne(
        { _id: sector._id },
        { $unset: { absorbedAtTurn: "", nationalizationProvenance: "" }, $set: { updatedAt: now } }
      );
      const carveName = `${params.label} Returned ${sector._id.toString().slice(-6)}`.slice(0, 60);
      await privatizeAsset(db, {
        countryId: params.countryId as CountryId,
        sourceNationalCorporationId: holder._id,
        selections: [{ sectorId: sector._id, carveFraction: 1 }],
        newCorpName: carveName,
        goldenSharePercent: 0,
        method: "ipo",
        turn: params.turn,
      });
      spunOut++;
    } catch (err) {
      console.error(
        `[reverseNationalization] failed to return sector ${sectorId.toString()}:`,
        err
      );
      await releaseClaim().catch(() => undefined);
      skipped++;
    }
  }

  return {
    restoredToPriorOwner,
    spunOut,
    skipped,
    compensationRecoveredAnchor,
    compensationOwedAnchor,
  };
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
  const prov = survivor.nationalizationProvenance;
  if (!prov) return false;
  const sectorsCol = db.collection<CorporateSector>("corporateSectors");
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
        updatedAt: now,
      },
      $unset: { nationalizationProvenance: "" },
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
