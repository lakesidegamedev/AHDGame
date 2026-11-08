import { describe, expect, it } from "vitest";
import { computeInRaceVotes, computePollHeadline, type PollHeadlineCell } from "./rules";

const cells: Array<PollHeadlineCell & { id: string }> = [
  {
    id: "a",
    share: 0.6,
    turnout: 60,
    economicLean: -4,
    socialLean: -2,
    buckets: { age: "young", wealth: "low" },
  },
  {
    id: "b",
    share: 0.4,
    turnout: 80,
    economicLean: 5,
    socialLean: 3,
    buckets: { age: "senior", wealth: "high" },
  },
];

const candidate = {
  economicPosition: -3,
  socialPosition: -1,
  favorability: 55,
  politicalInfluence: 40,
  approvalBuckets: {},
};

describe("computePollHeadline", () => {
  it("is finite and deterministic over granular cells", () => {
    const first = computePollHeadline(cells, 1_000_000, candidate);
    const second = computePollHeadline(cells, 1_000_000, candidate);
    expect(first).toEqual(second);
    expect(Object.values(first).every(Number.isFinite)).toBe(true);
    expect(first.totalEstimatedVoters).toBe(Math.round(1_000_000 * (0.6 * 0.6 + 0.4 * 0.8)));
  });

  it("moves potential voters with bucket approval but not estimated voters", () => {
    const base = computePollHeadline(cells, 1_000_000, candidate);
    const liked = computePollHeadline(cells, 1_000_000, {
      ...candidate,
      approvalBuckets: { "age:young": 40, "wealth:low": 40 },
    });
    const disliked = computePollHeadline(cells, 1_000_000, {
      ...candidate,
      approvalBuckets: { "age:young": -40, "wealth:low": -40 },
    });
    expect(liked.totalPotentialVoters).toBeGreaterThan(base.totalPotentialVoters);
    expect(disliked.totalPotentialVoters).toBeLessThan(base.totalPotentialVoters);
    expect(liked.totalEstimatedVoters).toBe(base.totalEstimatedVoters);
  });

  it("returns zeros for an empty electorate", () => {
    expect(computePollHeadline([], 1_000_000, candidate)).toEqual({
      overallAppeal: 0,
      totalEstimatedVoters: 0,
      totalPotentialVoters: 0,
    });
  });
});

describe("computeInRaceVotes", () => {
  it("splits each cell's voters by its candidate shares", () => {
    const votes = computeInRaceVotes(
      cells,
      {
        a: { you: 0.5, opponents: [{ id: "r", share: 0.4 }] },
        b: { you: 0.2, opponents: [{ id: "r", share: 0.7 }] },
      },
      1_000_000
    );
    expect(votes.myVotes).toBe(Math.round(360_000 * 0.5 + 320_000 * 0.2));
    expect(votes.opponentVotes.r).toBe(Math.round(360_000 * 0.4 + 320_000 * 0.7));
  });
});
