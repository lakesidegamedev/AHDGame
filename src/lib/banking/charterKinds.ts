import type { BankCharter } from "@/lib/db/types/bank";
import { charterMay } from "@/lib/banking/rules/capabilities";

/**
 * What a bank charter is allowed to do.
 *
 * This predicate decides who may hold player deposits, originate loans, lend
 * on the interbank market, pay deposit interest, and be exposed to a bank run.
 * A drifted copy (say, missing the `status === "active"` half) would let a
 * revoked bank keep taking deposits on one path while others treated it as
 * closed. Keep in sync with `rules/capabilities.ts`, the one place charter
 * types are named.
 *
 * Retail and universal charters take deposits; investment charters do not.
 * `isLendingCharter` is an alias for the same set rather than a fold-away.
 */
export function isDepositTakingCharter(charter: BankCharter | undefined): charter is BankCharter {
  // Structural answer only: the kill switches are checked by the caller, as
  // they always were. The table in `rules/capabilities.ts` is the one place
  // the charter types are named.
  return charterMay(charter, "acceptPlayerDeposits");
}

/**
 * Charters that originate the NPC HOUSEHOLD book.
 *
 * The same set as deposit-taking, and for a real reason rather than an alias:
 * the household book is funded out of the deposit base, so a charter that takes
 * no deposits has nothing to lend households.
 */
export function isLendingCharter(charter: BankCharter | undefined): charter is BankCharter {
  return charterMay(charter, "householdLending");
}

/**
 * Charters that may originate a NAMED loan to a corporation or character.
 *
 * Every active charter, investment included. Underwriting and lending to firms
 * is what an investment bank is FOR, and excluding them was the single largest
 * reason the charter had no viable business.
 *
 * The banking turn services the named loan book of EVERY charter this admits.
 * It used to iterate deposit takers only, so a loan an investment bank was
 * allowed to originate was never advanced: no interest, no principal, no
 * arrears, and the bank still paid margin interest on the cash it had lent.
 *
 * Household lending stays closed to them (see {@link isLendingCharter}); a firm
 * loan is funded from the bank's own capital, which they do have.
 */
export function isNamedLendingCharter(charter: BankCharter | undefined): charter is BankCharter {
  return charterMay(charter, "serviceLoanBook");
}
