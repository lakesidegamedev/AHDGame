import {
  loadStockWithholdingContexts,
  withholdStockReceipt,
  netStockProceeds,
} from "@/lib/budget/stockSaleWithholding";
import type { Db } from "mongodb";
import { anchorHoldingPosition, positionHoldingTerms } from "@/lib/corporations/rules/holdingTerms";
import { pendingStockTaxReceipt } from "@/lib/corporations/rules/stockTaxReceipt";
import { heldStakeValueAnchor, transferOwnedSharesToNatCorp } from "./heldEquityTransfer";
import { ObjectId } from "mongodb";
import { badRequest } from "@/lib/api/errors";
import type { Corporation, CorporateSector, State } from "@/lib/db/types";
import type { NationalizationTaking } from "@/lib/db/types/corporationSector";
import { splitCompensationBySector } from "./compensationSplit";
import type { UnownedSector } from "@/lib/db/types/unownedSector";
import type { ImperialCharacter } from "@/lib/db/types/imperialCharacter";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
  loadFxRatesByCurrency,
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import type { CorporationType } from "@/lib/constants/corporations";
import {
  unownedHeadroomUnitsPerAnchor,
  unownedPoolCreditBaseExpr,
  unownedPoolLeadingField,
  unownedPoolTrailingSet,
} from "@/lib/market/unownedHeadroom";
import { revenuePerCapacityUnitForStrategy } from "@/lib/constants/capacityEconomy";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { buildPersonalBalanceInc, getHomeCurrency } from "@/lib/currency/characterFunds";
import { sumBondPrincipalAnchor } from "@/lib/bonds/bondPrincipalSum";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import {
  allocateShareholderPool,
  buildPrimeRateMap,
  computeSectorNpvSum,
} from "@/lib/bonds/corporateBondDefault";
import { cleanupShareMarketActivityForCorporations } from "@/lib/corporations/cleanupShareMarketActivity";
import {
  payFundShareholderRows,
  payNppShareholderRows,
} from "@/lib/corporations/payFundShareholders";
import { applyBrandFacilityLoss } from "@/lib/corporations/brandFacilityLoss";
import { stampSubjectDeleted } from "@/lib/financialTxLog/stampDeleted";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import type { CountryId } from "@/lib/constants/countries";
import {
  ensurePrimaryNationalCorporation,
  resolveNationalCorporationForSector,
} from "./nationalCorporation";
import {
  applyTier,
  computeWholeCorpValuation,
  sectorCompensationValuationAnchor,
  wholeCorpCompensationAnchor,
} from "./compensation";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import {
  mergeSectorPlantFields,
  readSectorPlantFields,
} from "@/lib/corporations/sectorTransferCapex";
import { getGameState } from "@/lib/gameState";
import { sumSectorBookValueAnchor } from "@/lib/corporations/sectorProfitBasis";
import { readStateOwnershipConcentration, sociMultiplier } from "./concentration";
import {
  creditTreasuryProceedsFromAnchor,
  debitTreasuryCompensation,
  settleFundedTreasuryCompensation,
} from "./treasury";
import {
  loadTreasuryCashContext,
  resolveTreasuryCashOptions,
  witnessTreasuryCash,
  type TreasuryCashOptions,
} from "./treasuryLedger";
import { snapshotCorporationCurrency } from "@/lib/ledger/balanceSnapshot";
import { deleteDissolvedCorporation } from "./dissolvedCorporation";
import type { CompensationTier } from "./constants";
import { NATIONALIZATION_REVENUE_HAIRCUT } from "./constants";
import { applyNationalizationConsequences } from "./consequences/apply";
import { recordNationalizationLedger } from "./ledger";
import type { NationalizationMethod, NationalizationTrigger } from "./consequences/types";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import {
  combineConstructionBorrowerTransferPlans,
  mergeSurvivorConstructionFilter,
  prepareConstructionBorrowerTransfers,
  securedSiteMergeRefusal,
  settleConstructionBorrowerTransfers,
  type ConstructionBorrowerTransferPlan,
} from "@/lib/banking/constructionBorrowerTransfer";
import { assumedSecuredPrincipalAnchor } from "@/lib/banking/rules/constructionBorrowerTransfer";
import {
  assumeCorporateLoans,
  corporateLoanAssumptionCheck,
  loadLiveCorporateLoans,
  restoreCorporateLoans,
} from "@/lib/banking/corporateLoanAssumption";
import {
  acquireConstructionPropertyTransition,
  hasProtectedConstructionClaim,
  releaseConstructionPropertyTransition,
  reserveSectorsForTransition,
  unprotectedConstructionPropertyFilter,
} from "@/lib/corporations/securedConstructionProperty";
import {
  settleFundedWholeCorpLiquidation,
  settleFundedWholeCorpShareholderPool,
} from "./fundedOwnershipSettlement";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
export {
  settleFundedWholeCorpLiquidation,
  settleFundedWholeCorpShareholderPool,
} from "./fundedOwnershipSettlement";

const UNOWNED_RELEASE_RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Politics inputs the caller supplies; the money fields (valuation, compensation,
 * foreign-owner) are computed by the transition itself and merged in.
 */
export interface TransitionConsequenceInput {
  method: NationalizationMethod;
  triggers: NationalizationTrigger[];
  turn: number;
  governingPartyId?: string | null;
  actorCharacterId?: ObjectId;
}

/** Pairs a seized site with the holding `absorbSectorIntoNatCorp` folds it into. */
const nationalizedSiteMergeKey = (
  sector: Pick<CorporateSector, "stateId" | "sectorType" | "industryModel">
) => `${sector.stateId}|${sector.sectorType}|${sector.industryModel ?? ""}`;

/**
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
  const existing = await sectors.findOne({
    corporationId: destId,
    stateId: sector.stateId,
    sectorType: sector.sectorType,
    industryModel: sector.industryModel ?? null,
  });
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

/**
 * Release one FOREIGN sector (held outside the nationalizing country) to the open
 * unowned market: a country cannot hold assets under another jurisdiction, so a
 * whole-corp taking divests them rather than absorbing them into the domestic
 * National Corporation. The sector revenue (the donor's local currency) is
 * converted to the ₳-native unowned unit and merged into the `(stateId,
 * sectorType)` unowned pool (upsert + `$inc`); the donor row is then removed.
 * No transition haircut — the asset is released to the market, not operated by
 * the state. Mirrors the shed path's CorporateSector→unowned conversion.
 */
export async function releaseForeignSectorToUnowned(
  db: Db,
  sector: CorporateSector,
  currencyCode: CurrencyCode | string | undefined,
  fxRate: number,
  now: Date,
  plantsEnabled: boolean,
  eraUnitScale: number,
  transitionKey: string
): Promise<void> {
  // PLANTS RETURNS CAPACITY, NOT FILL-DEPENDENT REVENUE.
  //
  // (1) Under plants, `revenue` is what the market cleared, so a sector at 40%
  // utilization would hand the pool 40% of the market it occupied and the rest
  // would vanish. (2) A MOTHBALLED sector reports revenue 0 with stock intact,
  // so the old `revenueAnchor > 0` gate skipped the pool write and fell through
  // to the unconditional `deleteOne` below: the state paid book compensation for
  // a plant it then deleted.
  //
  // The released quantity is therefore the sector's CAPACITY: built stock plus
  // undelivered build orders, priced through the sector's OWN strategy mix into
  // the pool's default-mix units, exactly as `restoreSectorsToUnowned` does it so
  // the two release paths cannot disagree. Both legs are ₳-native.
  //
  // Below plants `plantsEnabled` is false and the ₳ revenue leg, gated on
  // `revenueAnchor > 0`, is unchanged.
  const stock =
    typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
      ? Math.max(0, sector.capitalStock)
      : 0;
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
  const capacityAnchor = plantsEnabled
    ? Math.max(
        0,
        Math.round(
          (stock + queuedUnits) *
            revenuePerCapacityUnitForStrategy(
              sector.sectorType as CorporationType,
              sector.strategyId,
              eraUnitScale,
              sector.industryModel,
              sector.mediaDiscriminator
            )
        )
      )
    : 0;
  const revenueAnchor = plantsEnabled
    ? capacityAnchor
    : Math.max(0, Math.round(readCorpEconomicAnchor(sector.revenue ?? 0, currencyCode, fxRate)));
  if (revenueAnchor > 0) {
    // Pipeline update (not $inc + $setOnInsert): `headroomUnits` is DERIVED from
    // revenue and must be recomputed from the POST-increment figure in the same
    // write, or the pool's plants-mode denominator keeps describing the prior
    // revenue. $inc would start from 0 on a doc missing the field and understate the
    // pool permanently; deriving from the new total is self-healing. $setOnInsert is
    // unavailable inside a pipeline, hence the $ifNull identity seeding.
    // TIER-AWARE LEADING LEG: credit whichever leg leads for the tier and let
    // `unownedPoolTrailingSet` restate the other, mirroring
    // `restoreSectorsToUnowned`, so the two release paths cannot disagree.
    // Leading unconditionally rebuilt the unit pool from revenue that still carried
    // drawn-down demand, resurrecting consumed headroom.
    const unitsPerAnchor = unownedHeadroomUnitsPerAnchor(
      sector.sectorType as CorporationType,
      eraUnitScale,
      sector.industryModel,
      sector.mediaDiscriminator
    );
    const sectorType = sector.sectorType as CorporationType;
    const creditField = unownedPoolLeadingField(plantsEnabled);
    // The delta in the leading leg's own units. `revenueAnchor` is ₳ either way;
    // under plants it converts through the pool's default mix, the same
    // conversion `restoreSectorsToUnowned` applies to its capacity leg.
    const creditAmount = plantsEnabled ? revenueAnchor * unitsPerAnchor : revenueAnchor;
    // Readers filter the new pool row by country, so it takes the state's country,
    // not the sector's stored one. `$ifNull` leaves an existing row's country alone.
    const releaseState = await statesCollection(db).findOne(
      { _id: sector.stateId },
      { projection: { countryId: 1 } }
    );
    const releaseCountryId = releaseState?.countryId ?? sector.countryId;
    const restoreToken = sector._id.toHexString();
    const retryWindowStart = new Date(now.getTime() - UNOWNED_RELEASE_RETRY_WINDOW_MS);
    await db.collection<UnownedSector>("unownedSectors").findOneAndUpdate(
      {
        stateId: sector.stateId,
        sectorType: sector.sectorType,
        ...(sector.industryModel != null || sector.sectorType === "manufacturing"
          ? { industryModel: sector.industryModel ?? null }
          : {}),
        mediaDiscriminator: sector.mediaDiscriminator ?? null,
      },
      [
        {
          $set: {
            _id: { $ifNull: ["$_id", new ObjectId()] },
            stateId: { $ifNull: ["$stateId", sector.stateId] },
            countryId: { $ifNull: ["$countryId", releaseCountryId] },
            sectorType: { $ifNull: ["$sectorType", sector.sectorType] },
            ...(sector.industryModel != null || sector.sectorType === "manufacturing"
              ? { industryModel: { $ifNull: ["$industryModel", sector.industryModel ?? null] } }
              : {}),
            mediaDiscriminator: {
              $ifNull: ["$mediaDiscriminator", sector.mediaDiscriminator ?? null],
            },
            createdAt: { $ifNull: ["$createdAt", now] },
            [creditField]: {
              $let: {
                vars: {
                  currentValue: unownedPoolCreditBaseExpr(
                    sectorType,
                    plantsEnabled,
                    eraUnitScale,
                    sector.industryModel
                  ),
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
                            [
                              {
                                sectorId: restoreToken,
                                restoredAt: now,
                                pendingSourceDelete: true,
                                operationKey: transitionKey,
                              },
                            ],
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
            updatedAt: now,
          },
        },
        {
          $set: unownedPoolTrailingSet(
            sectorType,
            plantsEnabled,
            eraUnitScale,
            sector.industryModel,
            sector.mediaDiscriminator
          ),
        },
      ],
      { upsert: true, returnDocument: "before" }
    );
    // The returned preimage acknowledges the atomic pool update. The stable
    // source-sector receipt makes a retry a no-op if a crash lands before the
    // guarded source deletion below.
  }
  const removed = await corporateSectorsCollection(db).deleteOne({
    _id: sector._id,
    "constructionPropertyTransition.key": transitionKey,
  });
  if (removed.deletedCount !== 1)
    throw badRequest("The sector transition reservation was lost during release");
  if (revenueAnchor > 0) {
    const acknowledged = await db.collection<UnownedSector>("unownedSectors").findOneAndUpdate(
      {
        stateId: sector.stateId,
        sectorType: sector.sectorType,
        ...(sector.industryModel != null || sector.sectorType === "manufacturing"
          ? { industryModel: sector.industryModel ?? null }
          : {}),
        recentCorporateSectorRestores: {
          $elemMatch: {
            sectorId: sector._id.toHexString(),
            operationKey: transitionKey,
            pendingSourceDelete: true,
          },
        },
      },
      [
        {
          $set: {
            recentCorporateSectorRestores: {
              $map: {
                input: { $ifNull: ["$recentCorporateSectorRestores", []] },
                as: "restore",
                in: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$$restore.sectorId", sector._id.toHexString()] },
                        { $eq: ["$$restore.operationKey", transitionKey] },
                        { $eq: ["$$restore.pendingSourceDelete", true] },
                      ],
                    },
                    { $mergeObjects: ["$$restore", { pendingSourceDelete: false }] },
                    "$$restore",
                  ],
                },
              },
            },
            updatedAt: now,
          },
        },
      ],
      { returnDocument: "before" }
    );
    if (!acknowledged)
      throw new Error("The unowned pool did not acknowledge the completed sector release");
  }
}

// ── Single-sector absorption ──────────────────────────────────────────────────

export interface NationalizeSectorParams {
  countryId: CountryId;
  sectorId: ObjectId;
  tier: CompensationTier;
  consequence: TransitionConsequenceInput;
}

export interface NationalizeSectorResult {
  nationalCorporationId: ObjectId;
  /** Compensation credited to the donor's liquid capital, in the donor's currency. */
  compensationPaid: number;
  /**
   * The surviving NatCorp sector row after the taking: the re-parented donor row,
   * or the merge survivor when folded into an existing holding. Carries
   * `nationalizationProvenance` so a reversal can return the sector to its prior owner.
   */
  resultingSectorId: ObjectId;
}

/**
 * Single-sector nationalization: move one (stateId, sectorType) sector into the
 * country's National Corporation; the donor corp survives and is paid
 * `sectorNPV × tier` into its liquid capital.
 *
 * Valuation reuses the canonical `computeSectorNpvSum` (the same going-concern
 * NPV used by corporate-bond-default dissolution + issuance), so the sector is
 * valued identically everywhere. That helper returns ₳ (anchor); the payout is
 * converted back to the donor's currency at the persistence boundary.
 */
export async function nationalizeSector(
  db: Db,
  params: NationalizeSectorParams
): Promise<NationalizeSectorResult> {
  const now = new Date();
  const sectors = corporateSectorsCollection(db);
  const corps = corporationsCollection(db);

  const sector = await sectors.findOne({ _id: params.sectorId });
  if (!sector) throw new Error("Sector not found");

  const donor = await corps.findOne({ _id: sector.corporationId });
  if (!donor) throw new Error("Donor corporation not found");

  // Route to the NatCorp that owns this sector type (split-off if one claims it,
  // else the primary). Future takings of a split-off type land in the right corp.
  const nationalCorp =
    sector.industryModel || sector.mediaDiscriminator
      ? await resolveNationalCorporationForSector(
          db,
          params.countryId,
          sector.sectorType,
          sector.industryModel,
          sector.mediaDiscriminator
        )
      : await resolveNationalCorporationForSector(db, params.countryId, sector.sectorType);

  // Valuation in ₳ via the canonical sector NPV (going-concern, growth-cost-net).
  const [centralBanks, fxByCurrency, donorFxRate, marketMode, gameState] = await Promise.all([
    centralBanksCollection(db).find({}).toArray(),
    loadFxRatesByCurrency(db),
    getCorpFxRate(db, donor),
    getMarketSystemModeForDb(db),
    getGameState(db),
  ]);
  const plantsEnabled = marketAtLeast(marketMode, "plants");
  const primeMap = buildPrimeRateMap(centralBanks);
  // Nationalization pays on steady-state earning power (revenue - maintenance),
  // not growth-cost-net NPV: a sector being actively grown must not value to 0
  // just because growth spending consumes current profit.
  //
  // Under plants the base switches to replacement-cost book (and the premium
  // inside applyTier switches with it).
  const grossValuationAnchor = sectorCompensationValuationAnchor(
    sector,
    computeSectorNpvSum([sector], primeMap, donor, fxByCurrency, {
      excludeGrowthCost: true,
      plantsEnabled,
    }),
    {
      plantsEnabled,
      currentYear: gameState?.currentYear,
      currentTurn: gameState?.currentTurn,
      eraUnitScale: await loadWorldEraUnitScale(db),
    }
  );

  // Debit the treasury BEFORE any mutation. The debit is unconditional — an
  // unaffordable payout pushes the treasury into the hole rather than blocking
  // the taking. Seizure (0 payout) moves nothing.
  const compensationKey = `nationalize-sector:${params.countryId}:${sector._id.toString()}:${gameState?.currentTurn ?? 0}`;
  const compensationLedger = await resolveTreasuryCashOptions(db);
  const ownsFundedReservation =
    sector.constructionPropertyTransition?.key === compensationKey &&
    sector.constructionPropertyTransition.kind === "nationalization";
  // The state takes the site with its secured construction loan, the same way
  // a whole-corp taking assumes the seized corporation's bonds: the National
  // Corporation becomes the borrower. Checked and locked before compensation.
  if (hasProtectedConstructionClaim(sector)) {
    const mergeRefusal = await securedSiteMergeRefusal(
      db,
      [sector],
      nationalCorp._id,
      nationalizedSiteMergeKey
    );
    if (mergeRefusal) throw badRequest(mergeRefusal);
  }
  const preparedTransfers = await prepareConstructionBorrowerTransfers(db, {
    sectors: [sector],
    toId: nationalCorp._id,
    toCurrency: resolveCorpLiquidCurrencyCode(nationalCorp) ?? undefined,
    operationKey: compensationKey,
    turn: gameState?.currentTurn ?? params.consequence.turn,
    ownsTransition: () => ownsFundedReservation || !!sector.pendingFundedNationalization,
  });
  if (!preparedTransfers.ok) throw badRequest(preparedTransfers.error);
  const constructionTransfers = preparedTransfers.plan;
  // The National Corporation repays the bank, so the former owner is paid for
  // the site net of what it still owes on it, the same way a whole-corp taking
  // nets the bonds the state assumes.
  const valuationAnchor = Math.max(
    0,
    grossValuationAnchor -
      assumedSecuredPrincipalAnchor(constructionTransfers.transfers, fxByCurrency)
  );
  const payoutAnchor = applyTier(valuationAnchor, params.tier, { plantsEnabled });
  try {
    if (
      sector.pendingFundedNationalization &&
      (sector.pendingFundedNationalization.operationKey !== compensationKey ||
        !compensationLedger?.context?.treasuryCashLedgerEnabled)
    ) {
      throw new Error("Funded nationalization retry requires its original Treasury cash mode");
    }
    if (ownsFundedReservation && !compensationLedger?.context?.treasuryCashLedgerEnabled) {
      throw new Error("Funded nationalization retry requires its original Treasury cash mode");
    }
    if (compensationLedger?.context?.treasuryCashLedgerEnabled) {
      if (
        !(await acquireConstructionPropertyTransition(
          db,
          sector,
          compensationKey,
          "nationalization",
          false,
          true,
          constructionTransfers.hasTransfer(sector._id)
            ? constructionTransfers.claimFilterFor(sector)
            : undefined
        ))
      ) {
        throw badRequest("This sector is in another ownership change. Try again shortly.");
      }
      const reservation = await sectors.updateOne(
        {
          _id: sector._id,
          corporationId: donor._id,
          $or: [
            { pendingFundedNationalization: { $exists: false } },
            { pendingFundedNationalization: { operationKey: compensationKey } },
          ],
        },
        { $set: { pendingFundedNationalization: { operationKey: compensationKey } } }
      );
      if ((reservation?.matchedCount ?? 0) !== 1)
        throw new Error("Could not reserve the funded nationalization mode");
    }
    let fundedCompensationLocal: number | undefined;
    let fundedCompensationNewlySettled = false;
    let fundedTreasuryAmountLocal = 0;
    let fundedPayoutAnchor: number | undefined;
    if (compensationLedger?.context?.treasuryCashLedgerEnabled) {
      const settled = await settleFundedTreasuryCompensation(db, {
        countryId: params.countryId,
        donor,
        payoutAnchor,
        fxByCurrency,
        now,
        key: compensationKey,
        ledger: compensationLedger!,
      });
      fundedCompensationLocal = settled.donorAmountLocal;
      fundedCompensationNewlySettled = settled.newlySettled;
      fundedTreasuryAmountLocal = settled.treasuryAmountLocal;
      fundedPayoutAnchor = settled.payoutAnchor;
    } else {
      await debitTreasuryCompensation(db, params.countryId, payoutAnchor, fxByCurrency, now, {
        flow: "nationalization_compensation",
        key: compensationKey,
        ledger: compensationLedger,
      });
    }
    const effectivePayoutAnchor = fundedPayoutAnchor ?? payoutAnchor;

    // Snapshot the SOCI escalation multiplier at taking time so the transition
    // shock is fixed to today's concentration, not retroactively deepened later.
    const transitionMultiplier = sociMultiplier(
      await readStateOwnershipConcentration(db, params.countryId)
    );

    // Move the sector into the National Corporation, merging into an existing
    // (NatCorp, state, type) holding when present. Stamp the absorption turn so the
    // re-privatization cooldown (spec §13.4) can protect just-absorbed assets.
    // Brand facility-loss (Boeing rule): the donor survives a single-sector taking
    // but loses this plant to the state, so dent its brand proportional to the
    // sector's share of its revenue. Called before the sector is re-parented (the
    // aggregate still includes it). No-op when the donor has no loyalty.
    await applyBrandFacilityLoss(db, donor._id, sector.revenue);

    const resultingSectorId = await absorbSectorIntoNatCorp(
      db,
      sector,
      nationalCorp._id,
      params.consequence.turn,
      now,
      transitionMultiplier,
      plantsEnabled,
      compensationLedger?.context?.treasuryCashLedgerEnabled ? compensationKey : undefined,
      compensationLedger?.context?.treasuryCashLedgerEnabled ? compensationKey : undefined,
      constructionTransfers,
      { countryId: params.countryId, anchor: effectivePayoutAnchor }
    );
    await settleConstructionBorrowerTransfers(db, constructionTransfers);

    // Credit the donor in its own currency (counterparty of the treasury debit).
    let compensationPaid = 0;
    if (payoutAnchor > 0 || (fundedCompensationLocal ?? 0) > 0) {
      compensationPaid =
        fundedCompensationLocal ??
        Math.round(anchorToCorpLiquidCapital(payoutAnchor, donor, donorFxRate));
      if (fundedCompensationLocal === undefined) {
        const credited = await corps.updateOne(
          { _id: donor._id },
          { $inc: { liquidCapital: compensationPaid }, $set: { updatedAt: now } }
        );
        if ((credited?.matchedCount ?? 0) > 0) {
          await witnessTreasuryCash(db, compensationLedger, {
            flow: "nationalization_compensation",
            account: {
              kind: "corporation",
              corpId: donor._id.toString(),
              currency: snapshotCorporationCurrency(donor),
            },
            amount: compensationPaid,
            now,
            site: "ownershipTransition:compensation",
          });
        }
      } else if (fundedCompensationNewlySettled) {
        await witnessTreasuryCash(db, compensationLedger, {
          flow: "nationalization_compensation",
          account: { kind: "government", countryId: params.countryId },
          amount: -fundedTreasuryAmountLocal,
          now,
          site: "ownershipTransition:compensation",
        });
        await witnessTreasuryCash(db, compensationLedger, {
          flow: "nationalization_compensation",
          account: {
            kind: "corporation",
            corpId: donor._id.toString(),
            currency: snapshotCorporationCurrency(donor),
          },
          amount: compensationPaid,
          now,
          site: "ownershipTransition:compensation",
        });
      }
    }

    // Politics + investor-confidence (spec §12). Compensation here is in ₳ already.
    const consequenceResult = await applyNationalizationConsequences(db, {
      countryId: params.countryId,
      method: params.consequence.method,
      tier: params.tier,
      triggers: params.consequence.triggers,
      sectorTypes: [sector.sectorType],
      valuationAnchor,
      compensationAnchor: effectivePayoutAnchor,
      foreignOwnerCountryId: donor.countryId !== params.countryId ? donor.countryId : null,
      governingPartyId: params.consequence.governingPartyId ?? null,
      turn: params.consequence.turn,
      actorCharacterId: params.consequence.actorCharacterId,
    });

    // Acquisition ledger (Register tab). Best-effort — a failed write never aborts.
    try {
      await recordNationalizationLedger(db, {
        countryId: params.countryId,
        nationalCorporationId: nationalCorp._id,
        kind: "nationalize_sector",
        method: params.consequence.method,
        triggers: params.consequence.triggers,
        tier: params.tier,
        valuationAnchor,
        compensationAnchor: effectivePayoutAnchor,
        sectorTypes: [sector.sectorType],
        formerCorpName: donor.name,
        foreignOwnerCountryId: donor.countryId !== params.countryId ? donor.countryId : null,
        confidenceBefore: consequenceResult.confidenceBefore,
        confidenceAfter: consequenceResult.confidenceAfter,
        legitimacyDelta: consequenceResult.legitimacyDelta,
        turn: params.consequence.turn,
      });
    } catch (err) {
      console.error("[nationalizationLedger] sector ledger write failed:", err);
    }

    return { nationalCorporationId: nationalCorp._id, compensationPaid, resultingSectorId };
  } finally {
    // A loan follows its site only if the title actually moved.
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
  }
}

// ── Whole-corp absorption ─────────────────────────────────────────────────────

export interface NationalizeWholeCorpParams {
  countryId: CountryId;
  corporationId: ObjectId;
  tier: CompensationTier;
  consequence: TransitionConsequenceInput;
}

export interface NationalizeWholeCorpResult {
  nationalCorporationId: ObjectId;
  sectorsAbsorbed: number;
  bondsAssumed: number;
  /** Total shareholder compensation paid out, in ₳. */
  shareholderPayoutAnchor: number;
}

/**
 * Whole-corp absorption (central model): pay shareholders pro-rata at
 * `valuation × tier`, move every sector into the country's National Corporation,
 * re-stamp the seized corp's issued bonds to the National Corporation (the state
 * assumes the debt — coupons keep paying, no default), then dissolve the seized
 * shell. Valuation inputs are captured BEFORE anything moves.
 */
export async function nationalizeWholeCorp(
  db: Db,
  params: NationalizeWholeCorpParams
): Promise<NationalizeWholeCorpResult> {
  const now = new Date();
  const corps = corporationsCollection(db);
  const sectors = corporateSectorsCollection(db);
  const bonds = bondsCollection(db);

  const target = await corps.findOne({ _id: params.corporationId });
  if (!target) throw new Error("Target corporation not found");
  if (target.countryOwnerId || target.ownershipState === "stateOwned") {
    throw new Error("Cannot nationalize a state-owned corporation");
  }

  const nationalizationOperationKey = `nationalize:${params.countryId}:${target._id.toHexString()}:${params.consequence.turn}`;
  const buyoutKey = `nationalize-corporation:${params.countryId}:${target._id.toString()}:${params.consequence.turn}`;
  const ledger: TreasuryCashOptions = { context: await loadTreasuryCashContext(db) };
  const hasFundedNationalizationMarker =
    target.pendingFundedNationalization?.operationKey === nationalizationOperationKey;
  if (
    (target.pendingFundedNationalization && !hasFundedNationalizationMarker) ||
    (hasFundedNationalizationMarker && !ledger.context?.treasuryCashLedgerEnabled)
  ) {
    throw new Error("Funded nationalization retry requires Treasury cash");
  }

  const targetSectors = await sectors.find({ corporationId: target._id }).toArray();
  if (
    !ledger.context?.treasuryCashLedgerEnabled &&
    targetSectors.some(
      (sector) => sector.constructionPropertyTransition?.kind === "nationalization"
    )
  ) {
    throw new Error("Nationalization retry requires its original Treasury cash mode");
  }
  // Domestic financed sites go to their National Corporation with their loans,
  // the same way the seized corporation's bonds are assumed below. A foreign
  // financed site would be released to the open market with no buyer to repay
  // its lender, so it still blocks the taking.
  const financedSites = targetSectors.filter((sector) => hasProtectedConstructionClaim(sector));
  if (financedSites.some((s) => s.countryId && s.countryId !== params.countryId)) {
    throw badRequest(
      "A site this corporation holds abroad carries a construction loan. It must be repaid or sold before the taking."
    );
  }
  // The primary NatCorp is the bond and ordinary-loan assumption target and the
  // canonical return. Individual sectors may route to split-offs (resolved per
  // type below).
  const nationalCorp = await ensurePrimaryNationalCorporation(db, params.countryId);
  // Its ordinary bank loans become the National Corporation's debt, like its
  // bonds. Checked before any site is reserved or money moves.
  const loanRefusal = await corporateLoanAssumptionCheck(db, {
    fromId: target._id,
    toCurrency: resolveCorpLiquidCurrencyCode(nationalCorp) ?? undefined,
  });
  if (loanRefusal) throw badRequest(loanRefusal);
  const financedByDest = new Map<string, { dest: Corporation; sites: CorporateSector[] }>();
  for (const site of financedSites) {
    const dest =
      site.industryModel || site.mediaDiscriminator
        ? await resolveNationalCorporationForSector(
            db,
            params.countryId,
            site.sectorType,
            site.industryModel,
            site.mediaDiscriminator
          )
        : await resolveNationalCorporationForSector(db, params.countryId, site.sectorType);
    const group = financedByDest.get(dest._id.toHexString()) ?? { dest, sites: [] };
    group.sites.push(site);
    financedByDest.set(dest._id.toHexString(), group);
  }
  const transferPlans: ConstructionBorrowerTransferPlan[] = [];
  const abandonTransfers = () =>
    settleConstructionBorrowerTransfers(
      db,
      combineConstructionBorrowerTransferPlans(transferPlans)
    );
  for (const { dest, sites } of financedByDest.values()) {
    const mergeRefusal = await securedSiteMergeRefusal(
      db,
      sites,
      dest._id,
      nationalizedSiteMergeKey
    );
    const prepared = mergeRefusal
      ? ({ ok: false, error: mergeRefusal } as const)
      : await prepareConstructionBorrowerTransfers(db, {
          sectors: sites,
          toId: dest._id,
          toCurrency: resolveCorpLiquidCurrencyCode(dest) ?? undefined,
          operationKey: nationalizationOperationKey,
          turn: params.consequence.turn,
          ownsTransition: (sector) =>
            sector.constructionPropertyTransition?.key ===
            `${nationalizationOperationKey}:${sector._id.toHexString()}`,
        });
    if (!prepared.ok) {
      await abandonTransfers();
      throw badRequest(prepared.error);
    }
    transferPlans.push(prepared.plan);
  }
  const constructionTransfers = combineConstructionBorrowerTransferPlans(transferPlans);
  const transitionKeys = await reserveSectorsForTransition(
    db,
    targetSectors,
    "nationalization",
    nationalizationOperationKey,
    true,
    constructionTransfers
  );
  if (!transitionKeys) {
    await abandonTransfers();
    throw badRequest(
      "A site of this corporation is in another ownership change. Try again shortly."
    );
  }
  if (ledger.context?.treasuryCashLedgerEnabled) {
    const marker = await corps.updateOne(
      {
        _id: target._id,
        $or: [
          { pendingFundedNationalization: { $exists: false } },
          { pendingFundedNationalization: { operationKey: nationalizationOperationKey } },
        ],
      },
      {
        $set: {
          pendingFundedNationalization: { operationKey: nationalizationOperationKey },
          updatedAt: now,
        },
      }
    );
    if ((marker?.matchedCount ?? 0) !== 1)
      throw new Error("Could not reserve the funded nationalization mode");
  }
  const transitionKeyBySectorId = new Map(
    targetSectors.map((sector, index) => [sector._id.toHexString(), transitionKeys[index]])
  );

  // ── 1. Capture valuation inputs BEFORE moving sectors/bonds (₳). ──
  const [
    targetBonds,
    heldStakes,
    centralBanks,
    fxByCurrency,
    targetFxRate,
    marketMode,
    corpGameState,
    ordinaryLoans,
  ] = await Promise.all([
    bonds.find({ corporationId: target._id, matured: false }).toArray(),
    corps
      .find(
        { "shareholders.corporationId": target._id },
        { projection: { shareholders: 1, sharePrice: 1, liquidCurrencyCode: 1, countryId: 1 } }
      )
      .toArray(),
    centralBanksCollection(db).find({}).toArray(),
    loadFxRatesByCurrency(db),
    getCorpFxRate(db, target),
    getMarketSystemModeForDb(db),
    getGameState(db),
    loadLiveCorporateLoans(db, target._id, { ordinaryOnly: true }),
  ]);
  const corpPlantsEnabled = marketAtLeast(marketMode, "plants");
  const corpEraUnitScale = await loadWorldEraUnitScale(db);
  const primeMap = buildPrimeRateMap(centralBanks);
  // Steady-state valuation for the whole-corp payout — see nationalizeSector.
  // D11: under plants the sector leg of balance-sheet equity is replacement-cost
  // book, not capitalized earnings.
  const sectorNpvAnchor = corpPlantsEnabled
    ? sumSectorBookValueAnchor(
        targetSectors,
        corpGameState?.currentYear,
        corpEraUnitScale,
        corpGameState?.currentTurn
      )
    : computeSectorNpvSum(targetSectors, primeMap, target, fxByCurrency, {
        excludeGrowthCost: true,
      });
  const liquidCapitalAnchor = corpLiquidCapitalToAnchor(target.liquidCapital, target, targetFxRate);
  // Debt the state assumes: the corp's issued, non-matured bond principal,
  // the secured construction loans its National Corporations take on, and its
  // ordinary bank loans (construction loans excluded there, so none counts twice).
  const debtAnchor =
    sumBondPrincipalAnchor(targetBonds, fxByCurrency) +
    assumedSecuredPrincipalAnchor(constructionTransfers.transfers, fxByCurrency) +
    assumedSecuredPrincipalAnchor(
      ordinaryLoans.map((loan) => ({
        outstandingLocal: loan.outstanding,
        currency: loan.currency,
      })),
      fxByCurrency
    );
  // Shares the seized corp holds in other corporations pass to the National
  // Corporation (step 5b) as shares only, so the buyout pays holders market value,
  // like cash. Held bonds are left out (conservative under-valuation, never an
  // over-pay) until the portfolio pass.
  const heldEquityAnchor = heldStakeValueAnchor(heldStakes, target._id, fxByCurrency);
  const sharePriceAnchor = corpLiquidCapitalToAnchor(target.sharePrice, target, targetFxRate);
  // D11 — base and premium must move together. Under plants the sector leg is
  // replacement-cost book and carries the BOOK premium; cash is taken at par
  // (paying a premium on cash mints money); debt nets off cash first. Pre-fix,
  // `computeWholeCorpValuation`'s max(marketCap, equity) could hand a MARKET
  // base to `applyTier`'s BOOK premium — see `wholeCorpCompensationAnchor`.
  // Below plants the original market-cap-floored path is untouched.
  let valuationAnchor: number;
  let payoutPoolAnchor: number;
  if (corpPlantsEnabled) {
    const comp = wholeCorpCompensationAnchor({
      sectorBookAnchor: sectorNpvAnchor,
      nonSectorAssetsAnchor: liquidCapitalAnchor + heldEquityAnchor,
      debtAnchor,
      tier: params.tier,
    });
    valuationAnchor = comp.valuationAnchor;
    payoutPoolAnchor = comp.payoutAnchor;
  } else {
    valuationAnchor = computeWholeCorpValuation({
      sharePrice: sharePriceAnchor,
      totalShares: target.totalShares,
      balanceSheetEquity: liquidCapitalAnchor + sectorNpvAnchor + heldEquityAnchor,
      debt: debtAnchor,
    });
    payoutPoolAnchor = applyTier(valuationAnchor, params.tier);
  }

  // ── 2. Debit the treasury BEFORE any mutation. Unconditional — an unaffordable
  //       taking deepens the treasury's debt rather than being blocked. The pool
  //       passes through the seized corporation, where every holder row settles. ──
  if (ledger.context?.treasuryCashLedgerEnabled) {
    await settleFundedWholeCorpShareholderPool(db, {
      countryId: params.countryId,
      target,
      poolAnchor: payoutPoolAnchor,
      fxByCurrency,
      forexEnabled: await isForexEnabled(),
      ledger,
      key: buyoutKey,
      now,
    });
  } else {
    await debitTreasuryCompensation(db, params.countryId, payoutPoolAnchor, fxByCurrency, now, {
      flow: "nationalization_buyout_pool",
      key: buyoutKey,
      ledger,
      passThroughCorpId: target._id.toString(),
    });

    // ── 3. Pay shareholders pro-rata (counterparty of the treasury debit). ──
    if (payoutPoolAnchor > 0) {
      await payShareholders(db, target, payoutPoolAnchor, fxByCurrency, now, {
        turn: ledger.context?.turn ?? params.consequence.turn,
        kind: "nationalize_whole",
        treasury: ledger,
        stockTaxActive:
          corpGameState?.stockHoldingTaxStartTurn !== undefined &&
          (ledger.context?.turn ?? params.consequence.turn) >=
            corpGameState.stockHoldingTaxStartTurn,
      });
    }
  }

  // ── 3b. Settle the dissolved corp's liquid cash. The shell is deleted below,
  //       so `liquidCapital` must be distributed, not destroyed. The state
  //       recoups cash up to the compensation paid shareholders; any cash
  //       beyond the buyout goes to the CEO. A seizure or vacant seat routes
  //       all of it to the treasury. Conserves money: ceoSurplus +
  //       treasuryRecoup === liquidCapital always.
  const forexEnabled = await isForexEnabled();
  if (liquidCapitalAnchor > 0 || ledger.context?.treasuryCashLedgerEnabled) {
    const ceoChar =
      params.tier === "seizure" || target.ceoVacant || !target.ceoId
        ? null
        : await charactersCollection(db).findOne({ _id: target.ceoId });
    const ceoSurplusAnchor = ceoChar ? Math.max(0, liquidCapitalAnchor - payoutPoolAnchor) : 0;
    const treasuryCashAnchor = liquidCapitalAnchor - ceoSurplusAnchor;

    if (ledger.context?.treasuryCashLedgerEnabled) {
      await settleFundedWholeCorpLiquidation(db, {
        countryId: params.countryId,
        target,
        ceo: ceoChar,
        ceoSurplusAnchor,
        treasuryCashAnchor,
        liquidCapitalAnchor,
        fxByCurrency,
        forexEnabled,
        ledger,
        key: buyoutKey,
        now,
      });
    } else {
      if (ceoChar && ceoSurplusAnchor > 0) {
        const currency = getHomeCurrency(ceoChar, corpGameState?.preset);
        const rate = fxByCurrency.get(currency as CurrencyCode) ?? 1;
        const amt = Math.round(forexEnabled ? ceoSurplusAnchor * rate : ceoSurplusAnchor);
        const credited = await charactersCollection(db).updateOne(
          { _id: ceoChar._id },
          { $inc: buildPersonalBalanceInc(amt, currency, forexEnabled), $set: { updatedAt: now } }
        );
        if ((credited?.matchedCount ?? 0) > 0) {
          await witnessTreasuryCash(db, ledger, {
            flow: "corporation_liquidation",
            account: { kind: "character", characterId: ceoChar._id.toString(), currency },
            amount: amt,
            now,
            site: "ownershipTransition:ceoSurplus",
          });
        }
      }
      if (treasuryCashAnchor > 0) {
        await creditTreasuryProceedsFromAnchor(db, params.countryId, treasuryCashAnchor, now, {
          flow: "corporation_liquidation",
          ledger,
        });
      }
    }
  }

  // ── 4. Partition by jurisdiction. DOMESTIC sectors are absorbed into the
  //       NatCorp that owns each sector TYPE (a taking spanning multiple types
  //       fans across split-offs + primary; each MERGES into the NatCorp's
  //       existing (state, type) holding so a repeat can't collide on the unique
  //       index). FOREIGN sectors (operated outside this country) cannot be held
  //       under another jurisdiction — they are released to the open unowned
  //       market. A sector with no countryId defaults to domestic (legacy-safe).
  const domesticSectors = targetSectors.filter(
    (s) => !s.countryId || s.countryId === params.countryId
  );
  const foreignSectors = targetSectors.filter(
    (s) => s.countryId && s.countryId !== params.countryId
  );

  // Snapshot the SOCI escalation multiplier at taking time (one value for the
  // whole-corp taking) so the transition shock is fixed to today's concentration.
  const transitionMultiplier = sociMultiplier(
    await readStateOwnershipConcentration(db, params.countryId)
  );

  // The buyout paid for the whole corporation, shared out over the sectors the
  // state keeps (by revenue) so a court reversal can recover each one's part.
  const compensationBySectorId = splitCompensationBySector(domesticSectors, payoutPoolAnchor);

  const destByType = new Map<string, ObjectId>();
  for (const s of domesticSectors) {
    const modelKey = `${s.sectorType}:${s.industryModel ?? ""}:${s.mediaDiscriminator ?? ""}`;
    let destId = destByType.get(modelKey);
    if (!destId) {
      const dest =
        s.industryModel || s.mediaDiscriminator
          ? await resolveNationalCorporationForSector(
              db,
              params.countryId,
              s.sectorType,
              s.industryModel,
              s.mediaDiscriminator
            )
          : await resolveNationalCorporationForSector(db, params.countryId, s.sectorType);
      destId = dest._id;
      destByType.set(modelKey, destId);
    }
    await absorbSectorIntoNatCorp(
      db,
      s,
      destId,
      params.consequence.turn,
      now,
      transitionMultiplier,
      corpPlantsEnabled,
      transitionKeyBySectorId.get(s._id.toHexString())!,
      undefined,
      constructionTransfers,
      {
        countryId: params.countryId,
        anchor: compensationBySectorId.get(s._id.toHexString()) ?? 0,
      }
    );
  }
  await settleConstructionBorrowerTransfers(db, constructionTransfers);
  for (const s of foreignSectors) {
    // A foreign sector's revenue is stored in ITS host-state currency, not the
    // (donor) corp's — convert to the ₳-native unowned pool at the host rate.
    await releaseForeignSectorToUnowned(
      db,
      s,
      resolveSectorHostCurrencyCode(s, target),
      fxRateForSectorHostFromMap(s, target, fxByCurrency),
      now,
      corpPlantsEnabled,
      corpEraUnitScale,
      transitionKeyBySectorId.get(s._id.toHexString())!
    );
  }

  // ── 5. State assumes the seized corp's issued bonds (re-stamp; no default). ──
  if (targetBonds.length > 0) {
    await bonds.updateMany(
      { corporationId: target._id, matured: false },
      { $set: { corporationId: nationalCorp._id, originalIssuerName: target.name, updatedAt: now } }
    );
  }

  // ── 5b. Transfer shares owned by the seized corp in other corporations. ──
  // Shares held by the seized corp must transfer to the National Corporation
  // rather than be silently destroyed during dissolution.
  await transferOwnedSharesToNatCorp(db, target, nationalCorp._id, heldStakes, now);

  // ── 6. Dissolve the seized shell. ──
  await cleanupShareMarketActivityForCorporations(db, [target._id], now, forexEnabled);
  await stampSubjectDeleted(db, target._id, {
    sequentialId: target.sequentialId,
    deletedAt: now,
  });
  // The National Corporation now owes the seized corp's ordinary bank loans.
  // Moved after every step that can fail and just before the delete; handed
  // back if the delete fails while the corporation still exists.
  const assumedLoanIds = await assumeCorporateLoans(db, {
    fromId: target._id,
    toId: nationalCorp._id,
  });
  try {
    await deleteDissolvedCorporation(db, target._id, ledger, now, "ownershipTransition:dissolve", {
      reason: "nationalized",
      successorId: nationalCorp._id,
    });
  } catch (err) {
    if (
      assumedLoanIds.length > 0 &&
      (await corps.countDocuments({ _id: target._id }, { limit: 1 })) > 0
    )
      await restoreCorporateLoans(db, {
        ids: assumedLoanIds,
        fromId: target._id,
        toId: nationalCorp._id,
      });
    throw err;
  }
  // Keep every reservation through compensation, asset transfer, share/bond
  // settlement, and shell deletion. Only release after ownership is final.
  await Promise.all(
    targetSectors.map((sector) =>
      releaseConstructionPropertyTransition(
        db,
        sector._id,
        transitionKeyBySectorId.get(sector._id.toHexString())!
      )
    )
  );

  // Framing reflects domestic sectors actually nationalized; foreign holdings were
  // divested. target + targetSectors captured before shell deletion.
  const sectorTypesTaken = Array.from(new Set(domesticSectors.map((s) => s.sectorType)));
  const consequenceResult = await applyNationalizationConsequences(db, {
    countryId: params.countryId,
    method: params.consequence.method,
    tier: params.tier,
    triggers: params.consequence.triggers,
    sectorTypes: sectorTypesTaken,
    valuationAnchor,
    compensationAnchor: payoutPoolAnchor,
    foreignOwnerCountryId: target.countryId !== params.countryId ? target.countryId : null,
    governingPartyId: params.consequence.governingPartyId ?? null,
    turn: params.consequence.turn,
    actorCharacterId: params.consequence.actorCharacterId,
  });

  // Acquisition ledger (Register tab). Best-effort — a failed write never aborts.
  try {
    await recordNationalizationLedger(db, {
      countryId: params.countryId,
      nationalCorporationId: nationalCorp._id,
      kind: "nationalize_whole",
      method: params.consequence.method,
      triggers: params.consequence.triggers,
      tier: params.tier,
      valuationAnchor,
      compensationAnchor: payoutPoolAnchor,
      debtAnchor,
      shareholdersSettled: target.shareholders?.length ?? 0,
      sectorTypes: sectorTypesTaken,
      formerCorpName: target.name,
      foreignOwnerCountryId: target.countryId !== params.countryId ? target.countryId : null,
      confidenceBefore: consequenceResult.confidenceBefore,
      confidenceAfter: consequenceResult.confidenceAfter,
      legitimacyDelta: consequenceResult.legitimacyDelta,
      turn: params.consequence.turn,
    });
  } catch (err) {
    console.error("[nationalizationLedger] whole-corp ledger write failed:", err);
  }

  return {
    nationalCorporationId: nationalCorp._id,
    sectorsAbsorbed: domesticSectors.length,
    bondsAssumed: targetBonds.length,
    shareholderPayoutAnchor: payoutPoolAnchor,
  };
}

export async function payShareholders(
  db: Db,
  target: Corporation,
  poolAnchor: number,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>,
  now: Date,
  ledger?: PayShareholdersLedgerContext
): Promise<void> {
  const allocation = allocateShareholderPool(target, poolAnchor, new Map());
  const forexEnabled = await isForexEnabled();
  // Ledger legs for every holder credited below. Collected here and flushed once
  // at the end so a throw part-way through does not log money that was reversed.
  const ledgerEntries: PayShareholdersTxInput[] = [];
  const holdingsByOwner = new Map(
    (target.shareholders ?? []).flatMap((holder) => {
      const key = holder.characterId
        ? "character:" + holder.characterId.toHexString()
        : holder.imperialCharacterId
          ? "imperial:" + holder.imperialCharacterId.toHexString()
          : undefined;
      return key ? [[key, holder] as const] : [];
    })
  );

  const anchorToLocal = (amtAnchor: number, currency: string): number => {
    const rate = fxByCurrency.get(currency as CurrencyCode);
    return Number.isFinite(rate) && rate && rate > 0 ? amtAnchor * rate : amtAnchor;
  };

  // Character + imperial holders → personal cash, split by collection.
  const charRows = allocation.characterRows.filter((r) => !r.isImperial && r.payout > 0);
  const imperialRows = allocation.characterRows.filter((r) => r.isImperial && r.payout > 0);

  const withholdingContexts = await loadStockWithholdingContexts(
    db,
    [
      ...charRows.map((r) => ({
        id: new ObjectId(r.characterId),
        collection: "characters" as const,
      })),
      ...imperialRows.map((r) => ({
        id: new ObjectId(r.characterId),
        collection: "imperialCharacters" as const,
      })),
    ],
    ledger?.turn ?? 0
  );
  if (charRows.length > 0) {
    const ids = charRows.map((r) => new ObjectId(r.characterId));
    const docs = await charactersCollection(db)
      .find({ _id: { $in: ids } })
      .toArray();
    const currencyById = new Map(docs.map((c) => [c._id.toString(), getHomeCurrency(c)]));
    await charactersCollection(db).bulkWrite(
      charRows.map((r) => {
        const currency = currencyById.get(r.characterId) ?? "USD";
        const amt = forexEnabled ? anchorToLocal(r.payout, currency) : r.payout;
        const holder = holdingsByOwner.get("character:" + r.characterId);
        const grossStockTax =
          ledger?.stockTaxActive && holder
            ? pendingStockTaxReceipt({
                id:
                  target._id.toHexString() +
                  ":" +
                  ledger.kind +
                  ":" +
                  ledger.turn +
                  ":character:" +
                  r.characterId,
                currencyCode: currency,
                holdingTerms: positionHoldingTerms(
                  anchorHoldingPosition(holder, fxRateForCorpFromMap(target, fxByCurrency)),
                  ledger.turn,
                  0
                ),
                proceedsAnchor: r.payout,
                proceedsCredited: amt,
                saleTurn: ledger.turn,
                assessmentTurn: ledger.turn + 1,
              })
            : undefined;
        const stockTax = grossStockTax
          ? withholdStockReceipt(
              grossStockTax,
              withholdingContexts.get("characters:" + r.characterId)
            )
          : undefined;
        if (ledger)
          ledgerEntries.push(
            buyoutPayoutLeg(ledger, target, "character", new ObjectId(r.characterId), amt, currency)
          );
        return {
          updateOne: {
            filter: { _id: new ObjectId(r.characterId) },
            update: {
              $inc: buildPersonalBalanceInc(
                netStockProceeds(amt, stockTax),
                currency,
                forexEnabled
              ),
              $set: { updatedAt: now },
              ...(stockTax ? { $push: { pendingStockTaxReceipts: stockTax } } : {}),
            },
          },
        };
      })
    );
  }

  if (imperialRows.length > 0) {
    const ids = imperialRows.map((r) => new ObjectId(r.characterId));
    const docs = await db
      .collection<ImperialCharacter>("imperialCharacters")
      .find({ _id: { $in: ids } })
      .toArray();
    const currencyById = new Map(docs.map((c) => [c._id.toString(), getHomeCurrency(c)]));
    await db.collection<ImperialCharacter>("imperialCharacters").bulkWrite(
      imperialRows.map((r) => {
        const currency = currencyById.get(r.characterId) ?? "USD";
        const amt = forexEnabled ? anchorToLocal(r.payout, currency) : r.payout;
        const holder = holdingsByOwner.get("imperial:" + r.characterId);
        const grossStockTax =
          ledger?.stockTaxActive && holder
            ? pendingStockTaxReceipt({
                id:
                  target._id.toHexString() +
                  ":" +
                  ledger.kind +
                  ":" +
                  ledger.turn +
                  ":imperial:" +
                  r.characterId,
                currencyCode: currency,
                holdingTerms: positionHoldingTerms(
                  anchorHoldingPosition(holder, fxRateForCorpFromMap(target, fxByCurrency)),
                  ledger.turn,
                  0
                ),
                proceedsAnchor: r.payout,
                proceedsCredited: amt,
                saleTurn: ledger.turn,
                assessmentTurn: ledger.turn + 1,
              })
            : undefined;
        const stockTax = grossStockTax
          ? withholdStockReceipt(
              grossStockTax,
              withholdingContexts.get("imperialCharacters:" + r.characterId)
            )
          : undefined;
        if (ledger)
          ledgerEntries.push(
            buyoutPayoutLeg(
              ledger,
              target,
              "character",
              new ObjectId(r.characterId),
              amt,
              currency,
              {
                imperial: true,
              }
            )
          );
        return {
          updateOne: {
            filter: { _id: new ObjectId(r.characterId) },
            update: {
              $inc: buildPersonalBalanceInc(
                netStockProceeds(amt, stockTax),
                currency,
                forexEnabled
              ),
              $set: { updatedAt: now },
              ...(stockTax ? { $push: { pendingStockTaxReceipts: stockTax } } : {}),
            },
          },
        };
      })
    );
  }

  // Corporate equity holders → liquidCapital, in each corp's home currency.
  const corpRows = allocation.corporationRows.filter((r) => r.payout > 0);
  if (corpRows.length > 0) {
    const ids = corpRows.map((r) => new ObjectId(r.corporationId));
    const docs = await corporationsCollection(db)
      .find({ _id: { $in: ids } })
      .toArray();
    const corpById = new Map(docs.map((c) => [c._id.toString(), c]));
    await corporationsCollection(db).bulkWrite(
      corpRows.map((r) => {
        const creditor = corpById.get(r.corporationId);
        const creditorCurrency = (creditor?.liquidCurrencyCode ??
          COUNTRY_CURRENCY_MAP[creditor?.countryId as CountryId] ??
          "USD") as CurrencyCode;
        const rate = fxByCurrency.get(creditorCurrency) ?? 1;
        const amtInCapital = Math.round(anchorToCorpLiquidCapital(r.payout, creditor ?? {}, rate));
        if (ledger)
          ledgerEntries.push(
            buyoutPayoutLeg(
              ledger,
              target,
              "corporation",
              new ObjectId(r.corporationId),
              amtInCapital,
              creditorCurrency
            )
          );
        return {
          updateOne: {
            filter: { _id: new ObjectId(r.corporationId) },
            update: { $inc: { liquidCapital: amtInCapital }, $set: { updatedAt: now } },
          },
        };
      })
    );
  }

  // Public float → the national treasury (no value dropped). Same unified
  // treasury the rest of the nationalization money flows move (spec §5).
  if (allocation.publicFloatRow && allocation.publicFloatRow.payout > 0) {
    // The treasury leg settles against the seized corporation like the holder rows.
    await creditTreasuryProceedsFromAnchor(
      db,
      target.countryId,
      allocation.publicFloatRow.payout,
      now,
      ledger
        ? {
            flow: "nationalization_buyout_float",
            key: `nationalize-float:${target._id.toString()}:${ledger.turn}`,
            ledger: ledger.treasury,
            passThroughCorpId: target._id.toString(),
          }
        : undefined
    );
  }

  // Index-fund shareholders → fund cash (₳). Same pool, no FX (cashAnchor is ₳).
  // Previously dropped by allocateShareholderPool. The whole-corp shell is
  // deleted after this transition, so the fund's holding of it is pulled too.
  // Fund rows are ledgered with the same share_buyout_payout
  // type as every other holder bucket now that fund cash is a ledger account.
  if (allocation.fundRows.length > 0) {
    const { txEntries: fundTxEntries } = await payFundShareholderRows(
      db,
      allocation.fundRows,
      target._id,
      now,
      {
        ledger: ledger
          ? {
              turn: ledger.turn,
              txType: "share_buyout_payout",
              kind: ledger.kind,
              counterpartyId: target._id,
              counterpartyName: target.name,
            }
          : undefined,
      }
    );
    if (ledger) ledgerEntries.push(...fundTxEntries);
  }
  await payNppShareholderRows(db, allocation.nppRows, now);

  // Flush every holder leg in one insert.
  if (ledger && ledgerEntries.length > 0) {
    await emitTxBulk(db, ledgerEntries, await loadTxThresholds(db));
  }
}

/** Ledger context for {@link payShareholders}; omit to skip emission entirely. */
export interface PayShareholdersLedgerContext {
  stockTaxActive?: boolean;
  turn: number;
  /** Short marker for what moved the money, e.g. "agreed_acquisition". */
  kind: string;
  /** Witness context for the public float's treasury leg. */
  treasury?: TreasuryCashOptions;
}

type PayShareholdersTxInput = Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">;

/** One holder-side buyout credit, counterparty being the corp being bought out. */
function buyoutPayoutLeg(
  ledger: PayShareholdersLedgerContext,
  target: Corporation,
  subjectType: "character" | "corporation",
  subjectId: ObjectId,
  amount: number,
  currencyCode: string,
  meta?: Record<string, unknown>
): PayShareholdersTxInput {
  return {
    type: "share_buyout_payout",
    turn: ledger.turn,
    createdAt: new Date(),
    subjectType,
    subjectId,
    subjectName: subjectType === "corporation" ? "(corp shareholder)" : "(shareholder)",
    // The exact credited amount: wallets are credited unrounded, so a rounded row
    // would leave the holder's stock check off by the fraction.
    amount,
    currencyCode: currencyCode as CurrencyCode,
    counterpartyType: "corporation",
    counterpartyId: target._id,
    counterpartyName: target.name,
    meta: { kind: ledger.kind, ...(meta ?? {}) },
  };
}
