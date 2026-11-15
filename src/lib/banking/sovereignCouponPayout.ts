import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import type { BankingTransition } from "./rules/boundary";
import { fundedTreasuryPaymentLegs } from "@/lib/budget/rules/treasuryAccrual";
import {
  fundedCouponPayeeWitness,
  type CouponCashWitnessContext,
} from "./fundedCouponPayeeWitness";
export const SOVEREIGN_COUPON_CLAIMS_COLLECTION = "sovereignCouponClaims";

export function couponCashWitness(
  key: string,
  country: string,
  currency: string,
  amount: number,
  rate: number,
  turn: number
): BankingTransition["projections"][number] {
  return {
    collection: "ledgerEntries",
    note: "Funded coupon treasury cash witness",
    insert: {
      _id: new ObjectId(
        createHash("sha256")
          .update(key + ":treasury-cash-witness")
          .digest("hex")
          .slice(0, 24)
      ),
      turn,
      createdAt: new Date(),
      txType: "gov_coupon_payment",
      emitSite: "fundedSovereignCoupons:treasuryCash",
      balanced: true,
      legs: fundedTreasuryPaymentLegs({
        country,
        currency,
        amount,
        rate,
        signedPositionOwned: false,
      }),
    },
  };
}

export function payoutTransition(
  claim: FundedSovereignCouponClaim,
  budgetId: string,
  attemptTurn: number,
  witnessRate = claim.anchorRate,
  witnessContext?: CouponCashWitnessContext
): BankingTransition {
  const key = `${claim.id}:attempt:${attemptTurn}`;
  const legs: BankingTransition["legs"] = [
    {
      kind: "debit",
      amount: claim.amountLocal,
      valuation: { currencyCode: claim.currencyCode, localPerAnchor: claim.anchorRate },
      collection: "federalBudget",
      filter: { _id: budgetId, treasuryCashLocal: { $gte: claim.amountLocal } },
      path: "treasuryCashLocal",
      note: "Pay sovereign coupon claims from funded Treasury cash",
    },
  ];
  for (const holder of claim.holders) {
    if (holder.kind === "publicFloat") {
      legs.push({
        kind: "credit",
        amount: holder.amountLocal,
        valuation: { currencyCode: claim.currencyCode, localPerAnchor: claim.anchorRate },
        collection: "bondMarketPools",
        filter: { _id: claim.currencyCode },
        path: "cashLocal",
        note: "Pay public-float sovereign coupon to its bond pool",
      });
    } else if (holder.kind === "character" || holder.kind === "imperial") {
      const path = holder.personalBalancePath;
      if (!path || !holder.id)
        throw new Error(`Invalid frozen sovereign coupon holder ${claim.id}`);
      legs.push({
        kind: "credit",
        amount: holder.amountLocal,
        valuation: { currencyCode: claim.currencyCode, localPerAnchor: claim.anchorRate },
        collection: holder.kind === "character" ? "characters" : "imperialCharacters",
        filter: { _id: new ObjectId(holder.id) },
        path,
        note: "Pay frozen sovereign coupon to personal cash",
      });
    } else if (holder.kind === "corporation") {
      if (!holder.id) throw new Error(`Missing corporation in sovereign coupon ${claim.id}`);
      const payeeRate = holder.payeeLocalPerAnchor;
      const payeeCurrency = holder.payeeCurrencyCode;
      if (!payeeRate || !payeeCurrency)
        throw new Error(`Missing frozen corporate FX quote for ${claim.id}`);
      legs.push({
        kind: "credit",
        amount: holder.amountAnchor * payeeRate,
        valuation: { currencyCode: payeeCurrency, localPerAnchor: payeeRate },
        collection: "corporations",
        filter: {
          _id: new ObjectId(holder.id),
          ...(holder.payeeCurrencyFieldPresent
            ? { liquidCurrencyCode: holder.payeeCurrencyFieldValue ?? null }
            : { liquidCurrencyCode: { $exists: false } }),
          ...(holder.payeeCurrencyUsesCountryFallback ? { countryId: holder.payeeCountryId } : {}),
        },
        path: "liquidCapital",
        note: "Pay frozen sovereign coupon to corporate cash",
      });
    } else if (holder.kind === "fund") {
      if (!holder.id) throw new Error(`Missing index fund in sovereign coupon ${claim.id}`);
      legs.push({
        kind: "credit",
        amount: holder.amountAnchor,
        valuation: { currencyCode: "ANCHOR", localPerAnchor: 1 },
        collection: "indexFunds",
        filter: { _id: new ObjectId(holder.id) },
        path: "cashAnchor",
        note: "Pay frozen sovereign coupon to index-fund cash",
      });
    } else if (holder.kind === "npp") {
      if (!holder.id) throw new Error(`Missing NPP in sovereign coupon ${claim.id}`);
      legs.push({
        kind: "credit",
        amount: holder.amountAnchor,
        valuation: { currencyCode: "ANCHOR", localPerAnchor: 1 },
        collection: "npps",
        filter: { _id: new ObjectId(holder.id) },
        path: "nppInvestmentCashAnchor",
        note: "Pay frozen sovereign coupon to NPP investment cash",
      });
    }
  }
  return {
    key,
    kind: "sovereign_coupon_funded_payout",
    turn: attemptTurn,
    currency: claim.currencyCode,
    legs,
    projections: [
      ...(witnessContext
        ? [fundedCouponPayeeWitness(key, attemptTurn, [claim], witnessContext)]
        : []),
      couponCashWitness(
        key,
        claim.countryId,
        claim.currencyCode,
        claim.amountLocal,
        witnessRate,
        attemptTurn
      ),
      {
        collection: SOVEREIGN_COUPON_CLAIMS_COLLECTION,
        filter: { _id: claim.id, budgetId },
        update: { $set: { settledTurn: attemptTurn } },
        note: "Mark paid sovereign coupon claim settled",
      },
      ...claim.holders
        .filter((holder) => holder.kind === "publicFloat")
        .map((holder) => ({
          collection: "bondMarketPools",
          filter: { _id: claim.currencyCode },
          update: { $inc: { "lifetime.couponsIn": holder.amountLocal } },
          note: "Record funded public-float coupon receipt",
        })),
    ],
    event: {
      kind: "monetary.executed",
      command: "turn.sovereignCoupon.fundedPayout",
      subjectType: "country",
      subjectId: claim.countryId,
      amount: claim.amountLocal,
      meta: { claimId: claim.id, bondId: claim.bondId },
    },
  };
}
