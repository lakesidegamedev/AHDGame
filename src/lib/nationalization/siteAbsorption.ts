import { transferFundedSite } from "@/lib/nationalization/fundedSiteTransfer";

import type { Db } from "mongodb";

import { ObjectId } from "mongodb";
import { badRequest } from "@/lib/api/errors";
import type { CorporateSector } from "@/lib/db/types";
import type { NationalizationTaking } from "@/lib/db/types/corporationSector";

import { seedPlantLedger } from "@/lib/corporations/plantLedger";

import {
  mergeSectorPlantFields,
  readSectorPlantFields,
} from "@/lib/corporations/sectorTransferCapex";

import { NATIONALIZATION_REVENUE_HAIRCUT } from "@/lib/nationalization/constants";

import {
  mergeSurvivorConstructionFilter,
  type ConstructionBorrowerTransferPlan,
} from "@/lib/banking/constructionBorrowerTransfer";

import {
  hasProtectedConstructionClaim,
  unprotectedConstructionPropertyFilter,
} from "@/lib/corporations/securedConstructionProperty";

import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

export /**
 * Move one seized `sector` into the NatCorp `destId`, MERGING into an existing holding
 * of the same `(stateId, sectorType)` because a blind `$set: { corporationId }` would
 * violate the unique index and throw E11000. On a merge the donor's capacity folds
 * into the existing row and the donor is dropped; otherwise the donor is re-parented.
 *
 * PLANTS-GATED: under `marketSystemMode >= "plants"` a sector's `revenue` is DERIVED by
 * `sectorTurn` from `capitalStock × mix price`, so both branches move CAPACITY and apply
 * the 15% haircut to `capitalStock`; the revenue write stays in lockstep off the same
 * haircut. Below plants `plantsEnabled` is false and no plant field is written, since
 * `capitalStock` is owned by capital mode there and spreading a fold would stamp stray
 * plant fields onto rows that carry none.
 */
async function absorbSectorIntoNatCorp(
  db: Db,
  sector: CorporateSector,
  destId: ObjectId,
  absorbedAtTurn: number,
  now: Date,
  transitionMultiplier: number,
  plantsEnabled: boolean,
  transitionKey?: string,
  fundedOperationKey?: string,
  constructionTransfers?: ConstructionBorrowerTransferPlan,
  compensation?: { countryId: string; anchor: number }
): Promise<ObjectId> {
  const sectors = corporateSectorsCollection(db);
  // Prior-owner provenance — captured from the donor row BEFORE it is re-parented
  // or folded, so an emergency taking can be reversed (SCOTUS strike-down). On a
  // merge the survivor's earlier takings are kept beside the latest one.
  const provenance = {
    formerCorporationId: sector.corporationId,
    ...(sector.countryId ? { formerCountryId: sector.countryId } : {}),
    formerRevenue: sector.revenue ?? 0,
    ...(typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
      ? { formerCapitalStock: sector.capitalStock }
      : {}),
    takenAtTurn: absorbedAtTurn,
    // What the treasury paid for this taking, so a court reversal can recover it.
    ...(compensation && compensation.anchor > 0
      ? {
          compensationAnchor: compensation.anchor,
          compensationCountryId: compensation.countryId,
        }
      : {}),
  };
  // Transition revenue haircut: the state acquires a disrupted asset worth 15%
  // less than what the former owner held (compensation is paid on the full value
  // upstream, before this transfer). nationalizedAtTurn anchors the productivity
  // shock that decays over NATIONALIZATION_TRANSITION_TURNS.
  const keep = 1 - NATIONALIZATION_REVENUE_HAIRCUT;
  const transferRevenue = Math.round((sector.revenue ?? 0) * keep);
  const donorStock =
    typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
      ? Math.max(0, sector.capitalStock)
      : 0;
  // The haircut lands on `capitalStock` and on `capitalStock` ONLY — the same
  // rule `nationalizeSectorWide` carves by. Each build order's `costPaidAnchor`
  // is real ₳ a corp has ALREADY PAID: shaving 15% off it destroys money rather
  // than capacity. In-flight builds therefore transfer whole; the state seizes
  // a going concern, and compensation already prices the queue into replacement
  // cost book value.
  const haircutStock = Math.round(donorStock * keep * 100) / 100;
  // P5: the paid basis follows the capacity, at the same haircut, so the
  // per-unit basis of the surviving plant is unchanged. Only touched when the
  // donor carries a recorded basis — a row without one keeps the list-price
  // fallback, which already tracks the haircut stock automatically.
  const donorBook =
    typeof sector.capacityBookAnchor === "number" &&
    Number.isFinite(sector.capacityBookAnchor) &&
    sector.capacityBookAnchor >= 0
      ? sector.capacityBookAnchor
      : null;
  const haircutBook = donorBook != null ? donorBook * keep : null;
  if (sector.producerInventory) {
    return transferFundedSite(db, {
      source: sector,
      toId: destId,
      transitionKey,
      fraction: 1,
      key:
        fundedOperationKey ??
        transitionKey ??
        `nationalize:${sector._id.toHexString()}:${absorbedAtTurn}`,
      acquired: {
        revenue: transferRevenue,
        capitalStock: haircutStock,
        ...seedPlantLedger(sector, haircutStock),
        ...(haircutBook != null ? { capacityBookAnchor: haircutBook } : {}),
        ...constructionTransfers?.setFor(sector._id),
        absorbedAtTurn,
        nationalizedAtTurn: absorbedAtTurn,
        nationalizationTransitionMultiplier: transitionMultiplier,
        nationalizationProvenance: provenance,
        updatedAt: now,
      },
    });
  }
  let existing = await sectors.findOne({
    corporationId: destId,
    stateId: sector.stateId,
    sectorType: sector.sectorType,
  });
  const preserveSite =
    !!sector.producerInventory ||
    !!(existing && (existing.strategyId ?? "standard") !== (sector.strategyId ?? "standard"));
  if (preserveSite) existing = null;
  if (existing && !existing._id.equals(sector._id)) {
    // A financed site keeps its own row; `nationalizedSiteMergeKey` refuses
    // the taking before any money moves when it would have to fold.
    if (hasProtectedConstructionClaim(sector))
      throw badRequest("A site with a construction loan cannot be merged into another holding");
    if (existing.constructionPropertyTransition)
      throw badRequest("The National Corporation holding is in another ownership change");
    // MERGE: the donor row is DELETED below, so anything not folded into the
    // survivor here is destroyed outright. `mergeSectorPlantFields` sums
    // capacity and CIP, concatenates the queues in landing order, ANDs
    // `mothballed` and keeps the EARLIER ramp anchor (a re-anchored ramp would
    // re-clamp production the donor had long since ramped past).
    const merged = plantsEnabled
      ? mergeSectorPlantFields(readSectorPlantFields(existing), {
          ...readSectorPlantFields(sector),
          capitalStock: haircutStock,
          ...seedPlantLedger(sector, haircutStock),
          capacityBookAnchor: haircutBook,
        })
      : null;
    const { earlierTakings: olderTakings = [], ...latestTaking } =
      existing.nationalizationProvenance ?? {};
    const earlierTakings = existing.nationalizationProvenance
      ? [...olderTakings, latestTaking as NationalizationTaking]
      : [];
    const merge = await sectors.updateOne(
      { _id: existing._id, ...mergeSurvivorConstructionFilter(existing) },
      {
        $inc: {
          // Revenue merges in EVERY mode, in lockstep with the capacity fold
          // above and off the same post-haircut quantity. Skipping the write under
          // plants does not avoid a double count: the donor row is DELETED
          // immediately below, so the donor's revenue would exist nowhere in the
          // world until the next `sectorTurn` restatement. Both the metric-engine
          // provider and `estimateNationalizedOperatingIncome` read this field, so
          // skipping causes a one-turn UNDERCOUNT of national output.
          revenue: transferRevenue,
          workers: sector.workers ?? 0,
          currentGrowthCost: sector.currentGrowthCost ?? 0,
        },
        $set: {
          ...(merged ? { ...merged } : {}),
          absorbedAtTurn,
          nationalizedAtTurn: absorbedAtTurn,
          nationalizationTransitionMultiplier: transitionMultiplier,
          // The survivor keeps its own earlier holdings, so a reversal has to know
          // how much of the row this taking added.
          nationalizationProvenance: {
            ...provenance,
            ...(earlierTakings.length > 0 ? { earlierTakings } : {}),
            mergedIntoExisting: true,
            foldedRevenue: transferRevenue,
            foldedWorkers: sector.workers ?? 0,
            foldedGrowthCost: sector.currentGrowthCost ?? 0,
            ...(plantsEnabled ? { foldedCapitalStock: haircutStock } : {}),
          },
          updatedAt: now,
        },
      }
    );
    if (merge.matchedCount !== 1)
      throw badRequest("The National Corporation holding became secured during the taking");
    const remove = await sectors.deleteOne({
      _id: sector._id,
      ...(fundedOperationKey
        ? { "pendingFundedNationalization.operationKey": fundedOperationKey }
        : {}),
      ...(transitionKey
        ? { "constructionPropertyTransition.key": transitionKey }
        : unprotectedConstructionPropertyFilter()),
    });
    if (remove.deletedCount !== 1)
      throw badRequest("The sector became secured during the nationalization");
    return existing._id;
  } else {
    // RE-PARENT: the doc itself is re-pointed, so the plant state rides along
    // for free — except `capitalStock`, which must take the haircut. Without it
    // the next tick restates `revenue` from the untouched nameplate straight
    // back to the full pre-taking figure and the transition penalty silently
    // evaporates.
    const reparent = await sectors.updateOne(
      {
        _id: sector._id,
        ...(fundedOperationKey
          ? { "pendingFundedNationalization.operationKey": fundedOperationKey }
          : {}),
        ...(transitionKey
          ? {
              "constructionPropertyTransition.key": transitionKey,
              ...constructionTransfers?.claimFilterFor(sector),
            }
          : (constructionTransfers?.filterFor(sector) ?? unprotectedConstructionPropertyFilter())),
      },
      {
        $set: {
          corporationId: destId,
          ...(preserveSite
            ? { nationalizationSiteKey: sector.nationalizationSiteKey ?? sector._id.toHexString() }
            : {}),
          ...constructionTransfers?.setFor(sector._id),
          revenue: transferRevenue,
          ...(plantsEnabled ? { capitalStock: haircutStock } : {}),
          ...(plantsEnabled ? seedPlantLedger(sector, haircutStock) : {}),
          ...(plantsEnabled && haircutBook != null ? { capacityBookAnchor: haircutBook } : {}),
          absorbedAtTurn,
          nationalizedAtTurn: absorbedAtTurn,
          nationalizationTransitionMultiplier: transitionMultiplier,
          nationalizationProvenance: provenance,
          updatedAt: now,
        },
        ...(fundedOperationKey
          ? {
              $unset: {
                pendingFundedNationalization: "",
                constructionPropertyTransition: "",
              },
            }
          : {}),
      }
    );
    if (reparent.matchedCount !== 1)
      throw badRequest("The sector became secured during the nationalization");
    return sector._id;
  }
}
