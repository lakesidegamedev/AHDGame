import { describe, expect, it } from "vitest";
import { APPROVAL_DECAY_RATE, APPROVAL_ZERO_THRESHOLD, decayApprovals } from "./approvalDecay";

function advance(start: number, turns: number): number {
  let record = { bucket: start };
  for (let turn = 0; turn < turns; turn++)
    record = (decayApprovals(record) ?? record) as { bucket: number };
  return record.bucket;
}
describe("approval decay precision", () => {
  it.each([0.02, 0.1, 0.18, 0.8, 1, 1.2, 10, 100])(
    "decays both signs of %s without a rounding floor",
    (start) => {
      const one = advance(start, 1);
      expect(one).toBeCloseTo(start * (1 - APPROVAL_DECAY_RATE), 12);
      expect(one).toBeLessThan(start);
      expect(advance(-start, 1)).toBe(-one);
      expect(advance(start, 139)).toBeLessThanOrEqual(start / 2);
      expect(advance(-start, 139)).toBeGreaterThanOrEqual(-start / 2);
      expect(advance(start, 2000)).toBe(0);
      expect(advance(-start, 2000)).toBe(0);
    }
  );
  it("matches compound decay over a game year without losing sub-cent changes", () => {
    expect(advance(0.18, 48)).toBeCloseTo(0.18 * Math.pow(0.995, 48), 12);
    expect(advance(0.18, 48)).not.toBe(0.18);
  });
  it("keeps the existing zero threshold and does not cross zero", () => {
    expect(advance(APPROVAL_ZERO_THRESHOLD, 1)).toBe(0);
    expect(advance(-APPROVAL_ZERO_THRESHOLD, 1)).toBe(0);
    expect(advance(0, 2000)).toBe(0);
  });
  it("skips absent, empty and already-zero records", () => {
    expect(decayApprovals(undefined)).toBeNull();
    expect(decayApprovals({})).toBeNull();
    expect(decayApprovals({ bucket: 0 })).toBeNull();
  });
});
