import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { cumulativeVoteShares } from "./rules/cumulativeVoteShares";
import { tallyPublicationFilter } from "./tallyPublication";

it.each(["finalized", "newer-total", "newer-snapshot"])(
  "refuses stale publication after %s",
  async (race) => {
    const memory = createInMemoryDb();
    const electionId = new ObjectId();
    memory.seed("electionVoteTallies", [
      {
        _id: new ObjectId(),
        electionId,
        finalized: false,
        totalVotes: { a: 100 },
        turnSnapshots: [],
      },
    ]);
    const filter = tallyPublicationFilter({
      electionId,
      totalVotes: { a: 100 },
      snapshots: [],
      turn: 5,
    });
    const change =
      race === "finalized"
        ? { finalized: true }
        : race === "newer-total"
          ? { totalVotes: { a: 200 } }
          : { turnSnapshots: [{ turn: 4 }] };
    await memory.collection("electionVoteTallies").updateOne({ electionId }, { $set: change });
    const result = await memory
      .collection("electionVoteTallies")
      .updateOne(filter, { $set: { totalVotes: { a: 150 } } });
    expect(result.matchedCount).toBe(0);
  }
);
it("uses cumulative settled votes, including bonuses, for shares", () => {
  expect(cumulativeVoteShares({ a: 180, b: 20 })).toEqual({ a: 90, b: 10 });
  expect(cumulativeVoteShares({ a: 180, b: 20 }, 250)).toEqual({ a: 72, b: 8 });
});
