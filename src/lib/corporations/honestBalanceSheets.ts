/**
 * Honest balance sheets (contestability plan, workstream 7). Capitalized
 * construction was counted as an asset while the bank loan that paid for it
 * was counted nowhere, and negative cash was floored to zero in valuation. At
 * `gameConfig.honestBalanceSheetsStage` >= 1 both are counted: the loan
 * principal as debt wherever construction in progress counts as an asset, and
 * overdrawn cash as the negative it is.
 */
import type { Db } from "mongodb";
import type { BankLoan } from "@/lib/db/types/bank";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { corpCapitalToAnchor } from "@/lib/currency/corporationCapital";

export const HONEST_LOANS_STAGE = 1;
/** Stage 3 caps escrow buybacks by the issuer's cash. */
export const HONEST_BUYBACK_CAP_STAGE = 3;

/** Live loan states whose principal is still owed. */
const LIVE_LOAN_STATUSES: BankLoan["status"][] = ["current", "arrears", "defaulted"];

/** Outstanding construction-loan principal per borrowing corporation, in anchor units. */
export async function loadConstructionLoanDebtAnchorByCorpId(
  db: Db,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>
): Promise<Map<string, number>> {
  const loans = await db
    .collection<BankLoan>("bankLoans")
    .find(
      {
        borrowerType: "corporation",
        constructionCollateral: { $exists: true },
        status: { $in: LIVE_LOAN_STATUSES },
      },
      { projection: { borrowerId: 1, outstanding: 1, currency: 1 } }
    )
    .toArray();
  const byCorp = new Map<string, number>();
  for (const loan of loans) {
    if (!loan.borrowerId || !(loan.outstanding > 0)) continue;
    const key = loan.borrowerId.toString();
    const anchor = corpCapitalToAnchor(
      loan.outstanding,
      loan.currency,
      fxByCurrency.get(loan.currency) ?? 1
    );
    byCorp.set(key, (byCorp.get(key) ?? 0) + anchor);
  }
  return byCorp;
}

/** Cash for valuation: overdrawn cash stays negative once the stage is on. */
export function valuationCashAnchor(cashAnchor: number, stage: number): number {
  return stage >= HONEST_LOANS_STAGE ? cashAnchor : Math.max(0, cashAnchor);
}
