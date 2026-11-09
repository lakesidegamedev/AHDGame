/**
 * Resolves a special presidential election for countries that elect their
 * president over two rounds. A first round winner needs more than half the
 * votes; otherwise the top two meet in a runoff. The winner is seated like any
 * presidential win: previous cabinet cleared, elected term counted.
 */

import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { Campaign, Election, ElectionCandidate, ElectionVoteTally } from "@/lib/db/types";
import { getElectionsCollection } from "@/lib/db/collections/elections";
import { MS_PER_TURN } from "@/lib/constants/turnTime";
import { initElectionVoteTally } from "@/lib/electionEngine/tallyManagement";
import { captureElectionResultSnapshot } from "@/lib/elections/liveResults/captureResultSnapshot";
import type { CountryId } from "@/lib/constants/countries";
import { postSuccessionNews } from "@/lib/elections/resolution/successionNews";
import { seatPresidentialExecutive } from "@/lib/elections/resolution/presidentExecutiveSeating";
import {
  decideTwoRoundPresident,
  SPECIAL_PRESIDENT_RUNOFF_TURNS,
} from "@/lib/elections/rules/twoRoundPresident";

const followupId = (source: string) =>
  new ObjectId(
    createHash("sha256").update(`special-president-runoff:${source}`).digest("hex").slice(0, 24)
  );

async function openRunoff(
  db: Db,
  election: Election,
  finalists: ElectionCandidate[],
  now: Date,
  turn: number
): Promise<void> {
  const electionId = followupId(String(election._id));
  const candidates = db.collection<ElectionCandidate>("electionCandidates");
  const nextCandidates = finalists.map((c) => ({
    ...c,
    _id: followupId(String(c._id)),
    electionId,
    status: "active" as const,
    enteredAt: now,
  }));
  await candidates.bulkWrite(
    nextCandidates.map((candidate) => ({
      updateOne: {
        filter: { _id: candidate._id },
        update: { $setOnInsert: candidate },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  const existingTally = await db
    .collection<ElectionVoteTally>("electionVoteTallies")
    .findOne({ electionId }, { projection: { _id: 1 } });
  if (!existingTally) {
    await initElectionVoteTally(electionId, nextCandidates, election.state, {
      byParty: {},
      recordedAt: now,
    });
  }
  await (
    await getElectionsCollection(db)
  ).updateOne(
    { _id: electionId },
    {
      $setOnInsert: {
        ...election,
        _id: electionId,
        status: "active",
        resolving: false,
        specialPresidentRound: 2,
        specialPresidentPredecessorId: election._id,
        startTurn: turn,
        primaryEndTurn: turn,
        endTurn: turn + SPECIAL_PRESIDENT_RUNOFF_TURNS,
        startTime: now,
        primaryEndTime: now,
        endTime: new Date(now.getTime() + SPECIAL_PRESIDENT_RUNOFF_TURNS * MS_PER_TURN),
        durationHours: SPECIAL_PRESIDENT_RUNOFF_TURNS,
        primaryDurationHours: 0,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );
}

async function markResolved(db: Db, election: Election, now: Date): Promise<void> {
  await (
    await getElectionsCollection(db)
  ).updateOne({ _id: election._id }, { $set: { status: "resolved", updatedAt: now } });
}

/**
 * True once the round is certified and the race marked resolved, null when there is nothing to count so the
 * caller falls back to the generic no-vote handling.
 */
export async function resolveSpecialPresidentElection(
  db: Db,
  election: Election,
  tally: ElectionVoteTally | null,
  now: Date,
  turn: number
): Promise<boolean | null> {
  if (!tally) return null;
  const candidates = await db
    .collection<ElectionCandidate>("electionCandidates")
    .find({ electionId: election._id, ...(tally.finalized ? {} : { status: "active" }) })
    .toArray();
  if (tally.finalized) {
    await db.collection<Campaign>("campaigns").deleteMany({ electionId: election._id });
    await captureElectionResultSnapshot(db, election, now);
    await markResolved(db, election, now);
    return true;
  }
  const votes = Object.fromEntries(
    candidates.map((c) => [String(c._id), tally.totalVotes[String(c._id)] ?? 0])
  );
  const decision = decideTwoRoundPresident(votes, election.specialPresidentRound ?? 1);
  if (decision.outcome === "no_votes") return null;

  if (decision.outcome === "runoff") {
    const finalists = decision.finalistIds.map((id) =>
      candidates.find((c) => String(c._id) === id)
    );
    if (finalists.some((c) => !c)) throw new Error("Special presidential runoff lost a finalist");
    await openRunoff(db, election, finalists as ElectionCandidate[], now, turn);
  } else {
    const winner = candidates.find((c) => String(c._id) === decision.winnerId);
    if (!winner) throw new Error("Special presidential winner missing");
    await seatPresidentialExecutive(db, {
      election,
      winnerCandidate: winner,
      vpCharId: winner.runningMateId,
      now,
      turn,
    });
    await postSuccessionNews(election.countryId as CountryId, {
      event: "seated",
      office: "president",
      ...(winner.characterName ? { holderName: winner.characterName } : {}),
    });
  }
  await db
    .collection<ElectionCandidate>("electionCandidates")
    .updateMany(
      { electionId: election._id, status: "active" },
      { $set: { status: "withdrawn", withdrawnAt: now } }
    );
  await db
    .collection<ElectionVoteTally>("electionVoteTallies")
    .updateOne(
      { electionId: election._id },
      { $set: { finalized: true, resolvedAtTurn: turn, updatedAt: now } }
    );
  await db.collection<Campaign>("campaigns").deleteMany({ electionId: election._id });
  await captureElectionResultSnapshot(db, election, now);
  await markResolved(db, election, now);
  return true;
}
