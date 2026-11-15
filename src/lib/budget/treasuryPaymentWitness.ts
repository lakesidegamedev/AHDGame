/** Funded Treasury payments witness spendable cash and any owned signed-position debit. */
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { TransitionProjection } from "@/lib/banking/rules/boundary";
import { fundedTreasuryPaymentLegs } from "./rules/treasuryAccrual";
import type { FinancialTxType } from "@/lib/db/types/financialTxLog";

export function treasuryPaymentWitness(input: {
  key: string;
  country: string;
  currency: string;
  amount: number;
  rate: number;
  turn: number;
  signedPositionOwned: boolean;
  incoming?: boolean;
  txType: FinancialTxType;
  reason?: string;
  now: Date;
}): TransitionProjection[] {
  if (input.amount === 0) return [];
  return [
    {
      collection: "ledgerEntries",
      note: "Funded Treasury payment cash witness",
      insert: {
        _id: new ObjectId(
          createHash("sha256")
            .update(input.key + ":treasury-cash-witness")
            .digest("hex")
            .slice(0, 24)
        ),
        turn: input.turn,
        createdAt: input.now,
        txType: input.txType,
        emitSite: "budget/treasuryPaymentWitness",
        balanced: true,
        legs: fundedTreasuryPaymentLegs(input),
      },
    },
  ];
}
