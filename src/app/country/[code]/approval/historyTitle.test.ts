import { describe, expect, it } from "vitest";
import { historyTitle } from "./ApprovalClient";

describe("approval history title", () => {
  it("adds the turn's note after the figures", () => {
    expect(
      historyTitle({ turn: 165, approval: 21.5, stateAverage: 35.5, note: "Corrections applied." })
    ).toBe("Turn 165: 21.5% (average 35.5%, national adjustments -14.0). Corrections applied.");
  });
  it("is unchanged without a note", () => {
    expect(historyTitle({ turn: 1, approval: 40 })).toBe("Turn 1: 40.0%");
  });
});
