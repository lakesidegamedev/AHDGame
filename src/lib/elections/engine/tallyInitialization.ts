import { getDb } from "@/lib/mongodb";
import type { ElectionCandidate, ElectionVoteTally, PrimaryResults } from "@/lib/db/types";
import { ObjectId } from "mongodb";

import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

import { electionsCollection } from "@/lib/db/repositories/elections";

import { electionVoteTalliesCollection } from "@/lib/db/repositories/electionVoteTallies";

// ─── Initialize a blank tally for an election ────────────────────────────────

export async function initElectionVoteTally(
  electionId: ObjectId,
  candidates: ElectionCandidate[],
  state: string,
  primaryResults?: PrimaryResults,
  options?: { countingMethod: "pr_stv" }
): Promise<void> {
  const db = await getDb();
  const now = new Date();

  const totalVotes: Record<string, number> = {};
  const candidateNames: Record<string, string> = {};
  const candidateParties: Record<string, string> = {};

  for (const c of candidates) {
    totalVotes[c._id.toString()] = 0;
    candidateNames[c._id.toString()] = c.characterName;
    candidateParties[c._id.toString()] = c.party;
  }

  // Primary ballots accrued during the primary window live on the same doc,
  // and this init runs replaceOne — carry them across or the general-phase
  // re-init silently erases the primary's entire count.
  const existing = await electionVoteTalliesCollection(db).findOne(
    { electionId },
    {
      projection: {
        primaryVotes: 1,
        hungarianAssemblyBallot: 1,
        bulgarianFoundingBallot: 1,
        countingMethod: 1,
        rankedBallots: 1,
        finalized: 1,
        updatedAt: 1,
        totalVotes: 1,
        "turnSnapshots.turn": 1,
      },
    }
  );
  const countingMethod = options?.countingMethod ?? existing?.countingMethod;
  if (countingMethod === "pr_stv") {
    if (
      existing?.finalized ||
      existing?.rankedBallots?.length ||
      existing?.turnSnapshots?.length ||
      Object.values(existing?.totalVotes ?? {}).some((votes) => votes > 0)
    )
      throw new Error("Cannot reinitialize a PR-STV tally after ballots were cast");
    const election = await electionsCollection(db).findOne({ _id: electionId });
    if (
      !countryHasFeature("ieElections", election?.countryId) ||
      !["dail", "localCouncil"].includes(election.electionType)
    )
      throw new Error("Ranked PR-STV is supported only for Irish Dail and local council races");
  }

  const doc: ElectionVoteTally = {
    // Preserve the matched doc's _id: legacy tallies carry an auto-generated
    // ObjectId, and replaceOne rejects a replacement whose _id differs from
    // the matched document's (immutable-field MongoServerError).
    _id: existing?._id ?? electionId,
    electionId,
    state,
    totalVotes,
    ...(countingMethod ? { countingMethod, rankedBallots: [] } : {}),
    candidateNames,
    candidateParties,
    turnSnapshots: [],
    finalized: false,
    ...(primaryResults && { primaryResults }),
    ...(existing?.primaryVotes && { primaryVotes: existing.primaryVotes }),
    ...(existing?.hungarianAssemblyBallot && { hungarianAssemblyBallot: true }),
    ...(existing?.bulgarianFoundingBallot && { bulgarianFoundingBallot: true }),
    createdAt: now,
    updatedAt: now,
  };

  if (countingMethod === "pr_stv") {
    if (!existing) {
      // A concurrent initializer can create or accrue the tally while this
      // call validates the race. Never replace the document it produced.
      await electionVoteTalliesCollection(db).updateOne(
        { electionId },
        { $setOnInsert: doc },
        { upsert: true }
      );
      return;
    }
    const replaced = await electionVoteTalliesCollection(db).replaceOne(
      {
        electionId,
        finalized: false,
        turnSnapshots: { $size: 0 },
        updatedAt: existing.updatedAt,
      },
      doc
    );
    if (replaced.matchedCount !== 1)
      throw new Error("Cannot reinitialize a PR-STV tally after its revision changed");
    return;
  }
  await electionVoteTalliesCollection(db).replaceOne({ electionId }, doc, { upsert: true });
}
