import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import type { Db } from "mongodb";
import { withSessionDb } from "@/lib/db/sessionDb";
import { getImfCorporation } from "@/lib/imf/resolveImfCorporation";
import { computeImfFacilityPaymentTurn } from "@/lib/imf/imfFacilityMath";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import {
  anchorToCorpLiquidCapital,
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import {
  IMF_SOVEREIGN_AMORTIZATION_TURNS,
  IMF_SOVEREIGN_INCOME_CAPTURE_DEFAULT,
} from "./constants";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { emitTx } from "@/lib/financialTxLog/emit";

const PRINCIPAL_EPS = 1e-6;

/** Debit the available sovereign cash and service its facility once per turn. */
export async function processSovereignImfFacilityPayments(
  db: Db,
  turn: number
): Promise<{ paymentsApplied: number }> {
  const active = await federalBudgetCollection(db)
    .find({ imfSovereignBailoutActive: true }, { projection: { _id: 1 } })
    .toArray();
  if (active.length === 0) return { paymentsApplied: 0 };
  if (!Number.isInteger(turn) || turn < 0)
    throw new Error("Sovereign IMF payment requires a valid turn");
  const fx = await loadFxRatesByCurrency(db);
  let paymentsApplied = 0;
  for (const candidate of active) {
    const paid = await withSessionDb(db, async (transactionDb) => {
      const budget = await federalBudgetCollection(transactionDb).findOne({ _id: candidate._id });
      if (
        !budget?.imfSovereignBailoutActive ||
        (budget.imfSovereignFacilityLastPaymentTurn ?? -1) >= turn
      )
        return false;
      const principal = budget.imfSovereignFacilityPrincipalOutstanding ?? 0;
      if (principal <= PRINCIPAL_EPS) return false;
      const imf = await getImfCorporation(transactionDb);
      if (!imf) return false;
      const config = await gameConfigCollection(transactionDb).findOne(
        { _id: "default" },
        { projection: { treasuryCashLedgerEnabled: 1 } }
      );
      const funded = config?.treasuryCashLedgerEnabled === true;
      const cashField = funded ? "treasuryCashLocal" : "treasuryBalance";
      const available = Math.max(0, budget[cashField] ?? 0);
      const currency = (budget.currencyCode ??
        COUNTRY_CURRENCY_MAP[budget.countryId as CountryId]) as CurrencyCode;
      const rate = fx.get(currency);
      if (!rate || !Number.isFinite(rate) || rate <= 0)
        throw new Error("Sovereign IMF payment requires a valid treasury quote");
      const imfRate = fxRateForCorpFromMap(imf, fx);
      const capture = Math.max(
        0,
        Math.min(
          1,
          budget.imfSovereignFacilityIncomeCaptureFraction ?? IMF_SOVEREIGN_INCOME_CAPTURE_DEFAULT
        )
      );
      const revenue = Math.max(0, budget.revenue?.total ?? 0) / TURNS_PER_YEAR;
      const split = computeImfFacilityPaymentTurn({
        principalOutstanding: principal,
        annualRatePercent: budget.imfSovereignFacilityAnnualRate ?? 0,
        remainingTurns:
          budget.imfSovereignFacilityAmortizationTurnsRemaining ?? IMF_SOVEREIGN_AMORTIZATION_TURNS,
        turnIncome: capture > 0 ? Math.min(revenue, available / capture) : 0,
        incomeCapFraction: capture,
      });
      const cleared = split.newPrincipal <= PRINCIPAL_EPS;
      const anchor = corpCapitalToAnchor(split.actualPayment, currency, rate);
      const creditAmount = anchorToCorpLiquidCapital(anchor, imf, imfRate);
      const now = new Date();
      const claim = await federalBudgetCollection(transactionDb).updateOne(
        {
          _id: budget._id,
          imfSovereignBailoutActive: true,
          imfSovereignFacilityLastPaymentTurn: { $not: { $gte: turn } },
          ...(split.actualPayment > 0 ? { [cashField]: { $gte: split.actualPayment } } : {}),
        },
        {
          $set: {
            imfSovereignFacilityLastPaymentTurn: turn,
            imfSovereignFacilityPrincipalOutstanding: cleared ? 0 : split.newPrincipal,
            imfSovereignFacilityAmortizationTurnsRemaining: cleared ? 0 : split.newRemainingTurns,
            ...(cleared ? { imfSovereignBailoutActive: false } : {}),
            updatedAt: now,
          },
          $inc: {
            treasuryBalance: -split.actualPayment,
            ...(funded ? { treasuryCashLocal: -split.actualPayment } : {}),
            imfSovereignFacilityCumulativePaidAnchor: anchor,
          },
        }
      );
      if (claim.matchedCount !== 1) throw new Error("Sovereign IMF source changed");
      if (split.actualPayment <= PRINCIPAL_EPS) return false;
      const credited = await corporationsCollection(transactionDb).updateOne(
        { _id: imf._id },
        {
          $inc: { liquidCapital: creditAmount },
          $set: { updatedAt: now },
        }
      );
      if (credited.matchedCount !== 1) throw new Error("Sovereign IMF recipient is missing");
      const meta = {
        kind: "sovereign_imf_facility",
        settlementId: `sovereign-imf:${budget._id}:${turn}`,
        principalLocal: split.principalPortion,
        interestLocal: split.interestPortion,
        treasuryCurrency: currency,
      };
      await emitTx(transactionDb, {
        type: "bank_loan_repayment",
        turn,
        createdAt: now,
        subjectType: "government",
        subjectName: budget.countryId,
        countryId: budget.countryId,
        amount: -split.actualPayment,
        anchorAmount: -anchor,
        currencyCode: currency,
        counterpartyType: "corporation",
        counterpartyId: imf._id,
        counterpartyName: imf.name,
        meta,
      });
      await emitTx(transactionDb, {
        type: "bank_loan_repayment",
        turn,
        createdAt: now,
        subjectType: "corporation",
        subjectId: imf._id,
        subjectName: imf.name,
        amount: creditAmount,
        anchorAmount: anchor,
        currencyCode: resolveCorpLiquidCurrencyCode(imf) ?? "USD",
        counterpartyType: "government",
        counterpartyName: budget.countryId,
        meta,
      });
      return true;
    });
    if (paid) paymentsApplied++;
  }
  return { paymentsApplied };
}
