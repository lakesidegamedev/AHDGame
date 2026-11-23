import { describe, expect, it } from "vitest";
import { lastTurnStrengthChange } from "./strengthRealizedChange";

describe("lastTurnStrengthChange", () => {
  it("returns null without two rows", () => {
    expect(lastTurnStrengthChange([])).toBeNull();
    expect(lastTurnStrengthChange([{ turn: 5, marketingStrength: 1 }])).toBeNull();
  });
  it("diffs the two newest rows", () => {
    expect(
      lastTurnStrengthChange([
        { turn: 6, marketingStrength: 10.05, logisticsStrength: 8.22, rdScore: 4 },
        { turn: 5, marketingStrength: 10, logisticsStrength: 5, rdScore: 42 },
      ])
    ).toEqual({ turn: 6, marketing: 0.05, logistics: 3.22, rd: -38 });
  });
  it("leaves a field null when an older row lacks it", () => {
    expect(
      lastTurnStrengthChange([
        { turn: 6, marketingStrength: 2, rdScore: 3 },
        { turn: 5, marketingStrength: 1 },
      ])
    ).toEqual({ turn: 6, marketing: 1, logistics: null, rd: null });
  });
});
