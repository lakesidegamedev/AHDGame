import { describe, expect, it } from "vitest";
import { APPROVAL_DECAY_RATE, decayApprovals } from "./approvalDecay";

describe("decayApprovals over per-bucket modifiers", () => {
  const modifiers = { "age:young": 8, "wealth:low": -6, "education:no_college": 0.004 };

  it("decays each dim:bucket key toward zero without changing its sign", () => {
    const decayed = decayApprovals(modifiers)!;
    expect(Object.keys(decayed).sort()).toEqual(Object.keys(modifiers).sort());
    expect(decayed["age:young"]).toBeCloseTo(8 * (1 - APPROVAL_DECAY_RATE), 12);
    expect(decayed["wealth:low"]).toBeCloseTo(-6 * (1 - APPROVAL_DECAY_RATE), 12);
    expect(decayed["education:no_college"]).toBe(0);
    expect(Object.values(decayed).every(Number.isFinite)).toBe(true);
  });

  it("is deterministic and keeps shrinking toward zero over many turns", () => {
    const run = () => {
      let state: Record<string, number> | null = modifiers;
      for (let turn = 0; turn < 48; turn++) state = decayApprovals(state ?? undefined) ?? state;
      return state!;
    };
    const first = run();
    expect(first).toEqual(run());
    expect(Math.abs(first["age:young"])).toBeLessThan(8);
    expect(first["age:young"]).toBeCloseTo(8 * (1 - APPROVAL_DECAY_RATE) ** 48, 9);
  });

  it("needs no write when there is nothing to decay", () => {
    expect(decayApprovals({})).toBeNull();
    expect(decayApprovals({ "age:young": 0 })).toBeNull();
  });
});
