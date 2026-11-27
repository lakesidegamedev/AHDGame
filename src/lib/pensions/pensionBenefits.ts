import { loadFxRatesByCurrency, requireCurrencyRate } from "@/lib/currency/corporationCapital";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
/**
 * A8 phase 2, part A: benefits in payment.
 *
 * Union membership is modelled in aggregate, so there is no member to pay.
 * A retiring player character is deleted by `retireCharacter`, which
 * removes the wallet a benefit could be credited to. Benefits are a flow
 * paid to the modelled covered workforce, ledgered against
 * `counterpartyType: "system"`. The scheme's assets fall by what it
 * pays; nothing is created.
 *
 * Benefits are paid from CASH. When cash is short every pensioner takes
 * the same proportional cut and the unpaid claim stays on the books.
 * See `pensionBenefitPayment` for why the scheme never overdraws.
 */

import type { Db } from "mongodb";
import type { PensionScheme } from "@/lib/db/types/pensionScheme";
import { emitTx } from "@/lib/financialTxLog/emit";
import {
  pensionBenefitPayment,
  pensionBenefitsDueForTurn,
  pensionRetirementsForTurn,
} from "./rules";
import { pensionSchemesCollection } from "@/lib/db/repositories/pensionSchemes";

export interface PensionBenefitsResult {
  schemesPaying: number;
  retirementsAnchor: number;
  benefitsPaidAnchor: number;
  /** Benefits that fell due against assets that were not there. */
  benefitsUnpaidAnchor: number;
  /** Schemes that had to cut. The visible face of underfunding. */
  schemesCutting: number;
  errors: string[];
}

/**
 * Retire claims, then pay this turn's benefits, for every scheme that has one.
 *
 * Order matters: claims retire BEFORE the drawdown is computed, so a scheme's
 * first pensioners start drawing the turn they retire rather than a turn later,
 * and the buffer the investment pass reserves is sized off the up-to-date
 * in-payment stock.
 */
export async function runPensionBenefitsTurn(
  db: Db,
  currentTurn: number,
  _rerunSafe = false
): Promise<PensionBenefitsResult> {
  const result: PensionBenefitsResult = {
    schemesPaying: 0,
    retirementsAnchor: 0,
    benefitsPaidAnchor: 0,
    benefitsUnpaidAnchor: 0,
    schemesCutting: 0,
    errors: [],
  };

  const schemes = await pensionSchemesCollection<PensionScheme>(db)
    .find({
      liabilitiesAnchor: { $gt: 0 },
      $or: [{ lastBenefitTurn: { $lt: currentTurn } }, { lastBenefitTurn: { $exists: false } }],
    })
    .toArray();
  if (schemes.length === 0) return result;
  const receiptRate = (await loadFxRatesByCurrency(db)).get("USD");

  for (const candidate of schemes) {
    try {
      const accepted = await withTurnValueSettlement(
        db,
        "pension-benefits",
        currentTurn,
        async (db) => {
          const scheme = await pensionSchemesCollection<PensionScheme>(db).findOne({
            _id: candidate._id,
          });
          if (
            !scheme ||
            (scheme.lastBenefitTurn ?? -1) >= currentTurn ||
            scheme.liabilitiesAnchor <= 0
          )
            return null;
          const inPaymentBefore = scheme.benefitsInPaymentAnchor ?? 0;

          const retirements = pensionRetirementsForTurn({
            liabilitiesAnchor: scheme.liabilitiesAnchor,
            benefitsInPaymentAnchor: inPaymentBefore,
          });
          const inPayment = inPaymentBefore + retirements;

          const due = pensionBenefitsDueForTurn(inPayment);
          const payment = pensionBenefitPayment({
            benefitsDueAnchor: due,
            cashAnchor: scheme.assetsAnchor,
          });

          const now = new Date();
          // A guarded update. `assetsAnchor: { $gte: paid }` is the belt to the
          // pure function's braces: if anything else moved this scheme's cash
          // between the read and the write, the payment simply does not happen
          // rather than driving the balance negative. A pension scheme with
          // negative assets would be a mint wearing a disguise.
          const update = await pensionSchemesCollection<PensionScheme>(db).updateOne(
            {
              _id: scheme._id,
              assetsAnchor: { $gte: payment.paidAnchor },
              // Paid at most once per turn: the stamp below lands in this same update.
              $or: [
                { lastBenefitTurn: { $lt: currentTurn } },
                { lastBenefitTurn: { $exists: false } },
              ],
            },
            {
              $inc: {
                assetsAnchor: -payment.paidAnchor,
                // Paying a benefit discharges the claim. Without this the funding
                // ratio would never improve no matter how much a scheme paid out,
                // and the whole measure would be meaningless.
                liabilitiesAnchor: -payment.paidAnchor,
                benefitsInPaymentAnchor: retirements - payment.paidAnchor,
                totalBenefitsPaidAnchor: payment.paidAnchor,
                totalBenefitsUnpaidAnchor: payment.unpaidAnchor,
              },
              $set: {
                lastBenefitTurn: currentTurn,
                lastBenefitCutFraction: payment.cutFraction,
                updatedAt: now,
              },
            }
          );
          if (update.matchedCount !== 1)
            throw new Error("Pension scheme changed before its benefit settled");

          if (payment.paidAnchor > 0) {
            await emitBenefitTx(
              db,
              scheme,
              currentTurn,
              now,
              payment.paidAnchor,
              payment.cutFraction,
              requireCurrencyRate("USD", receiptRate)
            );
          }
          return {
            retirements,
            paid: payment.paidAnchor,
            unpaid: payment.unpaidAnchor,
            cutting: payment.cutFraction > 0,
          };
        },
        { sourceKey: `${candidate._id}:${currentTurn}` }
      );
      if (accepted) {
        result.schemesPaying += 1;
        result.retirementsAnchor += accepted.retirements;
        result.benefitsPaidAnchor += accepted.paid;
        result.benefitsUnpaidAnchor += accepted.unpaid;
        if (accepted.cutting) result.schemesCutting += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Scheme ${candidate._id.toString()}: ${message}`);
    }
  }

  return result;
}

async function emitBenefitTx(
  db: Db,
  scheme: PensionScheme,
  turn: number,
  now: Date,
  paidAnchor: number,
  cutFraction: number,
  receiptRate: number
): Promise<void> {
  await emitTx(db, {
    type: "pension_benefit",
    turn,
    createdAt: now,
    subjectType: "pension_scheme",
    subjectId: scheme._id,
    subjectName: `${scheme.unionName} pension scheme`,
    amount: -paidAnchor * receiptRate,
    anchorAmount: -paidAnchor,
    currencyCode: "USD",
    // Pensioners are modelled workforce, not documents. The other leg leaves
    // the instrumented perimeter, so it derives to a sink rather than to an
    // account that does not exist.
    counterpartyType: "system",
    counterpartyName: "Pensioners",
    meta: {
      schemeId: scheme._id.toString(),
      unionId: scheme.unionId.toString(),
      cutFraction,
      receiptValuationRate: receiptRate,
      bookCurrency: "anchor",
    },
  });
}
