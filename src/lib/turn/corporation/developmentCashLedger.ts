import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { developmentCashLegs } from "./rules/developmentCash";

/** The existing guarded debit receipt owns the witness across retries. */
export function developmentCashWitness(input: {
  corporation: string;
  family: string;
  project: string;
  turn: number;
  currency: CurrencyCode;
  amount: number;
  rate: number;
}) {
  const key = `product-development:${input.family}:${input.corporation}:${input.project}:${input.turn}`;
  return {
    _id: new ObjectId(createHash("sha256").update(key).digest("hex").slice(0, 24)),
    turn: input.turn,
    createdAt: new Date(),
    txType: "producer_market_transfer" as const,
    emitSite: "corporation/productDevelopmentCash",
    balanced: true,
    legs: developmentCashLegs(input.corporation, input.currency, input.amount, input.rate),
  };
}
