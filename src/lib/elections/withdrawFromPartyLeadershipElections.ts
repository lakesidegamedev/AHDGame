import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type {
  NationalPartyElection,
  NationalPartyCandidate,
  NationalPartyVote,
} from "@/lib/db/types";

export interface WithdrawFromPartyLeadershipElectionsResult {
  candidatesWithdrawn: number;
  votesDeleted: number;
}

/**
 * Remove departing members from a party's national leadership elections.
 *
 * A departed member's active candidacies are withdrawn and every vote where
 * they are the voter or candidate is deleted, so they are fully removed from
 * the race (live aggregates and withdrawn-candidate filtering do the rest).
 *
 * Only `voting` elections are touched; concluded races are historical record.
 * No-op when `characterIds` is empty or the party has no voting elections.
 */
export async function withdrawFromPartyLeadershipElections(
  db: Db,
  characterIds: ObjectId[],
  partyId: string,
  countryId?: CountryId
): Promise<WithdrawFromPartyLeadershipElectionsResult> {
  if (characterIds.length === 0) return { candidatesWithdrawn: 0, votesDeleted: 0 };

  // Scope by countryId when known to avoid cross-country sequentialId
  // collisions; callers that lack it (rare) fall back to partyId alone.
  const electionQuery: Record<string, unknown> = { partyId, status: "voting" };
  if (countryId) electionQuery.countryId = countryId;
  const votingElections = await db
    .collection<NationalPartyElection>("nationalPartyElections")
    .find(electionQuery)
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();
  if (votingElections.length === 0) return { candidatesWithdrawn: 0, votesDeleted: 0 };

  const electionIds = votingElections.map((e) => e._id);
  const now = new Date();

  const candRes = await db
    .collection<NationalPartyCandidate>("nationalPartyCandidates")
    .updateMany(
      { electionId: { $in: electionIds }, characterId: { $in: characterIds }, status: "active" },
      { $set: { status: "withdrawn", withdrawnAt: now } }
    );

  const voteRes = await db.collection<NationalPartyVote>("nationalPartyVotes").deleteMany({
    electionId: { $in: electionIds },
    $or: [{ voterId: { $in: characterIds } }, { candidateId: { $in: characterIds } }],
  });

  return { candidatesWithdrawn: candRes.modifiedCount, votesDeleted: voteRes.deletedCount };
}
