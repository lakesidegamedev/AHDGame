import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { TransitionLeg, TransitionProjection } from "@/lib/banking/rules/boundary";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { productAdvertisingCashLegs } from "./rules/productAdvertisingLedger";

/** Publish the cash witness with the same immutable receipt as the advertising transfer. */
export function productAdvertisingCashWitness(
  key: string,
  turn: number,
  cashLegs: readonly TransitionLeg[],
  witnessRates: Readonly<Partial<Record<CurrencyCode, number>>> = {}
): TransitionProjection {
  const payments = cashLegs
    .filter((leg) => leg.collection === "corporations" && leg.path === "liquidCapital")
    .map((leg) => {
      const id = leg.filter?._id;
      const corporation =
        typeof id === "object" && id !== null && "$oid" in id ? String(id.$oid) : String(id);
      if (!ObjectId.isValid(corporation) || !leg.valuation)
        throw new Error("Missing product advertising cash quote");
      return {
        corporation,
        currency: leg.valuation.currencyCode as CurrencyCode,
        amount: leg.kind === "debit" ? -leg.amount : leg.amount,
        rate:
          witnessRates[leg.valuation.currencyCode as CurrencyCode] ?? leg.valuation.localPerAnchor,
      };
    });
  return {
    collection: "ledgerEntries",
    note: "Witness funded product advertising cash",
    insert: {
      _id: new ObjectId(
        createHash("sha256")
          .update(key + ":cash-witness")
          .digest("hex")
          .slice(0, 24)
      ),
      turn,
      createdAt: new Date(),
      txType: "producer_market_transfer",
      emitSite: "products/productAdvertising",
      balanced: true,
      legs: productAdvertisingCashLegs(payments),
    },
  };
}
