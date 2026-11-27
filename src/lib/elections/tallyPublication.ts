import type { ObjectId } from "mongodb";
import type { VoteTurnSnapshot } from "@/lib/db/types";

/** Publish only over the exact cumulative revision underlying a slice. */
export function tallyPublicationFilter(input: {
  electionId: ObjectId;
  totalVotes: Record<string, number>;
  snapshots: VoteTurnSnapshot[];
  turn: number;
  slicePart?: "early" | "rest";
}) {
  return {
    electionId: input.electionId,
    finalized: false,
    totalVotes: input.totalVotes,
    turnSnapshots: {
      $size: input.snapshots.length,
      $not: {
        $elemMatch:
          input.slicePart === "rest"
            ? { turn: input.turn, slicePart: { $ne: "early" } }
            : { turn: input.turn },
      },
    },
  };
}
