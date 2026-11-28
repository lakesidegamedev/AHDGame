import { withSessionDb } from "@/lib/db/sessionDb";
import type { CountryId } from "@/lib/constants/countries";
import type { Db, ObjectId } from "mongodb";
import type { ExecutiveEndorsement } from "@/lib/db/types";
import { applyEndorsementSupportBump } from "@/lib/elections/campaigns/supportEvents";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { executiveEndorsementsCollection } from "@/lib/db/repositories/executiveEndorsements";

export type ExecutiveWithdrawReason = NonNullable<ExecutiveEndorsement["withdrawnReason"]>;

export async function withdrawExecutiveEndorsement(
  db: Db,
  endorsementId: ObjectId,
  reason: ExecutiveWithdrawReason = "manual",
  countryId?: CountryId
): Promise<{ status: number; body: { success?: boolean; error?: string } }> {
  return withSessionDb(db, async (db) => {
    const endorsement = await executiveEndorsementsCollection(db).findOne({
      _id: endorsementId,
      ...(countryId ? { countryId } : {}),
      isActive: true,
    });

    if (!endorsement)
      return { status: 404, body: { error: "Endorsement not found or already withdrawn." } };

    const res = await executiveEndorsementsCollection(db).updateOne(
      { _id: endorsementId, isActive: true },
      {
        $set: {
          isActive: false,
          withdrawnAt: new Date(),
          withdrawnReason: reason,
        },
      }
    );
    if (res.modifiedCount !== 1) {
      return { status: 404, body: { error: "Endorsement not found or already withdrawn." } };
    }

    if (endorsement && !endorsement.candidateIsNPP) {
      const candidate = await electionCandidatesCollection(db).findOne({
        _id: endorsement.candidateId,
      });
      if (candidate?.characterId) {
        await applyEndorsementSupportBump(db, candidate.characterId, true);
      }
    }

    return { status: 200, body: { success: true } };
  });
}
