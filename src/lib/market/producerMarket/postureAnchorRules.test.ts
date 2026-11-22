import { describe, expect, it } from "vitest";
import {
  POSTURE_ANCHOR_MAX_MOVE,
  nextPostureAnchor,
  nextPostureAnchors,
  seedPostureAnchors,
} from "./postureAnchorRules";

describe("posture anchor", () => {
  it("follows the clearing inside the per-turn cap", () => {
    expect(nextPostureAnchor(500, 510)).toBe(510);
    expect(nextPostureAnchor(500, 395)).toBeCloseTo(500 * (1 - POSTURE_ANCHOR_MAX_MOVE), 10);
    expect(nextPostureAnchor(500, 900)).toBeCloseTo(500 * (1 + POSTURE_ANCHOR_MAX_MOVE), 10);
  });

  it("starts at the clearing and keeps its value when a lane did not trade", () => {
    expect(nextPostureAnchor(undefined, 420)).toBe(420);
    expect(nextPostureAnchor(420, undefined)).toBe(420);
    expect(nextPostureAnchor(undefined, undefined)).toBeUndefined();
  });

  it("bounds a -20% seller that sets the clearing to the cap, not 20% a turn", () => {
    let anchor = 586;
    for (let turn = 0; turn < 5; turn++) {
      const clearing = anchor * 0.8;
      anchor = nextPostureAnchor(anchor, clearing)!;
    }
    expect(anchor).toBeCloseTo(586 * (1 - POSTURE_ANCHOR_MAX_MOVE) ** 5, 6);
    expect(anchor).toBeGreaterThan(586 * 0.8 ** 5 * 2);
  });

  it("updates every lane that traded or already had an anchor", () => {
    expect(
      nextPostureAnchors({ "a|world": 100, "b|world": 50 }, { "a|world": 80, "c|world": 7 })
    ).toEqual({ "a|world": 94, "b|world": 50, "c|world": 7 });
  });

  it("seeds from the median of recent clearing so one crushed turn is not locked in", () => {
    expect(
      seedPostureAnchors([
        { "e|world": 586 },
        { "e|world": 560 },
        { "e|world": 546 },
        { "e|world": 494 },
        { "e|world": 395 },
      ])
    ).toEqual({ "e|world": 546 });
    expect(seedPostureAnchors([{ "e|world": 10 }, undefined, { "e|world": 20 }])).toEqual({
      "e|world": 15,
    });
  });
});
