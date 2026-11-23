import { describe, expect, it } from "vitest";
import { lastQualityChange } from "./qualityChange";

describe("lastQualityChange", () => {
  it("reports the drop against the newest snapshot that differs", () => {
    const change = lastQualityChange(56, [
      { turn: 161, value: 56.2 },
      { turn: 160, value: 79 },
    ]);
    expect(change).toEqual({ from: 79, fromTurn: 160, delta: -23 });
  });

  it("is null when quality has not moved by a visible amount", () => {
    expect(lastQualityChange(79, [{ turn: 160, value: 79.4 }])).toBeNull();
    expect(lastQualityChange(79, [])).toBeNull();
  });
});
