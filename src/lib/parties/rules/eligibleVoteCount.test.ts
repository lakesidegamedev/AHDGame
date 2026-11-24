import { describe, expect, it } from "vitest";
import { countEligibleVotes } from "./eligibleVoteCount";

const vote = (voterId: string, v: "yes" | "no") => ({ voterId, vote: v });

describe("countEligibleVotes", () => {
  it("counts only voters in the eligible set", () => {
    const eligible = new Set(["a", "b", "c", "d"]);
    expect(
      countEligibleVotes([vote("a", "yes"), vote("b", "no"), vote("gone", "yes")], eligible)
    ).toEqual({ yes: 1, no: 1, notVoted: 2, eligible: 4 });
  });

  it("counts a voter once even if stored twice", () => {
    const eligible = new Set(["a", "b"]);
    expect(countEligibleVotes([vote("a", "yes"), vote("a", "yes")], eligible)).toEqual({
      yes: 1,
      no: 0,
      notVoted: 1,
      eligible: 2,
    });
  });

  it("gives an empty committee nothing to count", () => {
    expect(countEligibleVotes([vote("a", "yes")], new Set())).toEqual({
      yes: 0,
      no: 0,
      notVoted: 0,
      eligible: 0,
    });
  });
});
