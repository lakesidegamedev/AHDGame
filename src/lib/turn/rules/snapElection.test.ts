import { describe, expect, it } from "vitest";
import {
  snapElectionResolutionYear,
  shouldStartVacancySnap,
  canDissolveOnConfidence,
} from "./snapElection";

describe("vacancy snap announcement", () => {
  it("allows a new start after an older snap finishes", () => {
    expect(shouldStartVacancySnap(false, null, 100)).toBe(true);
    expect(shouldStartVacancySnap(false, 100, 300)).toBe(true);
  });
  it("suppresses live, same-turn and stale deliveries", () => {
    expect(shouldStartVacancySnap(true, 100, 101)).toBe(false);
    expect(shouldStartVacancySnap(false, 100, 100)).toBe(false);
    expect(shouldStartVacancySnap(false, 101, 100)).toBe(false);
  });
});

describe("snapElectionResolutionYear", () => {
  it("uses the general-election end turn instead of the canonical cycle year", () => {
    expect(
      snapElectionResolutionYear(1228, {
        startingYear: 1953,
        preIterationTurns: 48,
      })
    ).toBe(1977);
  });

  it("keeps the calendar pinned during an active founding phase", () => {
    expect(
      snapElectionResolutionYear(400, {
        startingYear: 1953,
        preIterationActive: true,
      })
    ).toBe(1953);
  });

  it("works without a pre-iteration offset", () => {
    expect(snapElectionResolutionYear(49, { startingYear: 2019 })).toBe(2020);
  });
});

describe("confidence dissolution eligibility", () => {
  it.each([undefined, null, "pending", "collapsed"])(
    "does not dissolve a %s government",
    (status) => {
      expect(canDissolveOnConfidence(status, false)).toBe(false);
      expect(canDissolveOnConfidence(status, true)).toBe(false);
    }
  );
  it("requires a seated head even when the status is formed", () => {
    expect(canDissolveOnConfidence("formed", false)).toBe(false);
    expect(canDissolveOnConfidence("formed", true)).toBe(true);
  });
});
