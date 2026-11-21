import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { writeGovBudgetLocal } from "@/lib/currency/govBudgetFields";

import { treasuryAnchorValuation } from "@/lib/budget/rules/treasuryAccrual";
import {
  anchorToCorpLiquidCapital,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { type TreasuryCashOptions } from "@/lib/nationalization/treasuryLedger";
import type { BankingTransition } from "@/lib/banking/rules/boundary";
import { resumeSettlement, settleTransition } from "@/lib/banking/settlementJournal";

import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";

/**
 * Pay a sector-taking compensation claim from funded Treasury cash directly to
 * the donor corporation. The Treasury debit, donor credit, and signed fiscal
 * projection share one durable receipt; callers must not separately credit the
 * corporation after this resolves.
 */
export async function settleFundedTreasuryCompensation(
  db: Db,
  input: {
    countryId: CountryId;
    donor: Corporation;
    payoutAnchor: number;
    fxByCurrency: ReadonlyMap<CurrencyCode, number>;
    now: Date;
    key: string;
    ledger: TreasuryCashOptions;
  }
): Promise<{
  donorAmountLocal: number;
  treasuryAmountLocal: number;
  payoutAnchor: number;
  newlySettled: boolean;
}> {
  const settlementKey = `treasury-nationalization-compensation:${input.key}`;
  const prior = await bankMoneyMovesCollection<{
    _id: string;
    status?: string;
    legs?: { kind: string; amount: number; collection?: string; path?: string }[];
    event?: { meta?: { payoutAnchor?: number } };
  }>(db).findOne({ _id: settlementKey }, { projection: { status: 1, legs: 1, event: 1 } });
  if (prior) {
    const wasApplied = prior.status === "applied";
    const settled = await resumeSettlement(db, settlementKey);
    if (
      settled.status === "rejected" ||
      settled.status === "partial" ||
      (settled.status === "replayed" && settled.error)
    ) {
      throw new Error(settled.error ?? "Funded compensation settlement is incomplete");
    }
    const frozenDebit = prior.legs?.find(
      (leg) =>
        leg.kind === "debit" &&
        leg.collection === "federalBudget" &&
        leg.path === "treasuryCashLocal"
    );
    const frozenCredit = prior.legs?.find(
      (leg) =>
        leg.kind === "credit" && leg.collection === "corporations" && leg.path === "liquidCapital"
    );
    if (!frozenDebit || !frozenCredit)
      throw new Error("Funded compensation receipt is missing its frozen cash legs");
    const payoutAnchor = prior.event?.meta?.payoutAnchor;
    if (typeof payoutAnchor !== "number" || !Number.isFinite(payoutAnchor) || payoutAnchor <= 0)
      throw new Error("Funded compensation receipt is missing its frozen anchor amount");
    return {
      donorAmountLocal: frozenCredit.amount,
      treasuryAmountLocal: frozenDebit.amount,
      payoutAnchor,
      newlySettled: !wasApplied && settled.status === "applied",
    };
  }
  if (!Number.isFinite(input.payoutAnchor) || input.payoutAnchor < 0)
    throw new Error("Funded compensation requires a finite nonnegative quote");
  if (input.payoutAnchor === 0)
    return {
      donorAmountLocal: 0,
      treasuryAmountLocal: 0,
      payoutAnchor: 0,
      newlySettled: false,
    };
  const context = input.ledger.context;
  if (!context?.treasuryCashLedgerEnabled)
    throw new Error("Funded compensation requires the Treasury cash ledger");

  const treasuryCurrency =
    context.treasuryCurrencies.get(input.countryId) ??
    COUNTRY_CURRENCY_MAP[input.countryId] ??
    "USD";
  const treasuryRate = treasuryAnchorValuation({
    countryId: input.countryId,
    currencyCode: treasuryCurrency,
    preset: context.preset,
    observedRate: context.rates.get(treasuryCurrency),
  }).anchorRate;
  const donorCurrency = resolveCorpLiquidCurrencyCode(input.donor) ?? "USD";
  const donorRate = input.fxByCurrency.get(donorCurrency);
  if (donorRate === undefined || !Number.isFinite(donorRate) || donorRate <= 0)
    throw new Error(`Missing valid compensation FX rate for donor currency ${donorCurrency}`);

  const treasuryAmountLocal = Math.round(
    writeGovBudgetLocal(input.payoutAnchor, treasuryCurrency, treasuryRate)
  );
  const donorAmountLocal = Math.round(
    anchorToCorpLiquidCapital(input.payoutAnchor, input.donor, donorRate)
  );
  if (!(treasuryAmountLocal > 0) || !(donorAmountLocal > 0))
    throw new Error("Funded compensation rounded to a non-positive cash leg");
  const budget = await federalBudgetCollection<{
    countryId: string;
    currencyCode?: CurrencyCode | null;
  }>(db).findOne({ countryId: input.countryId }, { projection: { countryId: 1, currencyCode: 1 } });
  if (!budget) throw new Error("Funded compensation Treasury account is missing");
  const budgetFilter: Record<string, unknown> = { countryId: budget.countryId };
  if (Object.prototype.hasOwnProperty.call(budget, "currencyCode"))
    budgetFilter.currencyCode = budget.currencyCode === null ? { $type: 10 } : budget.currencyCode;
  else budgetFilter.currencyCode = { $exists: false };

  const donorFilter: Record<string, unknown> = { _id: input.donor._id };
  if (input.donor.liquidCurrencyCode === undefined) {
    donorFilter.liquidCurrencyCode = { $exists: false };
  } else if (input.donor.liquidCurrencyCode === null) {
    donorFilter.liquidCurrencyCode = { $type: 10 };
  } else {
    donorFilter.liquidCurrencyCode = input.donor.liquidCurrencyCode;
  }
  if (!input.donor.liquidCurrencyCode || !String(input.donor.liquidCurrencyCode).trim()) {
    donorFilter.countryId =
      input.donor.countryId === undefined ? { $exists: false } : input.donor.countryId;
  }

  const transition: BankingTransition = {
    key: settlementKey,
    kind: "nationalization_compensation",
    turn: context.turn,
    currency: treasuryCurrency,
    retryCreditLegOnGuardFailure: true,
    legs: [
      {
        kind: "debit",
        amount: treasuryAmountLocal,
        valuation: {
          currencyCode: treasuryCurrency,
          localPerAnchor: treasuryAmountLocal / input.payoutAnchor,
        },
        collection: "federalBudget",
        filter: { ...budgetFilter, treasuryCashLocal: { $gte: treasuryAmountLocal } },
        path: "treasuryCashLocal",
        note: "Fund sector nationalization compensation from spendable Treasury cash",
      },
      {
        kind: "credit",
        amount: donorAmountLocal,
        valuation: {
          currencyCode: donorCurrency,
          localPerAnchor: donorAmountLocal / input.payoutAnchor,
        },
        collection: "corporations",
        filter: donorFilter,
        path: "liquidCapital",
        note: "Deliver nationalization compensation to the frozen donor denomination",
      },
    ],
    projections: [
      {
        collection: "federalBudget",
        filter: budgetFilter,
        update: { $inc: { treasuryBalance: -treasuryAmountLocal }, $set: { updatedAt: input.now } },
        note: "Update the signed fiscal position after funded compensation",
      },
    ],
    event: {
      kind: "monetary.executed",
      command: "nationalization.compensation",
      subjectType: "corporation",
      subjectId: input.donor._id.toString(),
      amount: treasuryAmountLocal,
      meta: { flow: "nationalization_compensation", payoutAnchor: input.payoutAnchor },
    },
  };

  let settled = await settleTransition(db, transition);
  let newlySettled = settled.status === "applied";
  if (
    (settled.status === "rejected" &&
      settled.error?.includes("different valued settlement quote")) ||
    (settled.status === "replayed" && settled.error)
  ) {
    // A concurrent retry may have won the same operation key with its frozen
    // FX quote, or the original receipt may have stopped between legs. Resume
    // that receipt rather than leaving its debit undelivered.
    const receiptWasApplied = settled.status === "replayed" && !settled.error;
    settled = await resumeSettlement(db, transition.key);
    newlySettled = !receiptWasApplied && settled.status === "applied";
  }
  if (
    settled.status === "rejected" ||
    settled.status === "partial" ||
    (settled.status === "replayed" && settled.error)
  ) {
    throw new Error(settled.error ?? "Funded compensation settlement is incomplete");
  }
  if (!newlySettled) {
    const original = await bankMoneyMovesCollection<{
      _id: string;
      status?: string;
      legs?: { kind: string; amount: number; collection?: string; path?: string }[];
      event?: { meta?: { payoutAnchor?: number } };
    }>(db).findOne({ _id: transition.key }, { projection: { status: 1, legs: 1, event: 1 } });
    const frozenDebit = original?.legs?.find(
      (leg) =>
        leg.kind === "debit" &&
        leg.collection === "federalBudget" &&
        leg.path === "treasuryCashLocal"
    );
    const frozenCredit = original?.legs?.find(
      (leg) =>
        leg.kind === "credit" && leg.collection === "corporations" && leg.path === "liquidCapital"
    );
    if (!frozenDebit || !frozenCredit)
      throw new Error("Funded compensation receipt is missing its frozen cash legs");
    const payoutAnchor = original?.event?.meta?.payoutAnchor;
    if (typeof payoutAnchor !== "number" || !Number.isFinite(payoutAnchor) || payoutAnchor <= 0)
      throw new Error("Funded compensation receipt is missing its frozen anchor amount");
    return {
      donorAmountLocal: frozenCredit.amount,
      treasuryAmountLocal: frozenDebit.amount,
      payoutAnchor,
      newlySettled: false,
    };
  }
  return {
    donorAmountLocal,
    treasuryAmountLocal,
    payoutAnchor: input.payoutAnchor,
    newlySettled: true,
  };
}
