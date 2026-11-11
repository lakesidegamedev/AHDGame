/**
 * Withdraws party-leadership / committee candidacies and deletes party-leadership
 * / committee votes belonging to a banned user's character(s).
 *
 * Called from the admin ban handler. Mirrors the existing
 * `withdrawAllCandidatesForUser` cleanup for governmental elections, but
 * targets the three party-internal election types — national party leadership,
 * state party leadership, and national committee — none of which were covered
 * before. Without this, banned users' votes continue to count toward leadership
 * tallies and their names remain on candidate lists.
 */

import type { Db, ObjectId } from "mongodb";
import type {
  StatePartyCandidate,
  StatePartyVote,
  NationalPartyCandidate,
  NationalPartyVote,
  NationalCommitteeCandidate,
  NationalCommitteeVote,
} from "@/lib/db/types";
import { cleanupCaucusParticipationForCharacters } from "@/lib/caucus/cleanupCaucusParticipationForCharacters";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statePartyCandidatesCollection } from "@/lib/db/repositories/statePartyCandidates";
import { nationalPartyCandidatesCollection } from "@/lib/db/repositories/nationalPartyCandidates";
import { nationalCommitteeCandidatesCollection } from "@/lib/db/repositories/nationalCommitteeCandidates";
import { statePartyVotesCollection } from "@/lib/db/repositories/statePartyVotes";
import { nationalPartyVotesCollection } from "@/lib/db/repositories/nationalPartyVotes";
import { nationalCommitteeVotesCollection } from "@/lib/db/repositories/nationalCommitteeVotes";

export interface CleanupResult {
  characterIds: string[];
  nationalPartyCandidatesWithdrawn: number;
  nationalPartyVotesDeleted: number;
  statePartyCandidatesWithdrawn: number;
  statePartyVotesDeleted: number;
  committeeCandidatesWithdrawn: number;
  committeeVotesDeleted: number;
  caucusChairCandidatesWithdrawn: number;
  caucusChairVotesDeleted: number;
}

export async function cleanupPartyElectionsForBannedUser(
  db: Db,
  userId: ObjectId
): Promise<CleanupResult> {
  const characters = await charactersCollection(db)
    .find({ userId })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();

  const result: CleanupResult = {
    characterIds: characters.map((c) => c._id.toString()),
    nationalPartyCandidatesWithdrawn: 0,
    nationalPartyVotesDeleted: 0,
    statePartyCandidatesWithdrawn: 0,
    statePartyVotesDeleted: 0,
    committeeCandidatesWithdrawn: 0,
    committeeVotesDeleted: 0,
    caucusChairCandidatesWithdrawn: 0,
    caucusChairVotesDeleted: 0,
  };

  if (characters.length === 0) return result;

  const characterIds = characters.map((c) => c._id);
  const now = new Date();

  // Six independent collections plus caucus cleanup, all in one round.
  const [npcRes, npvRes, spcRes, spvRes, nccRes, ncvRes, caucusCleanup] = await Promise.all([
    nationalPartyCandidatesCollection(db).updateMany(
      { characterId: { $in: characterIds }, status: "active" },
      { $set: { status: "withdrawn", withdrawnAt: now } }
    ),
    nationalPartyVotesCollection(db).deleteMany({ voterId: { $in: characterIds } }),
    statePartyCandidatesCollection(db).updateMany(
      { characterId: { $in: characterIds }, status: "active" },
      { $set: { status: "withdrawn", withdrawnAt: now } }
    ),
    statePartyVotesCollection(db).deleteMany({ voterId: { $in: characterIds } }),
    nationalCommitteeCandidatesCollection(db).updateMany(
      { characterId: { $in: characterIds }, status: "active" },
      { $set: { status: "withdrawn", withdrawnAt: now } }
    ),
    nationalCommitteeVotesCollection(db).deleteMany({ voterId: { $in: characterIds } }),
    cleanupCaucusParticipationForCharacters(db, characterIds, {
      removeMembership: false,
      now,
    }),
  ]);
  result.nationalPartyCandidatesWithdrawn = npcRes.modifiedCount;
  result.nationalPartyVotesDeleted = npvRes.deletedCount;
  result.statePartyCandidatesWithdrawn = spcRes.modifiedCount;
  result.statePartyVotesDeleted = spvRes.deletedCount;
  result.committeeCandidatesWithdrawn = nccRes.modifiedCount;
  result.committeeVotesDeleted = ncvRes.deletedCount;
  result.caucusChairCandidatesWithdrawn = caucusCleanup.candidaciesWithdrawn;
  result.caucusChairVotesDeleted = caucusCleanup.votesDeleted;

  return result;
}
