/** Reuse completed election tallies, including elections resolved before this code was deployed. */
import type { Db } from "mongodb";
import type { Election } from "@/lib/db/types/election";
import type { ElectionVoteTally } from "@/lib/db/types/voteTally";
import type { State } from "@/lib/db/types/state";
import { isResetV2Country } from "@/lib/resetVersions/rules";
import { latestTurnoutReceipts, type TurnoutReceipt } from "./rules/turnoutOwner";

export async function loadTurnoutReadings(
  db: Db,
  input: {
    turn: number;
    sourceTurn: number;
    countries: readonly string[];
    states: readonly Pick<State, "_id" | "countryId" | "votingEligiblePopulation">[];
  }
) {
  const elections = await db
    .collection<Election>("elections")
    .find(
      {
        countryId: { $in: input.countries.filter(isResetV2Country) },
        status: { $in: ["completed", "resolved"] },
      },
      { projection: { _id: 1, countryId: 1, electionType: 1, state: 1, endTurn: 1 } }
    )
    .toArray();
  if (!elections.length) return new Map<string, TurnoutReceipt>();
  const tallies = await db
    .collection<ElectionVoteTally>("electionVoteTallies")
    .find(
      { electionId: { $in: elections.map((e) => e._id) }, finalized: true },
      {
        projection: {
          electionId: 1,
          totalVotes: 1,
          totalVotesByUnit: 1,
          resolvedAtTurn: 1,
          japanShugiinListVotes: 1,
        },
      }
    )
    .toArray();
  const byElection = new Map(elections.map((e) => [e._id.toString(), e]));
  const rows: TurnoutReceipt[] = [];
  for (const tally of tallies) {
    const election = byElection.get(tally.electionId.toString());
    if (!election) continue;
    const eventTurn = tally.resolvedAtTurn ?? election.endTurn;
    if (eventTurn === undefined || eventTurn < input.sourceTurn) continue;
    for (const state of input.states) {
      if (state.countryId !== election.countryId) continue;
      const marks =
        election.electionType === "president"
          ? tally.totalVotesByUnit?.[state._id]
          : election.state === state._id
            ? (tally.japanShugiinListVotes ?? tally.totalVotes)
            : undefined;
      if (!marks) continue;
      rows.push({
        regionId: state._id,
        turn: eventTurn,
        ballots: Object.values(marks).reduce((s, v) => s + Math.max(0, v), 0),
        eligible: state.votingEligiblePopulation ?? 0,
        key: `${election.electionType === "president" ? "0" : "1"}:${election._id.toString()}`,
      });
    }
  }
  return latestTurnoutReceipts(rows, input.turn);
}
