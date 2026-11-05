import type { BankLoan } from "@/lib/db/types/bank";
import type { ConstructionBuildClaim } from "./constructionBuild";

/**
 * A secured construction loan is owed by whoever owns its site. When a site
 * changes owner (an acquisition, a takeover, a spin-off, a nationalization or
 * a privatization), the claim and the loan travel with it: the new owner
 * becomes the borrower and keeps servicing from its own cash, and the lender
 * keeps both the debt and the pledge. No money moves, so nothing has to
 * balance except the one rule that the borrower on the loan and the borrower
 * on the claim always name the site's owner.
 */

/** Loan lock owner for one site's borrower transfer, stamped with its turn. */
export function constructionBorrowerTransferKey(
  claimId: string,
  turn: number,
  operationKey: string
): string {
  return `construction:${claimId}:transfer:${turn}:${operationKey}`;
}

/** Turn a transfer lock was taken in, or null when the key is not a transfer. */
export function constructionBorrowerTransferTurn(claimId: string, key: string): number | null {
  const prefix = `construction:${claimId}:transfer:`;
  if (!key.startsWith(prefix)) return null;
  const turn = Number(key.slice(prefix.length).split(":")[0]);
  return Number.isSafeInteger(turn) ? turn : null;
}

/** Turn embedded in a loan service receipt key, or null for any other key. */
export function loanServiceKeyTurn(loanId: string, key: string): number | null {
  const prefix = `loan-service:${loanId}:`;
  if (!key.startsWith(prefix)) return null;
  const turn = Number(key.slice(prefix.length));
  return Number.isSafeInteger(turn) ? turn : null;
}

/**
 * Why a claim cannot move to a new borrower right now, in words a player can
 * act on, or null when the move is allowed. Only stable, funded builds with a
 * live loan move. Requests still waiting on the bank, defaulted loans held for
 * the lender's sale, and claims with a sale or refund in flight stay put
 * because each of those has its own settlement already running.
 */
export function constructionBorrowerTransferRefusal(input: {
  claim: ConstructionBuildClaim;
  loan: Pick<
    BankLoan,
    | "_id"
    | "borrowerId"
    | "bankCorporationId"
    | "charteredTurn"
    | "currency"
    | "status"
    | "outstanding"
    | "constructionCollateral"
  > | null;
  sectorId: string;
  fromId: string;
  toId: string;
  toCurrency: string | undefined;
}): string | null {
  const { claim, loan, sectorId, fromId, toId, toCurrency } = input;
  if (claim.status === "awaiting_approval" || claim.status === "funding")
    return "A construction loan request on this site is still waiting on the bank. Wait for the decision or withdraw the request first.";
  if (claim.foreclosure || claim.defaultedTurn !== undefined)
    return "This site's construction loan is in default and the site is held for the lender's sale.";
  if (
    claim.status !== "building" ||
    claim.escrowLocal !== 0 ||
    !claim.loanFunded ||
    !claim.borrowerContributionPaid ||
    (claim.sale && claim.sale.aborted !== true) ||
    (claim.cancellation && claim.cancellation.cleanupCompleted !== true)
  )
    return "This site's construction loan is in the middle of a payment, sale or refund. Try again next turn.";
  if (claim.borrowerId !== fromId)
    return "This site's construction loan names a different borrower. Try again next turn.";
  if (toId === fromId) return null;
  if (toId === claim.bankId) return "A bank cannot take over a construction loan it made itself.";
  if (
    !loan ||
    String(loan._id) !== claim.loanId ||
    String(loan.borrowerId) !== fromId ||
    String(loan.bankCorporationId) !== claim.bankId ||
    loan.charteredTurn !== claim.charteredTurn ||
    loan.currency !== claim.currency ||
    loan.constructionCollateral?.claimId !== claim.claimId ||
    String(loan.constructionCollateral.sectorId) !== sectorId ||
    !["current", "arrears"].includes(loan.status) ||
    !Number.isFinite(loan.outstanding) ||
    !(loan.outstanding > 0)
  )
    return "This site's construction loan record is settling. Try again next turn.";
  if (toCurrency !== claim.currency)
    return `This site's construction loan is repaid in ${claim.currency}, but the new owner keeps its cash in ${toCurrency ?? "another currency"}. Repay the loan or sell the site first.`;
  return null;
}

/**
 * Mongo predicate for the single sector write that hands the site to its new
 * owner. It matches only while the claim is still exactly the stable, funded
 * build that was checked, so a sale, refund, default or final repayment that
 * lands first makes the write miss instead of moving a changed claim.
 */
export function transferableConstructionClaimFilter(
  claim: Pick<ConstructionBuildClaim, "claimId" | "borrowerId">
): Record<string, unknown> {
  return {
    $and: [
      { "constructionFinancing.claimId": claim.claimId },
      { "constructionFinancing.borrowerId": claim.borrowerId },
      { "constructionFinancing.status": "building" },
      { "constructionFinancing.escrowLocal": 0 },
      { "constructionFinancing.loanFunded": true },
      { "constructionFinancing.defaultedTurn": { $exists: false } },
      { "constructionFinancing.foreclosure": { $exists: false } },
      {
        $or: [
          { "constructionFinancing.sale": { $exists: false } },
          { "constructionFinancing.sale.aborted": true },
        ],
      },
      {
        $or: [
          { "constructionFinancing.cancellation": { $exists: false } },
          { "constructionFinancing.cancellation.cleanupCompleted": true },
        ],
      },
    ],
  };
}
