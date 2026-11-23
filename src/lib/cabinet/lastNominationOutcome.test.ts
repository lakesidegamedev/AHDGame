import { describe, expect, it } from "vitest";
import {
  describeLastNomination,
  lastNominationOutcomes,
  type ClosedNominationInput,
} from "./lastNominationOutcome";

const n = (over: Partial<ClosedNominationInput>): ClosedNominationInput => ({
  positionId: "veterans",
  nomineeCharacterName: "Carlos Shaw",
  status: "withdrawn",
  votesFor: 0,
  votesAgainst: 0,
  proposedAt: new Date("2026-01-01"),
  ...over,
});

describe("lastNominationOutcomes", () => {
  it("reports the rejection and counts earlier withdrawn nominations", () => {
    const map = lastNominationOutcomes([
      n({ proposedAt: new Date("2026-01-01") }),
      n({ proposedAt: new Date("2026-01-02") }),
      n({ proposedAt: new Date("2026-01-03") }),
      n({
        status: "rejected",
        votesFor: 42,
        votesAgainst: 53,
        votingEndsOnTurn: 118,
        proposedAt: new Date("2026-01-04"),
      }),
    ]);
    const outcome = map.get("veterans")!;
    expect(describeLastNomination(outcome)).toBe(
      "Last nominee Carlos Shaw rejected by the Senate 42 to 53, turn 118. 3 earlier nominations were withdrawn when a new one was filed."
    );
  });

  it("labels a superseded nomination as withdrawn, not rejected", () => {
    const map = lastNominationOutcomes([n({})]);
    expect(describeLastNomination(map.get("veterans")!)).toBe(
      "Last nominee Carlos Shaw was withdrawn."
    );
  });

  it("ignores nominations that are still live or confirmed", () => {
    expect(lastNominationOutcomes([n({ status: "confirmed" }), n({ status: "active" })]).size).toBe(
      0
    );
  });
});
