import { describe, expect, it } from "vitest";
import {
  RD_DEPOSIT_SEED_CEILING_MULTIPLE,
  rdDepositCeiling,
  rdDepositGrowth,
  type RdDepositGrowthInput,
} from "./rdDepositGrowth";

function input(overrides: Partial<RdDepositGrowthInput> = {}): RdDepositGrowthInput {
  return {
    utilization: 0.6,
    bindingResource: "oil",
    recipeResources: ["oil", "natural_gas"],
    currentDeposit: 100_000,
    seedDeposit: 100_000,
    growthFraction: 0.1,
    ...overrides,
  };
}

describe("research deposit growth", () => {
  it("grows only the binding resource of a deposit-constrained mine", () => {
    expect(rdDepositGrowth(input())).toEqual({ resource: "oil", increase: 10_000 });
  });

  it("grants nothing when the mine is not deposit-constrained", () => {
    expect(rdDepositGrowth(input({ utilization: 1 }))).toBeNull();
    expect(rdDepositGrowth(input({ utilization: undefined }))).toBeNull();
    expect(rdDepositGrowth(input({ utilization: Number.NaN }))).toBeNull();
    expect(rdDepositGrowth(input({ bindingResource: null }))).toBeNull();
  });

  it("ignores a binding resource the recipe does not produce", () => {
    expect(rdDepositGrowth(input({ bindingResource: "coal" }))).toBeNull();
  });

  it("clips growth so the deposit lands exactly on the ceiling", () => {
    const growth = rdDepositGrowth(input({ currentDeposit: 290_000, growthFraction: 0.15 }));
    expect(growth).toEqual({ resource: "oil", increase: 10_000 });
  });

  it("grants nothing at or above the ceiling, including already inflated deposits", () => {
    expect(rdDepositGrowth(input({ currentDeposit: 300_000 }))).toBeNull();
    expect(rdDepositGrowth(input({ currentDeposit: 58_000_000 }))).toBeNull();
  });

  it("grants nothing without a seed reference", () => {
    expect(rdDepositGrowth(input({ seedDeposit: undefined }))).toBeNull();
    expect(rdDepositGrowth(input({ seedDeposit: 0 }))).toBeNull();
    expect(rdDepositCeiling(undefined)).toBe(0);
  });

  it("does not compound past the ceiling over many breakthroughs (regression)", () => {
    // The old rule added up to 15% of the CURRENT deposit on every breakthrough:
    // 37 mines in one state compounded a 150k seed to 58.6M. Replay a worst
    // case, every breakthrough rolling the maximum, for 1,000 breakthroughs.
    const seed = 150_000;
    let deposit = seed;
    let uncapped = seed;
    for (let i = 0; i < 1_000; i++) {
      const growth = rdDepositGrowth(
        input({ currentDeposit: deposit, seedDeposit: seed, growthFraction: 0.15 })
      );
      deposit += growth?.increase ?? 0;
      uncapped += Math.round(uncapped * 0.15);
      expect(deposit).toBeLessThanOrEqual(seed * RD_DEPOSIT_SEED_CEILING_MULTIPLE);
    }
    expect(deposit).toBe(seed * RD_DEPOSIT_SEED_CEILING_MULTIPLE);
    expect(uncapped).toBeGreaterThan(seed * 1_000);
  });
});
