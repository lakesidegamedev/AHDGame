/**
 * A finalized result still needs candidate and campaign cleanup after a retry.
 * The stored seat allocation identifies winners without allocating seats again.
 */
import type { Db } from "mongodb";
import type { Election, ElectionCandidate, ElectionVoteTally } from "@/lib/db/types";
import { MULTI_SEAT_TYPES, isSpecialCommonsElection } from "@/lib/utils/electionLabels";
import { getChamberClass, sweepStaleOffice } from "./generalResolutionHelpers";
import { updatePartyPresence } from "@/lib/turn/partyOrg";
import { updatePoliticianPagesAfterElection } from "@/lib/wiki/updatePoliticianPageOnElection";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { campaignsCollection } from "@/lib/db/repositories/campaigns";
import type { Document } from "mongodb";

export async function finishFinalizedElectionCleanup(
  db: Db,
  election: Election,
  tally: ElectionVoteTally,
  now: Date
): Promise<void> {
  const candidates = await electionCandidatesCollection(db)
    .find({ electionId: election._id })
    .toArray();
  const seats = tally.seatsEstimate ?? {};
  const winners = candidates.filter((c) => (seats[c._id.toString()] ?? 0) > 0);
  await electionCandidatesCollection(db)
    .updateMany(
      { electionId: election._id, status: "active" },
      { $set: { status: "withdrawn", withdrawnAt: now } }
    );
  const characterIds = winners.flatMap((c) => (!c.isNPP && c.characterId ? [c.characterId] : []));
  const nppIds = winners.flatMap((c) => (c.isNPP && c.nppId ? [c.nppId] : []));
  if (characterIds.length || nppIds.length)
    await electionCandidatesCollection(db).updateMany(
      {
        electionId: { $ne: election._id },
        status: "active",
        $or: [{ characterId: { $in: characterIds } }, { nppId: { $in: nppIds } }],
      },
      { $set: { status: "withdrawn", withdrawnAt: now } }
    );
  await campaignsCollection<Document>(db).deleteMany({ electionId: election._id });
  if (election.state) {
    for (const party of new Set(candidates.map((c) => c.party).filter(Boolean)))
      await updatePartyPresence(db, election.state, party);
    if (
      MULTI_SEAT_TYPES.has(election.electionType) &&
      !isSpecialCommonsElection(election.electionType)
    )
      await sweepStaleOffice(
        db,
        election.electionType,
        election.state,
        now,
        getChamberClass(election)
      );
  }
  const winnerIds = new Set(winners.map((c) => c._id.toString()));
  const candidateIds = candidates.map((c) => c._id.toString());
  await updatePoliticianPagesAfterElection(
    db,
    election,
    candidateIds,
    tally,
    winnerIds,
    new Set(candidateIds.filter((id) => !winnerIds.has(id))),
    seats,
    now
  );
}
