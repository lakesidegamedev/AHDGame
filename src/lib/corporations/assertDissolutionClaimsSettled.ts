import { supplyAgreementsCollection } from "@/lib/db/repositories/supplyAgreements";
import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { badRequest } from "@/lib/api/errors";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { dissolutionClaimBlock } from "./rules/dissolutionClaims";

export async function assertDissolutionClaimsSettled(
  db: Db,
  corporation: Corporation
): Promise<Corporation> {
  const fresh = await corporationsCollection(db).findOne({ _id: corporation._id });
  if (!fresh) throw badRequest("This corporation no longer exists.");
  const block = dissolutionClaimBlock(fresh);
  if (block) throw badRequest(block);
  const loan = await bankLoansCollection(db).findOne(
    {
      borrowerType: "corporation",
      borrowerId: fresh._id,
      status: { $nin: ["repaid", "rejected"] },
      $or: [{ outstanding: { $gt: 0 } }, { status: "pending" }],
    },
    { projection: { _id: 1 } }
  );
  if (loan)
    throw badRequest("Settle or reject outstanding bank loans before dissolving this corporation.");
  const assessment = await supplyAgreementsCollection(db).findOne(
    {
      "transferPricingPendingAssessment.liableCorpId": fresh._id.toHexString(),
    },
    { projection: { _id: 1 } }
  );
  if (assessment)
    throw badRequest(
      "Settle outstanding transfer pricing assessments before dissolving this corporation."
    );
  return fresh;
}
