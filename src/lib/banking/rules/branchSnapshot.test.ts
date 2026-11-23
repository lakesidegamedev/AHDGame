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
  it("records deposits, ceiling and fill", () => {
    expect(bankBranchSnapshot(charter({}))).toEqual({
      totalDeposits: 9_930_540,
      depositCeiling: 32_213_300,
      branchCapacityShare: 0.5,
      depositFill: 0.3083,
    });
  });

  it("caps the fill at a full ceiling", () => {
    const s = bankBranchSnapshot(charter({ totalDeposits: 40_000_000 }));
    expect(s?.depositFill).toBe(1);
  });

  it("records a zero fill when deposits or the ceiling are missing", () => {
    const s = bankBranchSnapshot(charter({ depositCeiling: undefined }));
    expect(s?.depositFill).toBe(0);
    expect(s?.depositCeiling).toBe(0);
  });

  it("records nothing for charters that run no branch network", () => {
    expect(bankBranchSnapshot(charter({ type: "investment" }))).toBeUndefined();
    expect(bankBranchSnapshot(charter({ status: "revoked" }))).toBeUndefined();
    expect(bankBranchSnapshot(null)).toBeUndefined();
    expect(bankBranchSnapshot(undefined)).toBeUndefined();
  });
});
