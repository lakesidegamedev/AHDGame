import type { ElectionCandidate } from "@/lib/db/types";
import { ObjectId, type Db } from "mongodb";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";

/** Campaign-strength map key — matches `campaign.candidateId` (nppId for NPP campaigns). */
export function campaignStrengthLookupKey(
  candidate: Pick<ElectionCandidate, "isNPP" | "nppId" | "characterId">
): string {
  if (candidate.isNPP && candidate.nppId) {
    return candidate.nppId.toString();
  }
  return candidate.characterId.toString();
}

/**
 * When an endorsed nominee withdraws, keep the suspender frozen but stop transfers
 * and surface stale-target state in the UI.
 */
export async function invalidateSuspendEndorsementsForWithdrawnCandidate(
  db: Db,
  electionId: ObjectId,
  withdrawnElectionCandidateId: ObjectId
): Promise<number> {
  const now = new Date();
  const result = await electionCandidatesCollection(db).updateMany(
    {
      electionId,
      status: "active",
      campaignSuspended: true,
      endorsedElectionCandidateId: withdrawnElectionCandidateId,
    },
    {
      $set: { endorsementTargetWithdrawnAt: now },
      $unset: { endorsedElectionCandidateId: "" },
    }
  );
  return result.modifiedCount;
}
