import { referenceValuation } from "./referenceValuation";
import { controllerTransferBarrierError } from "./controllerTransferBarrier";
import type { Db } from "mongodb";
import {
  assertForeignControlAllowed,
  assertSubsidiaryWithinCap,
} from "@/lib/mechanicalLaws/guards";
import { anchorHoldingPosition, positionHoldingTerms } from "@/lib/corporations/rules/holdingTerms";
import { recordCorporationExit } from "@/lib/corporations/exits/recordCorporationExit";
import { ObjectId } from "mongodb";
import type {
  Bond,
  Character,
  Corporation,
  CorporateSector,
  ImperialCharacter,
} from "@/lib/db/types";
import type { IndexFund } from "@/lib/db/types";
import type { FederalBudget } from "@/lib/db/types/budget";
import {
  EQUITY_MARKET_POOLS_COLLECTION,
  type EquityMarketPool,
} from "@/lib/db/types/equityMarketPool";
import { equityPoolCurrency } from "@/lib/equities/marketPool";
import type { AcquisitionOffer, AcquisitionOutcome } from "@/lib/db/types/acquisitionOffer";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import {
  cleanupShareMarketActivityForCorporations,
  cleanupShareMarketActivityForCorporationTargets,
} from "@/lib/corporations/cleanupShareMarketActivity";
import { stampSubjectDeleted } from "@/lib/financialTxLog/stampDeleted";
import { allocateShareholderPool } from "@/lib/bonds/corporateBondDefault";
import { moveSectorToCorp } from "@/lib/corporations/moveSector";
import {
  assumeCorporateLoans,
  corporateLoanAssumptionCheck,
} from "@/lib/banking/corporateLoanAssumption";
import {
  emptyConstructionBorrowerTransferPlan,
  prepareConstructionBorrowerTransfers,
  securedSiteMergeRefusal,
  settleConstructionBorrowerTransfers,
} from "@/lib/banking/constructionBorrowerTransfer";
import { recordAudit } from "@/lib/audit/recordAudit";
import { assertMergerClearance } from "@/lib/corporations/mergerReview/gate";
import { attachMergerRemedy } from "@/lib/corporations/mergerReview/lifecycle";
import type { AcquisitionSettlement } from "@/lib/db/types/acquisitionSettlement";
import type { MergerReview } from "@/lib/db/types/mergerReview";
import { MERGER_REVIEWS } from "@/lib/corporations/mergerReview/gate";
import {
  bankTransferConflict,
  hasFundedSovereignEscrow,
  transferBankCharterToAcquirer,
} from "@/lib/banking/transferCharter";
import { withCorpLock } from "@/lib/corporations/corpMoneyLock";
import { buildAcquisitionPayoutPlan } from "./rules/acquisitionPayoutPlan";
import { acquisitionOutcomeOf } from "./rules/subsidiaryOutcome";
import {
  checkSubsidiaryAcquisition,
  equityAlreadyTransferred,
  transferTargetEquityToAcquirer,
} from "./subsidiaryOutcome";
import {
  applyAcquisitionLeg,
  claimAcquisitionSettlement,
  compensateAcquisitionSettlement,
  emitAcquisitionLegLedger,
  legIndexByKey,
  loadAcquisitionSettlement,
  markAcquisitionApplied,
  markAcquisitionProgress,
} from "./acquisitionSettlement";

export interface ExecuteAgreedAcquisitionParams {
  db: Db;
  offer: AcquisitionOffer;
  currentTurn: number;
}

export type ExecuteAgreedAcquisitionResult =
  | { ok: false; error: string; status: number; terminal?: boolean }
  | {
      ok: true;
      sectorsMoved: number;
      priceAnchor: number;
      acquirerName: string;
      targetName: string;
      bankCharterTransferred: boolean;
      /** Present only when the target was kept as a subsidiary. */
      outcome?: AcquisitionOutcome;
    };

/**
 * Execute an accepted agreed acquisition: the acquirer buys the whole target for
 * the agreed price.
 *
 * Money flow (conserved): the acquirer pays the agreed price to the target's
 * shareholders (public-float slice → the equity market pool that paid for it, or
 * the country treasury), then the target's liquid cash relocates to the acquirer
 * and every sector re-parents; the target shell is deleted.
 *
 * Crash safety: amounts and recipients are pinned once per offer in an
 * `acquisitionSettlements` record claimed before money moves; each leg is an
 * atomic credit-plus-stamp write. A retry resumes from the record. Only a
 * permanently unpayable leg ends in terminal compensation (refund of the exact
 * undelivered remainder) and the offer goes to `failed`, never `pending`.
 *
 * The target must have NO outstanding bonds and hold NO equity in other
 * corporations; both are blocked with a clear error.
 *
 * Subsidiary outcome (`offer.outcome === "subsidiary"`): same pinned debit and
 * holder payouts, but the target survives with its sectors, cash, bonds, charter,
 * identity and CEO intact; the acquirer becomes its only shareholder. Bonds and
 * minority cross-holdings are no obstacle, but chaining, ownership cycles, the
 * one-person rule and the subsidiary feature gate are.
 */
export async function executeAgreedAcquisition(
  params: ExecuteAgreedAcquisitionParams
): Promise<ExecuteAgreedAcquisitionResult> {
  // A completed settlement returns its recorded result without touching the
  // world: this is the crash-after-commit path (teardown done, response lost).
  // A compensated settlement is terminal the other way: withdraw/reject or a
  // terminal failure already refunded the undelivered remainder, so execution
  // must NOT resume and pay holders past the closure.
  const completed = await loadAcquisitionSettlement(params.db, params.offer._id);
  if (completed?.status === "applied" && completed.completedResult) {
    // A crash between the commit mark and the claim release leaves the claim on
    // a target that survives (a merge deletes it). Release it now.
    if (completed.outcome === "subsidiary") {
      await releaseAcquisitionTarget(params.db, completed.targetCorporationId, params.offer._id);
    }
    return { ok: true, ...completed.completedResult };
  }
  if (completed?.status === "compensated") {
    return {
      ok: false,
      error: "This acquisition was closed and compensated; open a new offer to try again.",
      status: 409,
      terminal: true,
    };
  }
  // Serialize same-acquirer executions in-process (the hostile path does the
  // same); cross-instance races are still closed by the per-leg stamps.
  return withCorpLock(params.offer.acquirerCorporationId, () => runAgreedAcquisition(params));
}

async function runAgreedAcquisition(
  params: ExecuteAgreedAcquisitionParams
): Promise<ExecuteAgreedAcquisitionResult> {
  const { db, offer, currentTurn } = params;
  const corps = db.collection<Corporation>("corporations");

  const [acquirer, target, stockTaxState] = await Promise.all([
    corps.findOne({ _id: offer.acquirerCorporationId }),
    corps.findOne({ _id: offer.targetCorporationId }),
    db
      .collection<{ _id: string; stockHoldingTaxStartTurn?: number }>("gameState")
      .findOne({ _id: "current" }, { projection: { stockHoldingTaxStartTurn: 1 } }),
  ]);
  if (!acquirer || !target) {
    return handleMissingParty(db, offer, currentTurn, acquirer, target);
  }
  if (acquirer._id.equals(target._id))
    return { ok: false, error: "A corporation cannot acquire itself", status: 400 };
  if (target.countryOwnerId || target.ownershipState === "stateOwned")
    return { ok: false, error: "State-owned corporations cannot be acquired", status: 400 };

  const outcome = acquisitionOutcomeOf(offer);
  const subsidiary = outcome === "subsidiary";
  const priorSettlement = await loadAcquisitionSettlement(db, offer._id);
  if (!priorSettlement) {
    for (const corporation of [acquirer, target]) {
      const restriction = await controllerTransferBarrierError(
        db,
        corporation,
        currentTurn,
        new Date()
      );
      if (restriction) return { ok: false, error: restriction, status: 403 };
    }
    const floor = await referenceValuation(db, target);
    if (offer.priceAnchor < floor.minimumPriceAnchor)
      return {
        ok: false,
        error: `The acquisition price must be at least ₳${floor.minimumPriceAnchor.toLocaleString("en-US")} to cover the target's net assets.`,
        status: 400,
      };
    if (!subsidiary && (floor.debtAnchor > 0 || (target.liquidCapital ?? 0) < 0))
      return {
        ok: false,
        error:
          "The target has outstanding bonds or financing liabilities. Repay them before merging, or acquire it as a subsidiary.",
        status: 400,
      };
    if (!subsidiary && floor.portfolioAnchor > 0)
      return {
        ok: false,
        error:
          "Sell or transfer the target's investment holdings before merging, or acquire it as a subsidiary.",
        status: 400,
      };
  }

  // Subsidiary resume: the structural write of an interrupted run already
  // landed (flag set, or the cap table is the acquirer's alone with a live
  // settlement behind it). Everything that gates a first run is moot; finish
  // the commit tail instead of re-judging a target that is now, correctly, a
  // subsidiary.
  if (
    subsidiary &&
    priorSettlement?.status === "in_progress" &&
    (priorSettlement.equityTransferred === true || equityAlreadyTransferred(target, acquirer._id))
  ) {
    if (!priorSettlement.equityTransferred) {
      await markAcquisitionProgress(db, offer._id, { equityTransferred: true });
      priorSettlement.equityTransferred = true;
    }
    return finishCommitTail(db, priorSettlement, currentTurn);
  }

  if (subsidiary) {
    // The target survives, so its own bonds and minority holdings stay with it.
    const eligibility = await checkSubsidiaryAcquisition(db, acquirer, target);
    if (!eligibility.ok) return { ok: false, error: eligibility.error, status: eligibility.status };
  } else {
    // v1 scope guards — defer bond assumption + cross-holding transfer.
    const openBonds = await db
      .collection<Bond>("bonds")
      .countDocuments({ corporationId: target._id, matured: false });
    if (openBonds > 0)
      return {
        ok: false,
        error:
          "The target has outstanding bonds; acquiring an indebted corporation is not yet supported (have it repay or refinance first).",
        status: 400,
      };
    const targetOwnsEquity = await corps.countDocuments({
      "shareholders.corporationId": target._id,
    });
    if (targetOwnsEquity > 0)
      return {
        ok: false,
        error:
          "The target holds equity in other corporations; acquiring a corporate parent is not yet supported.",
        status: 400,
      };
  }

  // The charter is a sub-document on the target, so deleting the shell would
  // delete its bank with it. Blocked up front, before any money moves.
  // Exception: an interrupted retry whose earlier attempt claimed the slot and
  // crashed before releasing the target. A live settlement owning the run is
  // allowed to resume.
  const bankConflict = subsidiary ? null : bankTransferConflict(target, acquirer);
  if (
    bankConflict &&
    (target.bankPropForexFee ||
      target.bankUnderwritingFunding ||
      hasFundedSovereignEscrow(target) ||
      !(await isOwnInterruptedCharterClaim(db, offer, target, acquirer)))
  ) {
    return { ok: false, error: bankConflict, status: 400 };
  }

  // Merger review (C3). Runs BEFORE any money moves: a referral must leave the
  // two corporations exactly as it found them. A cleared review returns here
  // with the (possibly conditional) clearance attached. Durable per pair, so a
  // retry after a referral sails straight through.
  const clearance = await assertMergerClearance(
    db,
    acquirer,
    target,
    "agreedAcquisition",
    currentTurn
  );
  if (!clearance.ok) return { ok: false, error: clearance.error, status: clearance.status };

  // Subsidiary Limits and Foreign Investment Acts of the target's country.
  const lawRejection =
    (await assertForeignControlAllowed(db, acquirer, target)) ??
    (subsidiary
      ? await assertSubsidiaryWithinCap(db, acquirer, target.countryId, target._id)
      : null);
  if (lawRejection) return { ok: false, error: lawRejection.error, status: lawRejection.status };

  // Only one live settlement may own a target: a second concurrently accepted
  // offer for the same corporation stops here instead of paying holders twice.
  const targetClaim = await corps.updateOne(
    {
      _id: target._id,
      $or: [
        { acquisitionSettlementId: { $exists: false } },
        { acquisitionSettlementId: offer._id },
      ],
    },
    { $set: { acquisitionSettlementId: offer._id, updatedAt: new Date() } }
  );
  if (targetClaim.matchedCount !== 1) {
    const holder = await corps.findOne(
      { _id: target._id },
      { projection: { acquisitionSettlementId: 1 } }
    );
    if (holder?.acquisitionSettlementId && !holder.acquisitionSettlementId.equals(offer._id)) {
      return {
        ok: false,
        error: `Another acquisition of ${target.name} is already in progress.`,
        status: 409,
      };
    }
    return { ok: false, error: "Target corporation no longer exists", status: 404 };
  }

  const now = new Date();
  const [targetSectors, fxByCurrency, acquirerFxRate, targetFxRate] = await Promise.all([
    // A subsidiary keeps its sectors where they are.
    subsidiary
      ? Promise.resolve<CorporateSector[]>([])
      : db
          .collection<CorporateSector>("corporateSectors")
          .find({ corporationId: target._id })
          .toArray(),
    loadFxRatesByCurrency(db),
    getCorpFxRate(db, acquirer),
    getCorpFxRate(db, target),
  ]);
  const acquirerCurrency = resolveCorpLiquidCurrencyCode(acquirer);
  const targetCurrency = resolveCorpLiquidCurrencyCode(target);

  // Subsidiary, first attempt only: open orders, listings and pending offers on
  // the target's shares are cancelled and refunded BEFORE the cap table is
  // read. A resting sell order has already debited its seller's holding, so
  // an allocation read over it would leave those shares unpaid and then erase
  // them. Refuse an unaffordable offer first so a doomed attempt cancels
  // nothing. A retry has a pinned plan and must not re-read the cap table.
  let planTarget: Corporation = target;
  if (subsidiary && !priorSettlement) {
    const affordable = Math.round(
      anchorToCorpLiquidCapital(offer.priceAnchor, acquirer, acquirerFxRate)
    );
    if ((acquirer.liquidCapital ?? 0) < affordable) {
      await releaseAcquisitionTarget(db, target._id, offer._id);
      return {
        ok: false,
        error: `Insufficient corporate funds. Need ${affordable.toLocaleString()} ${
          acquirerCurrency ?? "USD"
        } to complete the acquisition.`,
        status: 400,
      };
    }
    await cleanupShareMarketActivityForCorporationTargets(
      db,
      [target._id],
      now,
      await isForexEnabled()
    );
    planTarget = (await corps.findOne({ _id: target._id })) ?? target;
  }

  // 1. Pin the payout plan: allocate the pool, resolve every recipient's
  // currency, and freeze every amount. A retry replays these legs verbatim.
  const allocation =
    offer.priceAnchor > 0
      ? allocateShareholderPool(planTarget, offer.priceAnchor, new Map())
      : null;
  const charIds = (allocation?.characterRows ?? [])
    .filter((r) => !r.isImperial && r.payout > 0)
    .map((r) => new ObjectId(r.characterId));
  const imperialIds = (allocation?.characterRows ?? [])
    .filter((r) => r.isImperial && r.payout > 0)
    .map((r) => new ObjectId(r.characterId));
  const creditorIds = (allocation?.corporationRows ?? [])
    .filter((r) => r.payout > 0)
    .map((r) => new ObjectId(r.corporationId));
  const fundIds = (allocation?.fundRows ?? [])
    .filter((r) => r.payout > 0)
    .map((r) => new ObjectId(r.fundId));
  const nppIds = (allocation?.nppRows ?? [])
    .filter((r) => r.payout > 0)
    .map((r) => new ObjectId(r.nppId));
  const floatPaid = Boolean(allocation?.publicFloatRow && allocation.publicFloatRow.payout > 0);
  const [chars, imperials, creditors, funds, npps, treasury, equityPool] = await Promise.all([
    charIds.length > 0
      ? db
          .collection<Character>("characters")
          .find({ _id: { $in: charIds } })
          .toArray()
      : [],
    imperialIds.length > 0
      ? db
          .collection<ImperialCharacter>("imperialCharacters")
          .find({ _id: { $in: imperialIds } })
          .toArray()
      : [],
    creditorIds.length > 0
      ? db
          .collection<Corporation>("corporations")
          .find({ _id: { $in: creditorIds } })
          .toArray()
      : [],
    fundIds.length > 0
      ? db
          .collection<IndexFund>("indexFunds")
          .find({ _id: { $in: fundIds } })
          .toArray()
      : [],
    nppIds.length > 0
      ? db
          .collection("npps")
          .find({ _id: { $in: nppIds } }, { projection: { _id: 1 } })
          .toArray()
      : [],
    floatPaid
      ? db
          .collection<FederalBudget>("federalBudget")
          .findOne({ countryId: target.countryId }, { projection: { _id: 1 } })
      : null,
    floatPaid
      ? db
          .collection<EquityMarketPool>(EQUITY_MARKET_POOLS_COLLECTION)
          .findOne({ _id: equityPoolCurrency(target) }, { projection: { _id: 1 } })
      : null,
  ]);
  const currencyByHolderHex: Record<string, string> = {};
  for (const c of [...chars, ...imperials])
    currencyByHolderHex[c._id.toString()] = getHomeCurrency(c);
  const creditorByHolderHex: Record<
    string,
    { liquidCurrencyCode?: string | null; countryId?: string | null }
  > = {};
  for (const c of creditors) {
    creditorByHolderHex[c._id.toString()] = {
      liquidCurrencyCode: c.liquidCurrencyCode ?? null,
      countryId: (c.countryId as string | null) ?? null,
    };
  }
  const fxRecord: Record<string, number> = Object.fromEntries(fxByCurrency.entries());
  const forexEnabled = await isForexEnabled();

  const priceInAcquirerCapital = Math.round(
    anchorToCorpLiquidCapital(offer.priceAnchor, acquirer, acquirerFxRate)
  );
  // A subsidiary keeps its own cash: nothing relocates to the acquirer.
  const targetCashAnchor = subsidiary
    ? 0
    : corpLiquidCapitalToAnchor(
        (target.liquidCapital ?? 0) + Math.max(0, target.shareEscrowBalance ?? 0),
        target,
        targetFxRate
      );
  const shellCashInAcquirerCapital =
    targetCashAnchor > 0
      ? Math.round(anchorToCorpLiquidCapital(targetCashAnchor, acquirer, acquirerFxRate))
      : 0;
  const plan = buildAcquisitionPayoutPlan({
    ...(stockTaxState?.stockHoldingTaxStartTurn !== undefined &&
    currentTurn >= stockTaxState.stockHoldingTaxStartTurn
      ? {
          stockTax: {
            saleTurn: currentTurn,
            holdingsByOwner: Object.fromEntries(
              (target.shareholders ?? []).flatMap((holder) => {
                const owner = holder.characterId
                  ? "character:" + holder.characterId.toHexString()
                  : holder.imperialCharacterId
                    ? "imperial:" + holder.imperialCharacterId.toHexString()
                    : undefined;
                return owner && holder.shares > 0
                  ? [
                      [
                        owner,
                        positionHoldingTerms(
                          anchorHoldingPosition(holder, targetFxRate),
                          currentTurn,
                          corpLiquidCapitalToAnchor(target.sharePrice ?? 0, target, targetFxRate)
                        ),
                      ],
                    ]
                  : [];
              })
            ),
          },
        }
      : {}),
    offerHex: offer._id.toString(),
    priceAnchor: offer.priceAnchor,
    priceInAcquirerCapital,
    acquirerHex: acquirer._id.toString(),
    acquirerName: acquirer.name,
    acquirerCurrency: acquirerCurrency ?? "USD",
    acquirerForCost: {
      liquidCurrencyCode: acquirer.liquidCurrencyCode ?? null,
      countryId: (acquirer.countryId as string | null) ?? null,
    },
    acquirerFxRate,
    targetHex: target._id.toString(),
    targetName: target.name,
    targetCountryId: target.countryId as string,
    targetLiquidCurrencyCode: target.liquidCurrencyCode ?? null,
    allocation: allocation ?? {
      characterRows: [],
      corporationRows: [],
      fundRows: [],
      nppRows: [],
      publicFloatRow: null,
    },
    currencyByHolderHex,
    creditorByHolderHex,
    fundsPresentHex: funds.map((f) => f._id.toString()),
    nppsPresentHex: npps.map((n) => n._id.toString()),
    treasuryPresent: treasury != null,
    equityPoolPresent: equityPool != null,
    fxByCurrency: fxRecord,
    forexEnabled,
    shellCashAnchor: targetCashAnchor,
    shellCashInAcquirerCapital,
    shellCashTargetLocal: subsidiary
      ? 0
      : Math.round((target.liquidCapital ?? 0) + Math.max(0, target.shareEscrowBalance ?? 0)),
    targetCurrency: targetCurrency ?? "USD",
    ...(subsidiary ? { outcome } : {}),
  });

  const { settlement, fresh } = await claimAcquisitionSettlement(db, {
    offerId: offer._id,
    acquirerHex: acquirer._id.toString(),
    targetHex: target._id.toString(),
    acquirerName: acquirer.name,
    targetName: target.name,
    priceAnchor: offer.priceAnchor,
    priceInAcquirerCapital,
    acquirerCurrency: acquirerCurrency ?? "USD",
    shellCashTargetLocal: subsidiary
      ? 0
      : Math.round((target.liquidCapital ?? 0) + Math.max(0, target.shareEscrowBalance ?? 0)),
    targetCurrency: targetCurrency ?? "USD",
    ...(subsidiary ? { outcome } : {}),
    // First-attempt sector count: this read precedes every move, so on the
    // claiming attempt it is the true total. On retry it is only the
    // remainder and the claim discards it in favor of the pinned value.
    sectorTotal: targetSectors.length,
    remedyReviewId: clearance.review?._id.toString(),
    plan,
  });

  // The target corporation is deleted and its sites move to the acquirer, so a
  // secured construction loan moves with its site: the acquirer becomes the
  // borrower and keeps servicing it. Checked and locked before any money moves.
  // Its ordinary bank loans move with it the same way, checked here too.
  let constructionTransfers = emptyConstructionBorrowerTransferPlan();
  if (!subsidiary) {
    const mergeRefusal =
      (await securedSiteMergeRefusal(db, targetSectors, acquirer._id)) ??
      (await corporateLoanAssumptionCheck(db, {
        fromId: target._id,
        toCurrency: acquirerCurrency ?? undefined,
      }));
    const prepared = mergeRefusal
      ? ({ ok: false, error: mergeRefusal } as const)
      : await prepareConstructionBorrowerTransfers(db, {
          sectors: targetSectors,
          toId: acquirer._id,
          toCurrency: acquirerCurrency,
          operationKey: `acquisition:${offer._id.toHexString()}`,
          turn: currentTurn,
        });
    if (!prepared.ok) {
      if (fresh) await releaseAcquisitionTarget(db, target._id, offer._id);
      return { ok: false, error: prepared.error, status: 409 };
    }
    constructionTransfers = prepared.plan;
  }

  // A pinned plan from an earlier attempt rules: on replay the recorded legs
  // are the only amounts ever applied, never the recomputed plan above. A
  // compensated record (withdraw/reject raced the retry) closes the run here.
  if (!fresh && settlement.status === "compensated") {
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
    return {
      ok: false,
      error: "This acquisition was closed and compensated; open a new offer to try again.",
      status: 409,
      terminal: true,
    };
  }
  if (fresh && plan.unpayable.length > 0) {
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
    const first = plan.unpayable[0];
    const reason = `holder ${first.key} is gone (${first.reason})`;
    await compensateAcquisitionSettlement(db, settlement, {
      targetHex: target._id.toString(),
      turn: currentTurn,
      now: new Date(),
      reason,
    });
    await releaseAcquisitionTarget(db, target._id, offer._id);
    return {
      ok: false,
      error:
        `Acquisition cannot complete: ${reason}. No money moved. ` +
        `This offer is closed; open a new offer to try again.`,
      status: 500,
      terminal: true,
    };
  }

  const applyStep = async (key: string): Promise<void> => {
    const index = legIndexByKey(settlement, key);
    if (index < 0) return;
    const outcome = await applyAcquisitionLeg(db, settlement, index, now);
    if (outcome === "guard_failed") {
      throw new InsufficientAcquisitionFunds(settlement.priceInAcquirerCapital);
    }
    if (outcome === "unpayable") {
      throw new UnpayableAcquisitionLeg(settlement.legs[index].key, settlement.legs[index].note);
    }
    await emitAcquisitionLegLedger(db, settlement, index, currentTurn, now);
  };

  try {
    // 2. Debit the acquirer the agreed price. Atomic, balance-gated, stamped:
    // a replay finds the stamp and moves nothing.
    try {
      await applyStep("debit");
    } catch (err) {
      if (err instanceof InsufficientAcquisitionFunds) {
        return {
          ok: false,
          error: `Insufficient corporate funds. Need ${settlement.priceInAcquirerCapital.toLocaleString()} ${
            acquirerCurrency ?? "USD"
          } to complete the acquisition.`,
          status: 400,
        };
      }
      throw err;
    }

    if (subsidiary) {
      // 3s. Pay the target's former holders from the pinned legs.
      if (offer.priceAnchor > 0) {
        for (const leg of settlement.legs) {
          if (leg.kind !== "holder_credit") continue;
          await applyStep(leg.key);
        }
      }
      // 4s. Only now, with every holder paid, change who owns the shares.
      const transferred = await transferTargetEquityToAcquirer(db, {
        targetId: target._id,
        acquirerId: acquirer._id,
        offerId: offer._id,
        priceAnchor: offer.priceAnchor,
        turn: currentTurn,
        now,
      });
      if (!transferred) {
        // Holders are paid and the cap table moved under us. Never guess: the
        // retry re-judges the target and, if it is gone, compensates.
        throw new Error("Acquisition could not take the target's equity; retry the offer");
      }
      await markAcquisitionProgress(db, offer._id, { equityTransferred: true });
      settlement.equityTransferred = true;
      return finishCommitTail(db, settlement, currentTurn);
    }

    // 3. Move the bank charter before any payout: a conflict unwinds cleanly (nothing paid yet). Skip if already transferred so retries don't move twice; crash windows inside the transfer are its own recovery concern.
    const bankTransfer = settlement.bankCharterTransferred
      ? { ok: true as const, transferred: true }
      : await transferBankCharterToAcquirer(db, target._id, acquirer._id, now);
    if (!bankTransfer.ok) return { ok: false, error: bankTransfer.error, status: 500 };
    await markAcquisitionProgress(db, offer._id, {
      bankCharterTransferred: bankTransfer.transferred,
    });
    settlement.bankCharterTransferred = bankTransfer.transferred;

    // 4. Pay the target's shareholders from the pinned legs. Each leg is
    // replay-safe on its own; a permanently missing recipient compensates.
    if (offer.priceAnchor > 0) {
      for (const leg of settlement.legs) {
        if (leg.kind !== "holder_credit") continue;
        await applyStep(leg.key);
      }
    }

    // 5. Fold the target's liquid cash into the acquirer (it now owns the
    // company, cash included). Stamped like any other leg.
    await applyStep("shell-cash");

    // 6. Move each sector to the acquirer (haircut-free, re-denominated). Resumable by re-read: moved sectors no longer belong to target. Total derives from pinned claim-time count minus remaining, so crashed attempts still count.
    for (const sector of targetSectors) {
      await moveSectorToCorp(
        db,
        sector,
        acquirer._id,
        targetCurrency,
        targetFxRate,
        acquirerCurrency,
        acquirerFxRate,
        now,
        constructionTransfers
      );
    }
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
    const sectorsRemain = await db
      .collection<CorporateSector>("corporateSectors")
      .countDocuments({ corporationId: target._id });
    if (sectorsRemain > 0) {
      throw new Error(
        `Acquisition cannot delete target while ${sectorsRemain} sector property row(s) remain`
      );
    }
    const sectorsMovedTotal = settlement.sectorTotal - sectorsRemain;
    await markAcquisitionProgress(db, offer._id, { sectorsMoved: sectorsMovedTotal });
    settlement.sectorsMoved = sectorsMovedTotal;

    // 7. The acquirer now owes the target's ordinary bank loans. Moved after
    // every step that can fail and before the delete, so a retry still finds
    // any that are left on the target.
    await assumeCorporateLoans(db, { fromId: target._id, toId: acquirer._id });

    // 8. Tear down the target shell.
    const forexEnabledNow = await isForexEnabled();
    await cleanupShareMarketActivityForCorporations(db, [target._id], now, forexEnabledNow);
    await stampSubjectDeleted(db, target._id, {
      sequentialId: target.sequentialId,
      deletedAt: now,
    });
    // Record the exit BEFORE the delete, strictly: the upsert is idempotent per
    // corporation, and a crash after the delete would leave a resume with no
    // target document to snapshot.
    await recordCorporationExit(db, target, {
      reason: "acquired",
      successorId: acquirer._id,
      now,
      strict: true,
    });
    await corps.deleteOne({ _id: target._id });
    await markAcquisitionProgress(db, offer._id, { shellDeleted: true });
    settlement.shellDeleted = true;

    // A conditional clearance becomes a live divestiture order only now that the
    // merger has actually committed.
    if (clearance.review) await attachMergerRemedy(db, clearance.review, acquirer._id, currentTurn);

    const result = {
      sectorsMoved: settlement.sectorsMoved,
      priceAnchor: offer.priceAnchor,
      acquirerName: acquirer.name,
      targetName: target.name,
      bankCharterTransferred: bankTransfer.transferred,
    };
    await markAcquisitionApplied(db, settlement, result);

    recordAudit({
      source: "api",
      action: "acquisition.execute",
      category: "corp",
      turn: currentTurn,
      ts: now,
      subject: { type: "corporation", id: acquirer._id, name: acquirer.name },
      refs: { corporationId: acquirer._id },
      outcome: "ok",
      meta: {
        offerId: offer._id,
        targetCorporationId: target._id,
        targetName: target.name,
        priceAnchor: offer.priceAnchor,
        sectorsMoved: settlement.sectorsMoved,
      },
    });

    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof UnpayableAcquisitionLeg) {
      const reason = `holder ${err.legKey} is gone (${err.note})`;
      await compensateAcquisitionSettlement(db, settlement, {
        targetHex: target._id.toString(),
        turn: currentTurn,
        now: new Date(),
        reason,
      });
      await releaseAcquisitionTarget(db, target._id, offer._id);
      return {
        ok: false,
        error:
          `Acquisition cannot complete: ${reason}. Delivered payouts stand and cannot be clawed back; ` +
          `the acquirer was refunded the undelivered remainder. This offer is closed; open a new offer to try again.`,
        status: 500,
        terminal: true,
      };
    }
    throw err;
  } finally {
    // Every loan follows only a site that actually moved; the rest keep their
    // borrower. Either way no lock outlives this attempt.
    await settleConstructionBorrowerTransfers(db, constructionTransfers);
  }
}

class InsufficientAcquisitionFunds extends Error {
  constructor(readonly needed: number) {
    super("Insufficient corporate funds");
    this.name = "InsufficientAcquisitionFunds";
  }
}

class UnpayableAcquisitionLeg extends Error {
  constructor(
    readonly legKey: string,
    readonly note: string
  ) {
    super(`unpayable leg ${legKey}`);
    this.name = "UnpayableAcquisitionLeg";
  }
}

/**
 * True when the bank conflict above is our own interrupted charter move: the
 * slot holds the target's charter by identity and a live settlement for this
 * offer owns the run. Anything else (genuinely different bank, no settlement)
 * stays blocked.
 */
async function isOwnInterruptedCharterClaim(
  db: Db,
  offer: AcquisitionOffer,
  target: Corporation,
  acquirer: Corporation
): Promise<boolean> {
  const targetCharter = target.bankCharter;
  const slotCharter = acquirer.bankCharter;
  if (!targetCharter || !slotCharter) return false;
  const sameIdentity =
    slotCharter.currency === targetCharter.currency &&
    slotCharter.charteredTurn === targetCharter.charteredTurn &&
    slotCharter.type === targetCharter.type &&
    slotCharter.status === targetCharter.status;
  if (!sameIdentity) return false;
  const settlement = await loadAcquisitionSettlement(db, offer._id);
  return (
    settlement != null &&
    settlement.status === "in_progress" &&
    !settlement.bankCharterTransferred &&
    settlement.targetCorporationId.equals(target._id) &&
    settlement.acquirerCorporationId.equals(acquirer._id)
  );
}

async function releaseAcquisitionTarget(
  db: Db,
  targetId: ObjectId,
  offerId: ObjectId
): Promise<void> {
  await db
    .collection<Corporation>("corporations")
    .updateOne(
      { _id: targetId, acquisitionSettlementId: offerId },
      { $unset: { acquisitionSettlementId: "" }, $set: { updatedAt: new Date() } }
    );
}

/**
 * One party vanished. With no settlement this is the legacy 404; with a live
 * one the money decides: a crash between shell delete and commit mark finishes
 * the tail, anything earlier compensates what landed and closes the offer.
 */
async function handleMissingParty(
  db: Db,
  offer: AcquisitionOffer,
  currentTurn: number,
  acquirer: Corporation | null,
  target: Corporation | null
): Promise<ExecuteAgreedAcquisitionResult> {
  const settlement = await loadAcquisitionSettlement(db, offer._id);
  if (settlement?.status === "applied" && settlement.completedResult) {
    return { ok: true, ...settlement.completedResult };
  }
  // Closed by compensation (withdraw/reject/terminal failure): report the
  // closure instead of compensating twice or resuming past it.
  if (settlement?.status === "compensated") {
    return {
      ok: false,
      error: "This acquisition was closed and compensated; open a new offer to try again.",
      status: 409,
      terminal: true,
    };
  }
  if (settlement && settlement.status === "in_progress") {
    if (settlement.shellDeleted) {
      return finishCommitTail(db, settlement, currentTurn);
    }
    const moneyLegs = settlement.legs.filter(
      (leg) =>
        leg.kind === "acquirer_debit" ||
        leg.kind === "holder_credit" ||
        leg.kind === "shell_cash_credit"
    );
    const moneyDone = moneyLegs.every((leg) => leg.applied);
    const sectorsRemain = target
      ? await db
          .collection<CorporateSector>("corporateSectors")
          .countDocuments({ corporationId: target._id })
      : 0;
    // Target gone, money fully delivered, nothing left to move: the crash
    // landed between the shell delete and its flag. Finish the tail.
    if (!target && moneyDone && sectorsRemain === 0 && settlement.outcome !== "subsidiary") {
      await markAcquisitionProgress(db, offer._id, { shellDeleted: true });
      settlement.shellDeleted = true;
      return finishCommitTail(db, settlement, currentTurn);
    }
    const reason = !target
      ? "the target corporation was removed mid-execution"
      : "the acquiring corporation was removed mid-execution";
    await compensateAcquisitionSettlement(db, settlement, {
      targetHex: target?._id.toString() ?? null,
      turn: currentTurn,
      now: new Date(),
      reason,
    });
    if (target) await releaseAcquisitionTarget(db, target._id, offer._id);
    return {
      ok: false,
      error: !acquirer
        ? "Acquiring corporation no longer exists"
        : "Target corporation no longer exists",
      status: 404,
      terminal: true,
    };
  }
  if (!acquirer) return { ok: false, error: "Acquiring corporation no longer exists", status: 404 };
  return { ok: false, error: "Target corporation no longer exists", status: 404 };
}

/**
 * Post-teardown tail: remedy (re-runnable), commit mark, recorded result. For a
 * subsidiary this is also where the audit row is written and the target claim
 * is released, because the target outlives the settlement.
 */
async function finishCommitTail(
  db: Db,
  settlement: AcquisitionSettlement,
  currentTurn: number
): Promise<ExecuteAgreedAcquisitionResult> {
  if (settlement.remedyReviewId) {
    const review = await db
      .collection<MergerReview>(MERGER_REVIEWS)
      .findOne({ _id: new ObjectId(settlement.remedyReviewId) });
    if (review) {
      await attachMergerRemedy(db, review, settlement.acquirerCorporationId, currentTurn);
    }
  }
  const subsidiary = settlement.outcome === "subsidiary";
  const result = {
    sectorsMoved: settlement.sectorsMoved,
    priceAnchor: settlement.priceAnchor,
    acquirerName: settlement.acquirerName,
    targetName: settlement.targetName,
    bankCharterTransferred: settlement.bankCharterTransferred,
    ...(subsidiary ? { outcome: "subsidiary" as const } : {}),
  };
  await markAcquisitionApplied(db, settlement, result);
  if (subsidiary) {
    await releaseAcquisitionTarget(db, settlement.targetCorporationId, settlement._id);
    recordAudit({
      source: "api",
      action: "acquisition.execute",
      category: "corp",
      turn: currentTurn,
      ts: new Date(),
      subject: {
        type: "corporation",
        id: settlement.acquirerCorporationId,
        name: settlement.acquirerName,
      },
      refs: { corporationId: settlement.acquirerCorporationId },
      outcome: "ok",
      meta: {
        offerId: settlement._id,
        targetCorporationId: settlement.targetCorporationId,
        targetName: settlement.targetName,
        priceAnchor: settlement.priceAnchor,
        acquisitionOutcome: "subsidiary",
      },
    });
  }
  return { ok: true, ...result };
}
