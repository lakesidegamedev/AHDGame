import { describe, expect, it } from "vitest";
import { fundedSizeCostPp } from "./fundedSizeCost";

const base = {
  stateOwned: false,
  overheadStage: 0,
  overheadMod: -3,
  sprawlMod: -2,
  dominancePenalty: 0,
};

describe("fundedSizeCostPp", () => {
  it("charges nothing for a private corporation until the overhead stage is on", () => {
    expect(fundedSizeCostPp(base)).toBe(0);
  });

  it("carries private overhead from stage 1 but not private sprawl", () => {
    expect(fundedSizeCostPp({ ...base, overheadStage: 1 })).toBe(3);
  });

  it("carries a state-owned corporation's overhead and sprawl without a stage", () => {
    expect(fundedSizeCostPp({ ...base, stateOwned: true })).toBe(5);
  });

  it("adds the running dominance cost", () => {
    expect(fundedSizeCostPp({ ...base, overheadStage: 1, dominancePenalty: -4 })).toBe(7);
  });

  it("is never a credit", () => {
    expect(fundedSizeCostPp({ ...base, overheadMod: 2, sprawlMod: 1, stateOwned: true })).toBe(0);
  });
});
