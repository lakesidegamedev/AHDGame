import type { Db, ObjectId } from "mongodb";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import type { Document } from "mongodb";
import { currencyOrdersCollection } from "@/lib/db/repositories/currencyOrders";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { billsCollection } from "@/lib/db/repositories/bills";
import { electionVoteTalliesCollection } from "@/lib/db/repositories/electionVoteTallies";
import { cabinetMembersCollection } from "@/lib/db/repositories/cabinetMembers";
import { cabinetNominationsCollection } from "@/lib/db/repositories/cabinetNominations";
import { congressLeadersCollection } from "@/lib/db/repositories/congressLeaders";
import { stateBillsCollection } from "@/lib/db/repositories/stateBills";

/**
 * Propagate a character name change to all denormalized collections.
 *
 * Character names are snapshotted into many collections when candidates
 * enter elections, get elected, sponsor bills, etc. This function updates
 * all those copies so displays stay current after a rename.
 *
 * Called fire-and-forget from the name change route — failures are logged
 * but don't block the response.
 */
export async function propagateCharacterNameChange(
  db: Db,
  characterId: ObjectId,
  newName: string
): Promise<void> {
  // ── 1. Election candidates ────────────────────────────────────────────────
  await Promise.all([
    electionCandidatesCollection<Document>(db).updateMany(
      { characterId },
      { $set: { characterName: newName } }
    ),
    db
      .collection("nationalCommitteeCandidates")
      .updateMany({ characterId }, { $set: { characterName: newName } }),
    db
      .collection("statePartyCandidates")
      .updateMany({ characterId }, { $set: { characterName: newName } }),
    db
      .collection("nationalPartyCandidates")
      .updateMany({ characterId }, { $set: { characterName: newName } }),
  ]);

  // ── 2. Elected officials & leadership ─────────────────────────────────────
  await Promise.all([
    electedOfficialsCollection<Document>(db).updateMany(
      { characterId },
      { $set: { characterName: newName } }
    ),
    congressLeadersCollection<Document>(db).updateMany(
      { characterId },
      { $set: { characterName: newName } }
    ),
    db
      .collection("committeeAssignments")
      .updateMany({ characterId }, { $set: { characterName: newName } }),
    cabinetMembersCollection<Document>(db).updateMany(
      { characterId },
      { $set: { characterName: newName } }
    ),
  ]);

  // ── 3. Bills (sponsor and co-sponsors) ────────────────────────────────────
  await Promise.all([
    billsCollection<Document>(db).updateMany(
      { sponsorId: characterId },
      { $set: { sponsorName: newName } }
    ),
    stateBillsCollection<Document>(db).updateMany(
      { sponsorId: characterId },
      { $set: { sponsorName: newName } }
    ),
    // Co-sponsors are an embedded array — use arrayFilters
    billsCollection<Document>(db).updateMany(
      { "coSponsors.characterId": characterId },
      { $set: { "coSponsors.$[elem].characterName": newName } },
      { arrayFilters: [{ "elem.characterId": characterId }] }
    ),
  ]);

  // ── 4. Central bank ───────────────────────────────────────────────────────
  await centralBanksCollection(db).updateMany(
    { chairCharacterId: characterId },
    { $set: { chairCharacterName: newName } }
  );

  // Central bank nested arrays: nominations and lobbying pool
  await Promise.all([
    centralBanksCollection(db).updateMany(
      { "nominations.characterId": characterId },
      { $set: { "nominations.$[elem].characterName": newName } },
      { arrayFilters: [{ "elem.characterId": characterId }] }
    ),
    centralBanksCollection(db).updateMany(
      { "nominations.nominatedById": characterId },
      { $set: { "nominations.$[elem].nominatedByName": newName } },
      { arrayFilters: [{ "elem.nominatedById": characterId }] }
    ),
    // lobbyingPool: targetCharacterId is who is being lobbied for (has stored name)
    // lobbyistCharacterId has no stored name field — skip it
    centralBanksCollection(db).updateMany(
      { "lobbyingPool.targetCharacterId": characterId },
      { $set: { "lobbyingPool.$[elem].targetCharacterName": newName } },
      { arrayFilters: [{ "elem.targetCharacterId": characterId }] }
    ),
    // rateHistory.changedBy is stored as ObjectId — must query with ObjectId, not string
    centralBanksCollection(db).updateMany(
      { "rateHistory.changedBy": characterId },
      { $set: { "rateHistory.$[elem].changedByName": newName } },
      { arrayFilters: [{ "elem.changedBy": characterId }] }
    ),
  ]);

  // ── 5. Leadership nominations (nominee + nominator) ───────────────────────
  const nominationCollections = [
    "speakerNominations",
    "houseLeadershipNominations",
    "senateLeadershipNominations",
  ];
  await Promise.all(
    nominationCollections.flatMap((col) => [
      db.collection(col).updateMany({ nomineeId: characterId }, { $set: { nomineeName: newName } }),
      db
        .collection(col)
        .updateMany({ nominatedById: characterId }, { $set: { nominatedByName: newName } }),
    ])
  );

  // Cabinet nominations
  await Promise.all([
    cabinetNominationsCollection<Document>(db).updateMany(
      { nomineeCharacterId: characterId },
      { $set: { nomineeCharacterName: newName } }
    ),
    cabinetNominationsCollection<Document>(db).updateMany(
      { proposedByPresidentId: characterId },
      { $set: { proposedByPresidentName: newName } }
    ),
  ]);

  // UK government formation nominations
  await db
    .collection("governmentFormationVotes")
    .updateMany(
      { "nominees.nomineeCharacterId": characterId },
      { $set: { "nominees.$[elem].nomineeName": newName } },
      { arrayFilters: [{ "elem.nomineeCharacterId": characterId }] }
    );

  // Look up all candidate row ids for this character — playerEndorsements.candidateId
  // and electionVoteTallies.candidateNames are both keyed by the electionCandidates
  // row _id, not characterId (ticket #868).
  const charCandidates = await electionCandidatesCollection<Document>(db)
    .find({ characterId }, { projection: { _id: 1 } })
    .toArray();
  const ownCandidateIds = charCandidates.map((c) => c._id as ObjectId);

  // ── 6. Endorsements ───────────────────────────────────────────────────────
  await Promise.all([
    db
      .collection("playerEndorsements")
      .updateMany({ characterId }, { $set: { characterName: newName } }),
    ownCandidateIds.length > 0
      ? db
          .collection("playerEndorsements")
          .updateMany(
            { candidateId: { $in: ownCandidateIds } },
            { $set: { candidateName: newName } }
          )
      : Promise.resolve(),
    db
      .collection("nppEndorsements")
      .updateMany({ candidateId: characterId }, { $set: { candidateName: newName } }),
  ]);

  // ── 7. Vote tallies (candidateNames is keyed by ElectionCandidate._id) ───
  if (charCandidates.length > 0) {
    await Promise.all(
      charCandidates.map((c) => {
        const candidateIdStr = (c._id as import("mongodb").ObjectId).toString();
        return electionVoteTalliesCollection<Document>(db).updateMany(
          { [`candidateNames.${candidateIdStr}`]: { $exists: true } },
          { $set: { [`candidateNames.${candidateIdStr}`]: newName } }
        );
      })
    );
  }

  // ── 8. Forex / currency orders ────────────────────────────────────────────
  await Promise.all([
    currencyOrdersCollection<Document>(db).updateMany(
      { characterId },
      { $set: { characterName: newName } }
    ),
    currencyOrdersCollection<Document>(db).updateMany(
      { targetCharacterId: characterId },
      { $set: { targetCharacterName: newName } }
    ),
  ]);
}
