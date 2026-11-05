/**
 * A funded, stable secured construction claim on an existing sector row, plus
 * its lender and loan, for ownership-change tests on the in-memory database.
 */

import { ObjectId, type Db } from "mongodb";
import type { InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { BankLoan } from "@/lib/db/types/bank";
import type { ConstructionBuildClaim } from "@/lib/banking/rules/constructionBuild";

export const SECURED_PRINCIPAL = 75_000;
export const BANK_RESERVES = 1_000_000;

export async function attachSecuredConstructionClaim(
  memory: InMemoryDb,
  input: { sectorId: ObjectId; borrowerId: ObjectId; currency?: string }
): Promise<{ bankId: ObjectId; loanId: ObjectId; claim: ConstructionBuildClaim }> {
  const bankId = new ObjectId(),
    loanId = new ObjectId();
  const currency = input.currency ?? "USD";
  const order = {
    unitsOrdered: 100,
    costPaidAnchor: 100_000,
    startTurn: 10,
    onlineTurn: 14,
    smooth: true,
    constructionClaimId: "pledge",
    constructionLoanId: String(loanId),
  };
  const claim: ConstructionBuildClaim = {
    claimId: "pledge",
    loanId: String(loanId),
    bankId: String(bankId),
    charteredTurn: 2,
    borrowerId: String(input.borrowerId),
    currency,
    constructionCostLocal: 100_000,
    collateralCostLocal: 100_000,
    borrowerContributionLocal: 25_750,
    principal: SECURED_PRINCIPAL,
    proceedsLocal: 74_250,
    termTurns: 48,
    ratePercent: 5,
    order,
    status: "building",
    escrowLocal: 0,
    borrowerContributionPaid: true,
    loanFunded: true,
    fundingCleanupCompleted: true,
  };
  const loan: BankLoan = {
    _id: loanId,
    bankCorporationId: bankId,
    charteredTurn: 2,
    currency: currency as BankLoan["currency"],
    borrowerType: "corporation",
    borrowerId: input.borrowerId,
    principal: SECURED_PRINCIPAL,
    outstanding: SECURED_PRINCIPAL,
    ratePercent: 5,
    originatedTurn: 10,
    termTurns: 48,
    status: "current",
    constructionCollateral: {
      claimId: "pledge",
      sectorId: input.sectorId,
      quotedCostLocal: 100_000,
      constructionCostLocal: 100_000,
    },
  };
  memory.seed("corporations", [
    {
      _id: bankId,
      name: "Lender",
      liquidCapital: 0,
      bankCharter: {
        type: "investment",
        status: "active",
        currency,
        charteredTurn: 2,
        cashReserves: BANK_RESERVES,
        totalLoans: SECURED_PRINCIPAL,
      },
    },
  ]);
  memory.seed("bankLoans", [{ ...loan }]);
  const db = memory as unknown as Db;
  await db
    .collection("corporateSectors")
    .updateOne(
      { _id: input.sectorId },
      { $set: { constructionFinancing: claim, buildQueue: [order] } }
    );
  return { bankId, loanId, claim };
}
