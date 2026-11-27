import { withSessionDb } from "@/lib/db/sessionDb";
import { loadChamberSeatWeights } from "../legislative/loadChamberSeatWeights";
/**
 * NPC legislator auto-vote for sovereign-crisis legislative ratification.
 *
 * Per design Section 6.6: "Executive's NPC choice goes to existing legislation
 * flow. No new NPC voting logic — uses whatever AHD's legislative system
 * already does for party-line/standing-orders voting."
 *
 * AHD's existing NPP voting hook (`ideologyVote`) takes a Bill object. We
 * don't have a Bill here — Phase 9b stored votes on the SovereignCrisisDecision
 * row directly. So we approximate the same logic: each NPP votes "for"
 * with a probability biased by their ideology alignment with the executive's
 * chosen resolution path. Determinism: the algorithm is deterministic per
 * NPP (uses NPP._id as a hash seed) so re-runs across turns don't flip votes.
 *
 * Idempotency: each updateOne filters on the NPP's vote field NOT yet
 * existing, so re-runs are safe.
 */

import { ObjectId as MongoObjectId, type Db, type ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { SovereignCrisisDecision } from "@/lib/db/types/sovereignCrisisDecision";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { sovereignCrisisDecisionsCollection } from "@/lib/db/repositories/sovereignCrisisDecisions";

interface NpcLegislatorAutoVoteInput {
  decision: SovereignCrisisDecision;
  /** Index into decision.legislativePhases of the active chamber. */
  chamberIndex: number;
  /** Pure deterministic seed derived from decision._id so re-runs are stable. */
  countryCode: CountryId;
}

export interface NpcLegislatorAutoVoteReport {
  npcsVoted: number;
  votesFor: number;
  votesAgainst: number;
}

const SUPPORT_THRESHOLD = 0.5;

/**
 * Pure: derive a 0..1 support score for an NPP given the executive's choice.
 * Higher = more likely to vote "for". Maps NPP economic/social positions and
 * loyalty into an alignment score with each resolution path.
 *
 * Heuristic — calibration may revise. Each ideological lean nudges support
 * for one option and away from another:
 *   - Free-market (e>0): support bailout/restructure
 *   - Far-left (e<-50): support repudiate/monetize
 *   - Loyalist (loyalty high): defaults to "for" with mild bias
 */
export { computeNpcSupportScore } from "./rules/supportScore";
import { computeNpcSupportScore } from "./rules/supportScore";

/**
 * Deterministic 0..1 derived from the NPP and decision IDs — stable across
 * runs so re-evaluations never flip votes.
 */
function deterministicJitter(nppId: ObjectId, decisionId: ObjectId): number {
  const a = nppId.toHexString();
  const b = decisionId.toHexString();
  let hash = 0;
  for (const ch of a + b) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 1_000_000_007;
  }
  return (hash % 1000) / 1000;
}

export async function runNpcLegislatorAutoVote(
  db: Db,
  input: NpcLegislatorAutoVoteInput
): Promise<NpcLegislatorAutoVoteReport> {
  return withSessionDb(db, (db) => runNpcLegislatorAutoVoteInTransaction(db, input));
}

async function runNpcLegislatorAutoVoteInTransaction(
  db: Db,
  input: NpcLegislatorAutoVoteInput
): Promise<NpcLegislatorAutoVoteReport> {
  const { decision, chamberIndex } = input;
  const phase = decision.legislativePhases?.[chamberIndex];
  if (!phase || phase.outcome !== "pending") {
    return { npcsVoted: 0, votesFor: 0, votesAgainst: 0 };
  }
  const choice = decision.executiveChoice;
  if (!choice) return { npcsVoted: 0, votesFor: 0, votesAgainst: 0 };

  // Find NPPs holding seats in the active chamber for this country, who
  // have NOT already voted on this phase.
  const alreadyVotedIds = Object.keys(phase.votes ?? {});
  const weights = await loadChamberSeatWeights(db, input.countryCode, phase.chamberKey);
  const npps = await nppsCollection(db)
    .find(
      {
        countryId: input.countryCode,
        _id: { $in: [...weights.keys()].map((id) => new MongoObjectId(id)) },
        retiredAt: null,
      } as never,
      { projection: { _id: 1, policies: { economic: 1, social: 1 }, personality: { loyalty: 1 } } }
    )
    .toArray();

  const report: NpcLegislatorAutoVoteReport = {
    npcsVoted: 0,
    votesFor: 0,
    votesAgainst: 0,
  };

  const voteUpdates: Record<string, "for" | "against"> = {};
  const absentVotes: Record<string, { $exists: false }> = {};
  for (const npp of npps) {
    const nppKey = npp._id.toString();
    const weight = weights.get(nppKey) ?? 0;
    if (!weight || alreadyVotedIds.includes(nppKey)) continue;

    const support = computeNpcSupportScore(npp, choice);
    const jitter = deterministicJitter(npp._id, decision._id);
    const vote: "for" | "against" =
      support + (jitter - 0.5) * 0.1 >= SUPPORT_THRESHOLD ? "for" : "against";

    const voteFieldKey = `legislativePhases.${chamberIndex}.votes.${nppKey}`;
    voteUpdates[voteFieldKey] = vote;
    absentVotes[voteFieldKey] = { $exists: false };
    report.npcsVoted++;
    if (vote === "for") report.votesFor += weight;
    else report.votesAgainst += weight;
  }
  if (!report.npcsVoted) return report;
  const result = await sovereignCrisisDecisionsCollection(db).updateOne(
    {
      _id: decision._id,
      state: "executiveProposed",
      currentChamberIndex: chamberIndex,
      executiveChoice: choice,
      [`legislativePhases.${chamberIndex}.chamberKey`]: phase.chamberKey,
      [`legislativePhases.${chamberIndex}.outcome`]: "pending",
      ...absentVotes,
    },
    {
      $set: voteUpdates,
      $inc: {
        [`legislativePhases.${chamberIndex}.votesFor`]: report.votesFor,
        [`legislativePhases.${chamberIndex}.votesAgainst`]: report.votesAgainst,
      },
    }
  );
  if (result.modifiedCount !== 1) return { npcsVoted: 0, votesFor: 0, votesAgainst: 0 };

  return report;
}
