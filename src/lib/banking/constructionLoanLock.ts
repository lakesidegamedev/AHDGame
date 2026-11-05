/** Coordinate construction servicing, cancellation and sales before quoting debt. */
import type { Db } from "mongodb";
import type { BankLoan } from "@/lib/db/types/bank";
import type { CorporateSector } from "@/lib/db/types/corporation";
import { releaseCompletedConstructionFunding } from "./constructionFundingLease";
import { resumeSettlement } from "./settlementJournal";
import { releaseConstructionServiceLease } from "./constructionServiceLease";
import {
  constructionBorrowerTransferTurn,
  loanServiceKeyTurn,
} from "./rules/constructionBorrowerTransfer";

/**
 * Point the loan at the borrower its site's claim names, when the site has
 * already moved to that owner. The sector write is the commit point of a
 * borrower transfer, so this is the whole recovery for an interrupted one and
 * is safe to repeat: it changes nothing unless the site and claim agree on a
 * new owner the loan does not name yet.
 */
export async function alignConstructionBorrowerWithSite(db: Db, loan: BankLoan): Promise<void> {
  const collateral = loan.constructionCollateral;
  if (!collateral || !loan.borrowerId) return;
  const sector = await db
    .collection<CorporateSector>("corporateSectors")
    .findOne(
      { _id: collateral.sectorId },
      { projection: { corporationId: 1, constructionFinancing: 1 } }
    );
  const claim = sector?.constructionFinancing;
  if (
    !sector ||
    claim?.claimId !== collateral.claimId ||
    claim.loanId !== String(loan._id) ||
    claim.borrowerId !== String(sector.corporationId) ||
    claim.borrowerId === String(loan.borrowerId)
  )
    return;
  await db
    .collection<BankLoan>("bankLoans")
    .updateOne(
      {
        _id: loan._id,
        borrowerId: loan.borrowerId,
        "constructionCollateral.claimId": claim.claimId,
      },
      { $set: { borrowerId: sector.corporationId } }
    );
}

export async function releaseConstructionLoanLock(
  db: Db,
  loan: BankLoan,
  key: string
): Promise<void> {
  if (!loan.constructionCollateral) return;
  await db
    .collection<BankLoan>("bankLoans")
    .updateOne(
      { _id: loan._id, constructionSettlementOwner: key },
      { $unset: { constructionSettlementOwner: "" } }
    );
}

/** A different service receipt can be recovered, but an unfinished build stays owned. */
export async function acquireConstructionLoanLock(
  db: Db,
  loan: BankLoan,
  key: string
): Promise<BankLoan | null> {
  if (!loan.constructionCollateral) return loan;
  const loans = db.collection<BankLoan>("bankLoans");
  const acquire = () =>
    loans.findOneAndUpdate(
      {
        _id: loan._id,
        $or: [
          { constructionSettlementOwner: { $exists: false } },
          { constructionSettlementOwner: key },
        ],
      },
      { $set: { constructionSettlementOwner: key } },
      { returnDocument: "after" }
    );
  const owned = await acquire();
  if (owned) return owned;
  const current = await loans.findOne({ _id: loan._id });
  const previous = current?.constructionSettlementOwner;
  if (!current || !previous) return null;
  const collateral = current.constructionCollateral;
  if (collateral && previous === `construction:${collateral.claimId}:funding`) {
    const sector = await db
      .collection<CorporateSector>("corporateSectors")
      .findOne({ _id: collateral.sectorId }, { projection: { constructionFinancing: 1 } });
    const claim = sector?.constructionFinancing;
    if (
      claim?.claimId !== collateral.claimId ||
      claim.loanId !== String(current._id) ||
      claim.bankId !== String(current.bankCorporationId) ||
      claim.charteredTurn !== current.charteredTurn ||
      claim.status !== "building" ||
      !claim.loanFunded ||
      !claim.borrowerContributionPaid ||
      claim.escrowLocal !== 0 ||
      !["current", "arrears"].includes(current.status)
    )
      return null;
    if (!(await releaseCompletedConstructionFunding(db, claim))) return null;
    return acquire();
  }
  const transferTurn = collateral
    ? constructionBorrowerTransferTurn(collateral.claimId, previous)
    : null;
  if (transferTurn !== null) {
    // A borrower transfer finishes inside its own request. Only a later
    // turn's servicing treats one as abandoned, completes it from the site's
    // title, and takes the loan.
    const serviceTurn = loanServiceKeyTurn(String(loan._id), key);
    if (serviceTurn === null || transferTurn >= serviceTurn) return null;
    await alignConstructionBorrowerWithSite(db, current);
    await loans.updateOne(
      { _id: loan._id, constructionSettlementOwner: previous },
      { $unset: { constructionSettlementOwner: "" } }
    );
    return acquire();
  }
  if (!previous.startsWith(`loan-service:${loan._id}:`)) return null;
  const record = await db
    .collection<{ _id: string }>("bankMoneyMoves")
    .findOne({ _id: previous }, { projection: { _id: 1 } });
  if (!record) return null;
  const recovered = await resumeSettlement(db, previous);
  const complete = !recovered.error && ["applied", "replayed"].includes(recovered.status);
  const unfunded =
    recovered.status === "rejected" &&
    recovered.appliedLegs.length === 0 &&
    recovered.appliedProjections.length === 0;
  if (!complete && !unfunded) return null;
  await releaseConstructionServiceLease(db, current.bankCorporationId, current._id, previous);
  return acquire();
}
