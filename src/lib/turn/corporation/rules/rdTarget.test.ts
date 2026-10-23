import { describe, expect, it, vi } from "vitest";
import { extractionRdTargetIndex } from "./rdTarget";

describe("extraction research target selection", () => {
  it("uses the injected draw among the highest-priority ties", () => {
    expect(extractionRdTargetIndex([0.4, 1, 1], () => 0)).toBe(1);
    expect(extractionRdTargetIndex([0.4, 1, 1], () => 0.99)).toBe(2);
  });
  it("does not pin missing utilization metadata to the first operation", () => {
    expect(extractionRdTargetIndex([undefined, undefined], () => 0)).toBe(0);
    expect(extractionRdTargetIndex([undefined, undefined], () => 0.99)).toBe(1);
  });
  it("retains a unique bottleneck without consuming a magnitude draw", () => {
    const rng = vi.fn(() => 0.99);
    expect(extractionRdTargetIndex([0.4, 1.3, 0.9], rng)).toBe(1);
    expect(rng).not.toHaveBeenCalled();
  });
  it("has no target for an empty portfolio", () => {
    expect(extractionRdTargetIndex([], () => 0)).toBeNull();
  });
});
