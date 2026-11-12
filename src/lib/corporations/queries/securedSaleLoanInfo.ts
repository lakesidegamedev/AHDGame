import { ObjectId, type Db } from "mongodb";
import type { BankLoan } from "@/lib/db/types/bank";
import type { CorporateSector } from "@/lib/db/types/corporation";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";

/**
 * What a buyer's price does to a pledged site's secured loan, in ₳. The lender
 * is paid first out of the price and the buyer takes on no debt; a price below
 * the balance leaves the remainder with the seller. Null when nothing is owed.
 */
export async function buildSecuredLoanInfo(
  db: Db,
  sector: Pick<CorporateSector, "constructionFinancing">,
  listing: { pledged?: boolean; priceAnchor: number },
  sellerFxRate?: number
) {
  const loanId = sector.constructionFinancing?.loanId;
  if (!listing.pledged || !loanId || !ObjectId.isValid(loanId)) return null;
  const loan = await bankLoansCollection(db).findOne(
    { _id: new ObjectId(loanId) },
    { projection: { outstanding: 1, status: 1 } }
  );
  if (!loan || !(loan.outstanding > 0)) return null;
  const outstanding = loan.outstanding / (sellerFxRate && sellerFxRate > 0 ? sellerFxRate : 1);
  return {
    outstandingAnchor: Math.round(outstanding),
    repaidFromPriceAnchor: Math.round(Math.min(outstanding, listing.priceAnchor)),
    remainingAfterSaleAnchor: Math.round(Math.max(0, outstanding - listing.priceAnchor)),
  };
}
