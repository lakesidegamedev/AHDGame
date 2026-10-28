import { describe, expect, it } from "vitest";
import { snapElectionResolutionYear, shouldAnnounceVacancySnap } from "./snapElection";

describe("vacancy snap announcement", () => {
  it("allows a new start after an older snap finishes", () => {
    expect(shouldAnnounceVacancySnap(false, null, 100)).toBe(true);
    expect(shouldAnnounceVacancySnap(false, 100, 300)).toBe(true);
  });
  it("suppresses live, same-turn and stale deliveries", () => {
    expect(shouldAnnounceVacancySnap(true, 100, 101)).toBe(false);
    expect(shouldAnnounceVacancySnap(false, 100, 100)).toBe(false);
    expect(shouldAnnounceVacancySnap(false, 101, 100)).toBe(false);
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
