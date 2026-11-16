import { describe, expect, it } from "vitest";
import {
  cohortMember,
  interimHeadRegion,
  poolCohorts,
  pooledDesire,
  populationShares,
} from "./pooledElectorate";
import { aggregateYesShare, buildReferendumCohorts } from "../cohortEngine";

const profile = [
  {
    dim: "age",
    buckets: [
      { id: "young", sharePct: 40, turnout: 50 },
      { id: "old", sharePct: 60, turnout: 80 },
    ],
  },
];

describe("pooled desire", () => {
  it("weights each member by population", () => {
    const desire = pooledDesire([
      { regionId: "A", population: 9_000_000, desire: 40 },
      { regionId: "B", population: 1_000_000, desire: 80 },
    ]);
    expect(desire).toBeCloseTo(44, 6);
  });

  it("is the member's own desire for a bloc of one", () => {
    expect(pooledDesire([{ regionId: "A", population: 5, desire: 37.5 }])).toBe(37.5);
  });

  it("falls back to equal weights when population is unknown", () => {
    expect(
      populationShares([
        { regionId: "A", population: 0 },
        { regionId: "B", population: 0 },
      ])
    ).toEqual([0.5, 0.5]);
  });
});

describe("pooled cohorts", () => {
  const a = buildReferendumCohorts(profile, 30, {});
  const b = buildReferendumCohorts(profile, 70, {});

  it("returns a bloc of one unchanged", () => {
    expect(poolCohorts([{ regionId: "A", population: 1, cohorts: a }], 30)).toEqual(a);
  });

  it("opens at the pooled target and keeps member identity", () => {
    const pooled = poolCohorts(
      [
        { regionId: "A", population: 3_000_000, cohorts: a },
        { regionId: "B", population: 1_000_000, cohorts: b },
      ],
      40
    );
    expect(pooled.map((c) => c.groupId)).toContain("A:young");
    expect(pooled.map((c) => cohortMember(c.groupId))).toContain("B");
    expect(pooled.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(1, 6);
    expect(aggregateYesShare(pooled, [], 0)).toBeCloseTo(40, 3);
  });

  it("lets a smaller state's cohort move the pooled result less than a larger one's", () => {
    const pooled = poolCohorts(
      [
        { regionId: "A", population: 9_000_000, cohorts: a },
        { regionId: "B", population: 1_000_000, cohorts: b },
      ],
      40
    );
    const base = aggregateYesShare(pooled, [], 0);
    const push = (member: string) =>
      aggregateYesShare(
        pooled,
        pooled
          .filter((c) => cohortMember(c.groupId) === member)
          .map((c) => ({ groupId: c.groupId, turnoutMod: 0, leanMod: 10 })),
        0
      ) - base;
    expect(push("A")).toBeGreaterThan(push("B"));
  });
});

describe("interim head", () => {
  it("is the most populous member, ties to the lower id", () => {
    expect(
      interimHeadRegion([
        { regionId: "VT", population: 1 },
        { regionId: "MA", population: 7 },
        { regionId: "CT", population: 7 },
      ])
    ).toBe("CT");
    expect(interimHeadRegion([])).toBeNull();
  });
});
