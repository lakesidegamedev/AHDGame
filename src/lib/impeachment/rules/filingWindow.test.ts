import { describe, expect, it } from "vitest";
import { impeachmentFilingWindow } from "./filingWindow";

describe("72-turn post-election filing protection", () => {
  it.each([
    [100, 72],
    [101, 71],
    [171, 1],
    [172, 0],
    [200, 0],
  ])("at turn %i has %i turns remaining", (current, remaining) => {
    expect(impeachmentFilingWindow(current, [100])).toEqual({
      lastElectionTurn: 100,
      eligibleOnTurn: 172,
      remainingTurns: remaining,
    });
  });
  it("uses the latest election win in consecutive terms", () => {
    expect(impeachmentFilingWindow(210, [200, 10, 100])).toEqual({
      lastElectionTurn: 200,
      eligibleOnTurn: 272,
      remainingTurns: 62,
    });
  });
  it("does not invent an election date for appointed or opening officeholders", () => {
    expect(impeachmentFilingWindow(100, [])).toEqual({
      lastElectionTurn: null,
      eligibleOnTurn: null,
      remainingTurns: 0,
    });
  });
  it("ignores malformed or future references", () => {
    expect(
      impeachmentFilingWindow(120, [Number.NaN, Infinity, -1, 1.5, 200, 100]).lastElectionTurn
    ).toBe(100);
  });
});
