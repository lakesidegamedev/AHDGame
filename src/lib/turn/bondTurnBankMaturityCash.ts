import type { Db } from "mongodb";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import {
  fundedBankMaturityCashByCountry,
  type BankMaturityReceipt,
} from "@/lib/resetFinance/rules/bankMaturityCash";

/** Applied funding plans survive retries, including a later escrow release. */
export async function readFundedBankMaturityCash(db: Db, turn: number) {
  const receipts = await bankMoneyMovesCollection<BankMaturityReceipt>(db)
    .find(
      {
        turn,
        "projections.projection.insert.emitSite": "banking/bankSovereignClaims:funding",
        "projections.projection.insert.txType": "gov_bond_maturity_payment",
      },
      {
        projection: {
          "projections.applied": 1,
          "projections.projection.collection": 1,
          "projections.projection.insert": 1,
        },
      }
    )
    .toArray();
  return fundedBankMaturityCashByCountry(receipts);
}
