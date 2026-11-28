import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRANCH_CAPACITY_SHARE,
  DEPOSIT_CEILING_PER_CAPACITY_UNIT,
  MAX_BRANCH_CAPACITY_SHARE,
  MIN_BRANCH_CAPACITY_SHARE,
  computeDepositCeiling,
  financialSectorCapacityUnits,
  getBranchCapacityShare,
} from "../capacityAllocation";

describe("capacityAllocation pure math", () => {
  it("defaults unset branchCapacityShare to 0.5", () => {
    expect(getBranchCapacityShare(undefined)).toBe(DEFAULT_BRANCH_CAPACITY_SHARE);
    expect(getBranchCapacityShare({})).toBe(0.5);
    expect(getBranchCapacityShare({ branchCapacityShare: 0.3 })).toBe(0.3);
    expect(getBranchCapacityShare({ branchCapacityShare: Number.NaN })).toBe(0.5);
  });

  it("computeDepositCeiling multiplies capacity × share × constant", () => {
    expect(computeDepositCeiling(250, 0.5)).toBe(250 * 0.5 * DEPOSIT_CEILING_PER_CAPACITY_UNIT);
    expect(computeDepositCeiling(0, 0.5)).toBe(0);
    expect(computeDepositCeiling(100, 0)).toBe(0);
  });

  it("typical starter financial sector at 50% share is ~15× charter capital", () => {
    // Derivation pinned in capacityAllocation.ts: 250 units × 0.5 × 1.2M = 150M
    // vs charter capital 10M ⇒ 15×.
    const ceiling = computeDepositCeiling(250, 0.5);
    expect(ceiling).toBe(150_000_000);
    expect(ceiling / 10_000_000).toBe(15);
  });

  it("financialSectorCapacityUnits prefers capitalStock", () => {
    expect(
      financialSectorCapacityUnits(
        { capitalStock: 400, revenue: 1_000_000, sectorType: "financial" },
        1
      )
    ).toBe(400);
  });

  it("financialSectorCapacityUnits falls back to implied units from revenue", () => {
    const units = financialSectorCapacityUnits(
      { revenue: 1_000_000, sectorType: "financial", strategyId: "standard" },
      1
    );
    expect(units).toBeCloseTo(250, 5);
  });

  it("CEO slider band is 0.1..0.9", () => {
    expect(MIN_BRANCH_CAPACITY_SHARE).toBe(0.1);
    expect(MAX_BRANCH_CAPACITY_SHARE).toBe(0.9);
  });
  it.each([0, -1, NaN, Infinity])(
    "does not count undelivered or invalid explicit stock %s as revenue-based capacity",
    (stock) => {
      expect(
        financialSectorCapacityUnits(
          { capitalStock: stock, revenue: 1000000, sectorType: "financial" },
          1
        )
      ).toBe(0);
    }
  );
});
