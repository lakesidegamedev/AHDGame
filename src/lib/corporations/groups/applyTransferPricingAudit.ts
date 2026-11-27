import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import { afterCommit } from "@/lib/db/sessionDb";
/**
 * Accrue transfer-pricing exposure on intra-group cross-border supply
 * agreements, and assess the ones that cross the threshold.
 *
 * Exposure lives on the agreement document (`transferPricingExposureAnchor`),
 * so a position that is unwound before it matures simply stops accruing — the
 * player who prices aggressively for a few turns and then returns to market has
 * taken a real risk and got away with it, which is the intended shape.
 */

import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { SupplyAgreement } from "@/lib/db/types/supplyAgreement";
import type { CountryId } from "@/lib/constants/countries";
import type { SettledPremium } from "@/lib/turn/corporation/settleSupplyAgreements";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { atomicallyDebitCorpLiquidCapital } from "@/lib/financialTxLog/atomicCashGuard";
import { emitTx } from "@/lib/financialTxLog/emit";
import {
  collectFundedCorporationPayment,
  creditTreasuryProceedsFromAnchor,
} from "@/lib/nationalization/treasury";
import { createNotification } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit/recordAudit";
import { resolveFormalizedGroups } from "./groupMembership";
import {
  assessIfDue,
  TRANSFER_PRICING_AUDIT_THRESHOLD_ANCHOR,
  isTransferPricingPosition,
  shiftDirection,
  type IntraGroupPosition,
} from "./transferPricing";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { supplyAgreementsCollection } from "@/lib/db/repositories/supplyAgreements";

export interface TransferPricingResult {
  positionsTracked: number;
  auditsAssessed: number;
  totalAssessedAnchor: number;
  errors: string[];
}

export async function applyTransferPricingAudit(
  db: Db,
  settledPremiums: SettledPremium[],
  corporateTaxRateByCountry: ReadonlyMap<string, number>,
  currentTurn: number,
  now: Date
): Promise<TransferPricingResult> {
  const result: TransferPricingResult = {
    positionsTracked: 0,
    auditsAssessed: 0,
    totalAssessedAnchor: 0,
    errors: [],
  };

  const membership = await resolveFormalizedGroups(db);

  const corpIds = new Set<string>();
  for (const p of settledPremiums) {
    corpIds.add(p.supplierCorpId);
    corpIds.add(p.buyerCorpId);
  }
  const corps = await corporationsCollection(db)
    .find({ _id: { $in: [...corpIds].map((id) => new ObjectId(id)) } })
    .project<Pick<Corporation, "_id" | "name" | "countryId" | "userId" | "liquidCurrencyCode">>({
      name: 1,
      countryId: 1,
      userId: 1,
      liquidCurrencyCode: 1,
    })
    .toArray();
  const corpById = new Map(corps.map((c) => [c._id.toString(), c]));

  const tracked: Array<{
    premium: SettledPremium;
    shift: NonNullable<ReturnType<typeof shiftDirection>>;
  }> = [];
  for (const premium of settledPremiums) {
    const supplier = corpById.get(premium.supplierCorpId);
    const buyer = corpById.get(premium.buyerCorpId);
    if (!supplier || !buyer) continue;

    const sameGroup =
      membership.rootByCorpId.get(premium.supplierCorpId) ===
      membership.rootByCorpId.get(premium.buyerCorpId);

    const position: IntraGroupPosition = {
      agreementId: premium.agreementId,
      supplierCorpId: premium.supplierCorpId,
      buyerCorpId: premium.buyerCorpId,
      supplierCountryId: supplier.countryId,
      buyerCountryId: buyer.countryId,
      pricePremium: premium.pricePremium,
      premiumAnchor: premium.premiumAnchor,
    };
    if (!isTransferPricingPosition(position, sameGroup)) continue;

    const shift = shiftDirection(position);
    if (!shift) continue;
    result.positionsTracked += 1;
    tracked.push({ premium, shift });
  }

  // Accruals are independent additive writes. Applying them one at a time made
  // this stage one network round trip per live intra-group agreement, which can
  // reach thousands in mature worlds. An ordered bulk preserves input order,
  // and the projected read supplies the same post-accrual exposure used below.

  const accrualOps: AnyBulkWriteOperation<SupplyAgreement>[] = tracked.map(
    ({ premium, shift }) => ({
      updateOne: {
        filter: {
          _id: new ObjectId(premium.agreementId),
          transferPricingAccruedTurn: { $ne: currentTurn },
        },
        update: {
          $inc: { transferPricingExposureAnchor: shift.shiftedBaseAnchor },
          $set: {
            updatedAt: now,
            transferPricingAccruedTurn: currentTurn,
            transferPricingClaim: {
              liableCorpId: shift.gainerCorpId,
              claimantCountryId: shift.claimantCountryId,
            },
          },
        },
      },
    })
  );
  if (accrualOps.length)
    await supplyAgreementsCollection<SupplyAgreement>(db).bulkWrite(accrualOps, { ordered: true });
  const due = await supplyAgreementsCollection(db)
    .find(
      {
        $or: [
          { _id: { $in: tracked.map(({ premium }) => new ObjectId(premium.agreementId)) } },
          { transferPricingPendingAssessment: { $exists: true } },
          {
            transferPricingExposureAnchor: { $gte: TRANSFER_PRICING_AUDIT_THRESHOLD_ANCHOR },
            transferPricingClaim: { $exists: true },
          },
        ],
      },
      {
        projection: {
          transferPricingExposureAnchor: 1,
          transferPricingClaim: 1,
          transferPricingPendingAssessment: 1,
        },
      }
    )
    .toArray();
  for (const candidate of due) {
    if (!candidate.transferPricingClaim && !candidate.transferPricingPendingAssessment) continue;
    try {
      const outcome = await withTurnValueSettlement(
        db,
        "transfer-pricing-audit",
        currentTurn,
        async (tx) => {
          const agreement = await supplyAgreementsCollection(tx).findOne({ _id: candidate._id });
          if (!agreement) return null;
          const claim = agreement.transferPricingClaim;
          const assessment =
            agreement.transferPricingPendingAssessment ??
            (claim &&
              assessIfDue({
                agreementId: agreement._id.toHexString(),
                gainerCorpId: claim.liableCorpId,
                claimantCountryId: claim.claimantCountryId,
                accruedExposureAnchor: agreement.transferPricingExposureAnchor ?? 0,
                effectiveTaxRate:
                  (corporateTaxRateByCountry.get(claim.claimantCountryId) ?? 0) / 100,
              }));
          if (!assessment) return null;
          const liable = await corporationsCollection(tx).findOne({
            _id: new ObjectId(assessment.liableCorpId),
          });
          if (!liable) return null;
          if (!agreement.transferPricingPendingAssessment) {
            await supplyAgreementsCollection(tx).updateOne(
              { _id: agreement._id },
              {
                $inc: { transferPricingExposureAnchor: -assessment.shiftedBaseAnchor },
                $set: { transferPricingPendingAssessment: assessment, updatedAt: now },
              }
            );
          }
          const fxRate = await getCorpFxRate(tx, liable);
          const localAmount = Math.round(
            anchorToCorpLiquidCapital(assessment.assessmentAnchor, liable, fxRate)
          );
          if (!(localAmount > 0) || !Number.isFinite(localAmount)) return null;
          const fundedPaid = await collectFundedCorporationPayment(tx, {
            countryId: assessment.claimantCountryId as CountryId,
            corpId: liable._id,
            corpCurrency: resolveCorpLiquidCurrencyCode(liable) ?? "USD",
            amountLocal: localAmount,
            key: `transfer-pricing:${agreement._id}:${currentTurn}`,
            now,
            flow: "regulatory_fine",
            site: "transferPricing:applyAudit",
          });
          let collected = fundedPaid !== null && fundedPaid > 0;
          if (fundedPaid === null) {
            const debit = await atomicallyDebitCorpLiquidCapital(tx, liable._id, localAmount, {
              corporateObligation: true,
            });
            collected = debit.ok;
            if (collected)
              await creditTreasuryProceedsFromAnchor(
                tx,
                assessment.claimantCountryId as CountryId,
                corpLiquidCapitalToAnchor(localAmount, liable, fxRate),
                now,
                { flow: "regulatory_fine" }
              );
          }
          if (!collected) return null;
          await emitTx(tx, {
            type: "corp_fine",
            turn: currentTurn,
            createdAt: now,
            subjectType: "corporation",
            subjectId: liable._id,
            subjectName: liable.name,
            amount: -localAmount,
            currencyCode: resolveCorpLiquidCurrencyCode(liable) ?? "USD",
            counterpartyType: "government",
            counterpartyName: `${assessment.claimantCountryId} treasury`,
            meta: {
              kind: "transfer_pricing_assessment",
              agreementId: agreement._id.toHexString(),
              shiftedBaseAnchor: assessment.shiftedBaseAnchor,
              assessmentAnchor: assessment.assessmentAnchor,
            },
          });
          await supplyAgreementsCollection(tx).updateOne(
            { _id: agreement._id },
            {
              $unset: { transferPricingPendingAssessment: "" },
              $set: { lastTransferPricingAuditTurn: currentTurn, updatedAt: now },
            }
          );
          await afterCommit(tx, async () => {
            if (liable.userId)
              await createNotification({
                userId: liable.userId,
                type: "transfer_pricing_assessed",
                title: "Transfer pricing assessment",
                message: `${assessment.claimantCountryId} collected an intra-group transfer pricing assessment from ${liable.name}.`,
                metadata: { corporationId: liable._id.toHexString() },
              });
            recordAudit({
              source: "turn",
              action: "corp.transfer_pricing_assessment",
              category: "corp",
              turn: currentTurn,
              ts: now,
              subject: { type: "corporation", id: liable._id, name: liable.name },
              refs: { corporationId: liable._id },
              outcome: "ok",
              meta: {
                agreementId: agreement._id.toHexString(),
                assessmentAnchor: assessment.assessmentAnchor,
                collectedLocal: localAmount,
              },
            });
          });
          return assessment.assessmentAnchor;
        },
        { sourceKey: `${currentTurn}:${candidate._id}` }
      );
      if (outcome) {
        result.auditsAssessed++;
        result.totalAssessedAnchor += outcome;
      }
    } catch (error) {
      result.errors.push(
        `transfer pricing ${candidate._id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return result;
}
