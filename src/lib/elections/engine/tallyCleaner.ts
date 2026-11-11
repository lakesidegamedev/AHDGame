/**
 * Withdrawal cleanup removes obsolete seat projections and endorsements.
 * removeWithdrawnCandidateFromTally preserves counted native Assembly votes and
 * nominee labels for certification; other races retain their existing cleanup.
 */

import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Election, ElectionVoteTally } from "@/lib/db/types";
import { RU_1991_ECONOMIC_REGION_POPULATION } from "@/lib/countries/ru/data/ruPopulation1991";
import { invalidateSuspendEndorsementsForWithdrawnCandidate } from "@/lib/campaigns/suspendEndorseLifecycle";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionVoteTalliesCollection } from "@/lib/db/repositories/electionVoteTallies";

export async function removeWithdrawnCandidateFromTally(
  db: Db,
  electionId: ObjectId,
  candidateId: string,
  tallyCache?: Map<string, ElectionVoteTally | null>
): Promise<void> {
  const electionKey = electionId.toString();
  let tally = tallyCache?.get(electionKey);
  if (tally === undefined) {
    tally = await electionVoteTalliesCollection(db).findOne({ electionId });
    tallyCache?.set(electionKey, tally);
  }

  if (!tally) return;

  // Native Assembly ballots retain marks cast before a withdrawal. New accumulations
  // stamp the ledger; older native tallies are identified with one projected read.
  let preserveCastVotes =
    tally.bgOrdinaryBallot === true ||
    tally.bulgarianFoundingBallot === true ||
    tally.hungarianAssemblyBallot === true ||
    tally.russianDumaBallot !== undefined ||
    tally.russianCouncilBallot !== undefined;
  if (
    !preserveCastVotes &&
    (tally.totalVotes[candidateId] ?? 0) > 0 &&
    (tally.state.startsWith("HU_") ||
      tally.state.startsWith("BG_") ||
      countryHasFeature("ruElections", tally.state) ||
      Object.prototype.hasOwnProperty.call(RU_1991_ECONOMIC_REGION_POPULATION, tally.state))
  ) {
    const election = await electionsCollection(db).findOne(
      { _id: electionId },
      {
        projection: {
          countryId: 1,
          electionType: 1,
          russianDumaRound: 1,
          russianCouncilRound: 1,
          hungarianAssemblyRound: 1,
          bulgarianFoundingRound: 1,
          hungarianModernAssembly: 1,
          hungarianModernByElection: 1,
        },
      }
    );
    preserveCastVotes =
      (countryHasFeature("bgElections", election?.countryId) &&
        election.electionType === "nationalAssembly" &&
        election.bulgarianFoundingRound?.ruleVersion === "parallel-1990-v1") ||
      (countryHasFeature("huElections", election?.countryId) &&
        election.electionType === "nationalAssembly" &&
        (election.hungarianAssemblyRound?.ruleVersion === "mixed-1989-v1" ||
          election.hungarianModernAssembly?.ruleVersion === "mixed-2011-v1" ||
          election.hungarianModernByElection != null)) ||
      (countryHasFeature("ruElections", election?.countryId) &&
        ((election.electionType === "dumaDeputy" && election.russianDumaRound !== undefined) ||
          (election.electionType === "federationCouncilMember" &&
            election.russianCouncilRound !== undefined)));
  }

  const unsetPaths: Record<string, ""> = preserveCastVotes
    ? {}
    : {
        [`totalVotes.${candidateId}`]: "",
        [`candidateNames.${candidateId}`]: "",
        [`candidateParties.${candidateId}`]: "",
      };

  for (const [unitId, unitVotes] of Object.entries(
    preserveCastVotes ? {} : (tally.totalVotesByUnit ?? {})
  )) {
    if (candidateId in unitVotes) {
      unsetPaths[`totalVotesByUnit.${unitId}.${candidateId}`] = "";
    }
  }

  if (tally.seatsEstimate && candidateId in tally.seatsEstimate) {
    unsetPaths[`seatsEstimate.${candidateId}`] = "";
  }

  // Presidential maps and EV projections read this granular tally rather than
  // totalVotes. Leaving a withdrawn candidate here let their stale state lead
  // keep earning EVs with no name or party remaining to render.
  for (const unitId of Object.keys(preserveCastVotes ? {} : (tally.totalVotesByUnit ?? {}))) {
    unsetPaths[`totalVotesByUnit.${unitId}.${candidateId}`] = "";
  }

  if (Object.keys(unsetPaths).length)
    await electionVoteTalliesCollection(db).updateOne(
      { electionId },
      { $unset: unsetPaths, $set: { updatedAt: new Date() } }
    );

  if (ObjectId.isValid(candidateId)) {
    await invalidateSuspendEndorsementsForWithdrawnCandidate(
      db,
      electionId,
      new ObjectId(candidateId)
    );
  }
}
