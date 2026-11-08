import { describe, expect, it } from "vitest";
import { BY_ELECTION_FILL_LEAD_TURNS, needsFillCandidate, pickFillParty } from "./byElectionFill";

describe("needsFillCandidate", () => {
  const base = { activeCandidateCount: 0, primaryEndTurn: 100 };

  it("waits until the filing window is about to close", () => {
    expect(
      needsFillCandidate({ ...base, currentTurn: 100 - BY_ELECTION_FILL_LEAD_TURNS - 1 })
    ).toBe(false);
    expect(needsFillCandidate({ ...base, currentTurn: 100 - BY_ELECTION_FILL_LEAD_TURNS })).toBe(
      true
    );
  });

  it("does nothing once the window has closed or someone has filed", () => {
    expect(needsFillCandidate({ ...base, currentTurn: 100 })).toBe(false);
    expect(needsFillCandidate({ ...base, activeCandidateCount: 1, currentTurn: 99 })).toBe(false);
  });
});

describe("pickFillParty", () => {
  it("prefers the seat's previous party", () => {
    expect(pickFillParty("3", ["1", "3"])).toBe("3");
  });

  it("falls back to the first eligible party", () => {
    expect(pickFillParty("9", ["1", "3"])).toBe("1");
    expect(pickFillParty(null, ["2"])).toBe("2");
  });

  it("returns null when no party can field", () => {
    expect(pickFillParty("3", [])).toBeNull();
  });
});
