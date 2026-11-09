import type { BankLoan } from "@/lib/db/types/bank";

/**
 * When a corporation is absorbed and deleted, its ordinary bank loans become
 * the absorbing corporation's debt: the bank keeps the loan, and the new
 * borrower services it from its own cash each turn. Secured construction
 * loans are not covered here; they follow their sites
 * (see `constructionBorrowerTransfer`).
 */

/** Loan statuses that still have a balance to service. */
export const ASSUMABLE_LOAN_STATUSES: readonly BankLoan["status"][] = ["current", "arrears"];

/**
 * Why the absorbing corporation cannot take the loans on, in words a player
 * can act on, or null when it can. A request still waiting on its bank was
 * priced for the old borrower, and servicing takes the loan currency straight
 * out of the borrower's cash, so a currency mismatch would charge the wrong
 * money.
 */
export function corporateLoanAssumptionRefusal(
  loans: readonly Pick<BankLoan, "status" | "currency">[],
  toCurrency: string | undefined
): string | null {
  if (loans.some((loan) => loan.status === "pending"))
    return "The target has a bank loan request still waiting on the bank. Withdraw it or wait for the decision first.";
  const mismatch = loans.find(
    (loan) => ASSUMABLE_LOAN_STATUSES.includes(loan.status) && loan.currency !== toCurrency
  );
  if (mismatch)
    return `The target owes a bank loan repaid in ${mismatch.currency}, but the new owner keeps its cash in ${toCurrency ?? "another currency"}. Repay the loan first.`;
  return null;
}
