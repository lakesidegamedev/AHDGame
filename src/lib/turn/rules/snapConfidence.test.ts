import { describe, it, expect } from "vitest";
import { snapConfidenceReset, POST_SNAP_CONFIDENCE } from "./snapConfidence";
describe("post-snap confidence", () => {
  it("uses exactly 50", () => expect(POST_SNAP_CONFIDENCE).toBe(50));
  it("accepts the opening turn and advances snap elections", () => {
    expect(snapConfidenceReset(0)).toEqual({ startTurn: 0, value: 50 });
    expect(snapConfidenceReset(3)).toEqual({ startTurn: 3, value: 50 });
    expect(snapConfidenceReset(4, 3)).toEqual({ startTurn: 4, value: 50 });
  });
  it.each([3, 2, 1])("does not renew a completed snap %s", (cycle) =>
    expect(snapConfidenceReset(cycle, 3)).toBeNull()
  );
  it.each([-1, 1.5, NaN, Infinity])("rejects invalid start turn %s", (cycle) =>
    expect(snapConfidenceReset(cycle)).toBeNull()
  );
});
