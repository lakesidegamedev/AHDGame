import { couponBatchKey } from "@/lib/banking/sovereignCouponPrefetch";

import { ObjectId, type Db } from "mongodb";

import type { FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import type { Corporation } from "@/lib/db/types/corporation";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";

import type { BankingTransition, TransitionLeg } from "@/lib/banking/rules/boundary";

import { bondMarketPoolsCollection } from "@/lib/db/repositories/bondMarketPools";
import { couponCashWitness, payoutTransition } from "@/lib/banking/sovereignCouponPayout";
import {
  fundedCouponPayeeWitness,
  type CouponCashWitnessContext,
} from "@/lib/banking/fundedCouponPayeeWitness";

export function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, writeErrors } = error as { code?: unknown; writeErrors?: unknown };
  if (code === 11000) return true;
  return (
    Array.isArray(writeErrors) &&
    writeErrors.length > 0 &&
    writeErrors.every((row) => (row as { code?: unknown })?.code === 11000)
  );
}

export /**
 * One balanced receipt for many claims in one currency. It is the per-claim
 * receipts added together: one Treasury debit for the sum of the claims, and
 * one credit per payee holding the sum of that payee's per-claim credits, each
 * valued at the frozen quotes it summed. The debit is valued at the anchor sum
 * of the credits, so the receipt nets exactly. Each claim keeps its own frozen
 * quote on its record, and leaves the queue only after the receipt lands.
 */
function batchPayoutTransition(
  claims: FundedSovereignCouponClaim[],
  budgetId: string,
  turn: number,
  witnessRate: number,
  witnessContext?: CouponCashWitnessContext
): BankingTransition {
  const currencyCode = claims[0].currencyCode;
  const credits = new Map<
    string,
    { leg: TransitionLeg; currencyCode: string; amount: number; anchor: number }
  >();
  const couponsIn = new Map<string, number>();
  let amount = 0;
  for (const claim of claims) {
    amount += claim.amountLocal;
    const single = payoutTransition(claim, budgetId, Math.max(turn, claim.dueTurn));
    for (const leg of single.legs) {
      if (leg.kind !== "credit" || !leg.valuation) continue;
      // A corporate credit's guard is part of its target: two claims frozen
      // under different payee currency guards keep separate legs.
      const guard = leg.collection === "corporations" ? `|${JSON.stringify(leg.filter)}` : "";
      const target = `${leg.collection}|${String((leg.filter as { _id?: unknown })._id)}|${leg.path}|${leg.valuation.currencyCode}${guard}`;
      const row = credits.get(target) ?? {
        leg,
        currencyCode: leg.valuation.currencyCode,
        amount: 0,
        anchor: 0,
      };
      row.amount += leg.amount;
      row.anchor += leg.amount / leg.valuation.localPerAnchor;
      credits.set(target, row);
    }
    for (const holder of claim.holders) {
      if (holder.kind !== "publicFloat") continue;
      couponsIn.set(
        claim.currencyCode,
        (couponsIn.get(claim.currencyCode) ?? 0) + holder.amountLocal
      );
    }
  }
  let creditAnchor = 0;
  const creditLegs: TransitionLeg[] = [...credits.values()].map((row) => {
    creditAnchor += row.anchor;
    return {
      ...row.leg,
      amount: row.amount,
      valuation: { currencyCode: row.currencyCode, localPerAnchor: row.amount / row.anchor },
    };
  });
  return {
    key: couponBatchKey(budgetId, turn),
    kind: "sovereign_coupon_funded_batch_payout",
    turn,
    currency: currencyCode,
    legs: [
      {
        kind: "debit",
        amount,
        valuation: { currencyCode, localPerAnchor: amount / creditAnchor },
        collection: "federalBudget",
        filter: { _id: budgetId, treasuryCashLocal: { $gte: amount } },
        path: "treasuryCashLocal",
        note: "Pay sovereign coupon claims from funded Treasury cash",
      },
      ...creditLegs,
    ],
    projections: [
      ...(witnessContext
        ? [fundedCouponPayeeWitness(couponBatchKey(budgetId, turn), turn, claims, witnessContext)]
        : []),
      couponCashWitness(
        couponBatchKey(budgetId, turn),
        claims[0].countryId,
        currencyCode,
        amount,
        witnessRate,
        turn
      ),
      ...[...couponsIn].map(([pool, inc]) => ({
        collection: "bondMarketPools",
        filter: { _id: pool },
        update: { $inc: { "lifetime.couponsIn": inc } },
        note: "Record funded public-float coupon receipts",
      })),
    ],
    event: {
      kind: "monetary.executed",
      command: "turn.sovereignCoupon.fundedBatchPayout",
      subjectType: "country",
      subjectId: claims[0].countryId,
      amount,
      meta: { claimIds: claims.map((claim) => claim.id).join(","), claims: claims.length },
    },
  };
}

export async function loadCouponTargetReadiness(
  db: Db,
  claims: FundedSovereignCouponClaim[],
  knownPoolCurrencies?: readonly string[]
): Promise<Set<string>> {
  // The pool upsert is a side effect that must not depend on which claims the
  // cash bound let this pass load, so a caller that pre-filtered passes the
  // currency set read from every open claim.
  const poolCurrencies = new Set<string>([
    ...(knownPoolCurrencies ?? []),
    ...claims.flatMap((claim) =>
      claim.holders.some((holder) => holder.kind === "publicFloat") ? [claim.currencyCode] : []
    ),
  ]);
  if (poolCurrencies.size > 0) {
    try {
      await bondMarketPoolsCollection<{ _id: string }>(db).bulkWrite(
        [...poolCurrencies].map((currencyCode) => ({
          updateOne: {
            filter: { _id: currencyCode },
            update: { $setOnInsert: { targetCashLocal: 0, createdAt: new Date() } },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    } catch (error) {
      // Two Treasuries creating the same missing pool at once is the only way
      // this can race, and the loser's document is already the one it wanted.
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  const collections = new Map<string, Set<string>>();
  for (const claim of claims) {
    for (const holder of claim.holders) {
      if (!holder.id) continue;
      const collection = targetCollection(holder.kind);
      if (!collection) continue;
      const ids = collections.get(collection) ?? new Set<string>();
      ids.add(holder.id);
      collections.set(collection, ids);
    }
  }
  const foundIds = new Map<string, Set<string>>();
  const corporationsById = new Map<string, Corporation>();
  for (const [collection, ids] of collections) {
    const found =
      collection === "corporations"
        ? await db
            .collection<Corporation>(collection)
            .find(
              { _id: { $in: [...ids].map((id) => new ObjectId(id)) } },
              { projection: { _id: 1, countryId: 1, liquidCurrencyCode: 1 } }
            )
            .toArray()
        : await db
            .collection<{ _id: ObjectId }>(collection)
            .find(
              { _id: { $in: [...ids].map((id) => new ObjectId(id)) } },
              { projection: { _id: 1 } }
            )
            .toArray();
    foundIds.set(collection, new Set(found.map((row) => row._id.toHexString())));
    if (collection === "corporations") {
      for (const corp of found as Corporation[]) corporationsById.set(corp._id.toHexString(), corp);
    }
  }
  const ready = new Set<string>();
  for (const claim of claims) {
    const hasAllTargets = claim.holders.every((holder) => {
      if (holder.kind === "publicFloat") return poolCurrencies.has(claim.currencyCode);
      if (!holder.id) return false;
      const collection = targetCollection(holder.kind);
      if (!collection || !foundIds.get(collection)?.has(holder.id)) return false;
      if (holder.kind !== "corporation") return true;
      const corp = corporationsById.get(holder.id);
      return (
        !!corp &&
        resolveCorpLiquidCurrencyCode(corp) === holder.payeeCurrencyCode &&
        (holder.payeeCurrencyFieldPresent
          ? corp.liquidCurrencyCode === holder.payeeCurrencyFieldValue
          : corp.liquidCurrencyCode === undefined) &&
        (!holder.payeeCurrencyUsesCountryFallback ||
          String(corp.countryId ?? "") === holder.payeeCountryId)
      );
    });
    if (hasAllTargets) ready.add(claim.id);
  }
  return ready;
}

export function targetCollection(
  kind: FundedSovereignCouponClaim["holders"][number]["kind"]
): string | null {
  if (kind === "character") return "characters";
  if (kind === "imperial") return "imperialCharacters";
  if (kind === "corporation") return "corporations";
  if (kind === "fund") return "indexFunds";
  if (kind === "npp") return "npps";
  return null;
}
