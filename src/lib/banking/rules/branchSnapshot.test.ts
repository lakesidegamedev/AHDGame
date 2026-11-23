import { describe, expect, it } from "vitest";
import type { BankCharter } from "@/lib/db/types/bank";
import { bankBranchSnapshot } from "./branchSnapshot";

const charter = (overrides: Partial<BankCharter>): BankCharter =>
  ({
    type: "universal",
    status: "active",
    branchCapacityShare: 0.5,
    totalDeposits: 9_930_540,
    depositCeiling: 32_213_300,
    ...overrides,
  }) as BankCharter;

describe("bankBranchSnapshot", () => {
  it("records deposits, ceiling, fill and the capacity branches took", () => {
    expect(bankBranchSnapshot(charter({}))).toEqual({
      totalDeposits: 9_930_540,
      depositCeiling: 32_213_300,
      branchCapacityShare: 0.5,
      depositFill: 0.3083,
      takenShare: 0.1541,
    });
  });

  it("takes the whole share once deposits fill the ceiling", () => {
    // The turn-137 case: a full ceiling halves a universal bank's financial output.
    const s = bankBranchSnapshot(charter({ totalDeposits: 40_000_000 }));
    expect(s?.depositFill).toBe(1);
    expect(s?.takenShare).toBe(0.5);
  });

  it("records a zero take when deposits or the ceiling are missing", () => {
    const s = bankBranchSnapshot(charter({ depositCeiling: undefined }));
    expect(s?.depositFill).toBe(0);
    expect(s?.takenShare).toBe(0);
    expect(s?.depositCeiling).toBe(0);
  });

  it("records nothing for charters that run no branch network", () => {
    expect(bankBranchSnapshot(charter({ type: "investment" }))).toBeUndefined();
    expect(bankBranchSnapshot(charter({ status: "revoked" }))).toBeUndefined();
    expect(bankBranchSnapshot(null)).toBeUndefined();
    expect(bankBranchSnapshot(undefined)).toBeUndefined();
  });
});
