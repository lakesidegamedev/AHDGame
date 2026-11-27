import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import type { MoneyMoveRecordLeg } from "@/lib/banking/moneyMove";
import type { Db } from "mongodb";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import type { Corporation, FederalBudget } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { withSessionDb } from "@/lib/db/sessionDb";

import {
  loadFxRatesByCurrency,
  requireCurrencyRate,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import { settleTransition } from "@/lib/banking/settlementJournal";
import { oid, type TransitionLeg } from "@/lib/banking/rules/boundary";
import { treasuryPaymentWitness } from "@/lib/budget/treasuryPaymentWitness";
import { emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";

/** Deliver funded crisis assistance before activating recovery or a repayment obligation. */
export async function fundSovereignResolution(
  db: Db,
  input: {
    kind: "bailout" | "monetize";
    budget: FederalBudget;
    countryId: CountryId;
    decisionKey: string;
    turn: number;
    now: Date;
    amountLocal: number;
    lender?: Corporation;
  }
): Promise<boolean> {
  return withSessionDb(db, async (db) => {
    const config = await gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { treasuryCashLedgerEnabled: 1 } }
    );
    if (config?.treasuryCashLedgerEnabled !== true) return true;
    const amount = input.amountLocal;
    if (!Number.isFinite(amount) || amount < 0)
      throw new Error("Invalid sovereign assistance amount");
    if (!(amount > 0)) return true;
    // Serialize competing receipts for this Treasury before inserting a journal key.
    const fence = await federalBudgetCollection(db).updateOne(
      { _id: input.budget._id, countryId: input.countryId },
      { $inc: { sovereignFundingRevision: 1 } }
    );
    if (fence.matchedCount !== 1) throw new Error("Sovereign assistance Treasury no longer exists");

    const key = `sovereign-funding:${input.kind}:${input.decisionKey}`;
    const previous = await bankMoneyMovesCollection<{
      _id: string;
      status: string;
      legs: MoneyMoveRecordLeg[];
      projectionsCompletedAt?: Date;
    }>(db).findOne({ _id: key });
    if (previous) {
      const credit = previous.legs?.find(
        (leg) => leg.kind === "credit" && leg.path === "treasuryCashLocal"
      );
      if (
        previous.status !== "applied" ||
        !previous.projectionsCompletedAt ||
        credit?.amount !== amount
      )
        throw new Error("Sovereign assistance receipt requires reconciliation");
      return true;
    }
    const currency = resolveCountryCurrencyCode(input.budget);
    if (!currency) throw new Error("Sovereign assistance requires a Treasury denomination");
    const fx = await loadFxRatesByCurrency(db),
      rate = requireCurrencyRate(currency, fx.get(currency));
    const anchor = amount / rate;
    const valuation = { currencyCode: currency, localPerAnchor: rate };
    const txType =
      input.kind === "bailout" ? "sovereign_bailout_disbursement" : "sovereign_monetization";
    const legs: TransitionLeg[] = [
      {
        kind: "credit",
        amount,
        valuation,
        collection: "federalBudget",
        filter: { _id: input.budget._id, countryId: input.countryId },
        path: "treasuryCashLocal",
        note: "Deliver spendable sovereign support",
      },
    ];
    const rows: TxInput[] = [
      {
        type: txType,
        turn: input.turn,
        createdAt: input.now,
        countryId: input.countryId,
        subjectType: "government",
        subjectName: input.countryId,
        amount,
        currencyCode: currency,
        anchorAmount: anchor,
        counterpartyType: input.kind === "bailout" ? "corporation" : "system",
        counterpartyId: input.lender?._id,
        counterpartyName: input.lender?.name ?? "Sovereign monetary issuance",
        meta: { kind: input.kind, decisionId: input.decisionKey },
      },
    ];
    if (input.kind === "bailout") {
      const lender = input.lender;
      if (!lender) throw new Error("Missing sovereign bailout lender");
      const lenderRate = fxRateForCorpFromMap(lender, fx),
        debit = anchor * lenderRate;
      if (!Number.isFinite(debit) || !(debit > 0))
        throw new Error("Invalid IMF disbursement quote");
      if ((lender.liquidCapital ?? 0) < debit) return false;
      const lenderCurrency = resolveCorpLiquidCurrencyCode(lender);
      if (!lenderCurrency) throw new Error("Missing IMF treasury denomination");
      legs.unshift({
        kind: "debit",
        amount: debit,
        valuation: { currencyCode: lenderCurrency, localPerAnchor: lenderRate },
        collection: "corporations",
        filter: { _id: oid(lender._id.toHexString()), liquidCapital: { $gte: debit } },
        path: "liquidCapital",
        note: "Fund sovereign assistance from IMF cash",
      });
      rows.push({
        type: txType,
        turn: input.turn,
        createdAt: input.now,
        subjectType: "corporation",
        subjectId: lender._id,
        subjectName: lender.name,
        amount: -debit,
        currencyCode: lenderCurrency,
        anchorAmount: -anchor,
        counterpartyType: "government",
        counterpartyName: input.countryId,
        countryId: input.countryId,
        meta: { kind: "bailout", decisionId: input.decisionKey },
      });
    } else
      legs.push({
        kind: "mint",
        amount,
        valuation,
        note: "Explicit sovereign monetization issuance",
      });
    const result = await settleTransition(db, {
      key,
      kind: "sovereign_crisis_funding",
      turn: input.turn,
      currency,
      legs,
      projections: [
        {
          collection: "federalBudget",
          filter: { _id: input.budget._id },
          update: { $inc: { treasuryBalance: amount }, $set: { updatedAt: input.now } },
          note: "Mirror delivered support in the signed fiscal position",
        },
        ...treasuryPaymentWitness({
          key,
          country: input.countryId,
          currency,
          amount,
          rate,
          turn: input.turn,
          now: input.now,
          txType,
          incoming: true,
          signedPositionOwned: false,
          reason: "sovereign_funding_cash_projection",
        }),
      ],
      event: {
        kind: "monetary.executed",
        command: "sovereign." + input.kind,
        subjectType: "government",
        subjectId: input.countryId,
        amount,
        meta: { decisionId: input.decisionKey },
      },
    });
    if (result.error || (result.status !== "applied" && result.status !== "replayed"))
      throw new Error(result.error ?? "Sovereign assistance could not settle");
    if (result.status === "applied") await emitTxBulk(db, rows, await loadTxThresholds(db));
    return true;
  });
}
