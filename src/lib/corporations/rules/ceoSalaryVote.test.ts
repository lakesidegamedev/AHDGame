import { describe, expect, it } from "vitest";
import { ceoSalaryVoteCheck, trailingDailyNetIncome } from "./ceoSalaryVote";

describe("trailingDailyNetIncome", () => {
  it("averages the annualised history and converts to a day", () => {
    expect(trailingDailyNetIncome([3650, 7300])).toBeCloseTo(15, 10);
  });

  it("is zero without history", () => {
    expect(trailingDailyNetIncome(undefined)).toBe(0);
    expect(trailingDailyNetIncome([])).toBe(0);
  });
});

describe("ceoSalaryVoteCheck", () => {
  const base = { currentSalary: 100, trailingDailyNetIncome: 1000, share: 0.25 };

  it("is off when the share is not set", () => {
    expect(ceoSalaryVoteCheck({ ...base, newSalary: 99999, share: 0 }).required).toBe(false);
  });

  it("never asks for a vote to lower or hold pay", () => {
    expect(ceoSalaryVoteCheck({ ...base, newSalary: 100 }).required).toBe(false);
    expect(ceoSalaryVoteCheck({ ...base, newSalary: 40 }).required).toBe(false);
  });

  it("allows a rise within the share of net income", () => {
    expect(ceoSalaryVoteCheck({ ...base, newSalary: 250 }).required).toBe(false);
  });

  it("requires a vote past the share", () => {
    const check = ceoSalaryVoteCheck({ ...base, newSalary: 251 });
    expect(check.required).toBe(true);
    expect(check.freeCeiling).toBe(250);
  });

  it("does not claw back pay already above the share", () => {
    const check = ceoSalaryVoteCheck({ ...base, currentSalary: 900, newSalary: 901 });
    expect(check.required).toBe(true);
    expect(check.freeCeiling).toBe(900);
  });

  it("needs a vote for any rise when net income is zero or negative", () => {
    for (const net of [0, -500]) {
      const check = ceoSalaryVoteCheck({ ...base, trailingDailyNetIncome: net, newSalary: 101 });
      expect(check.required).toBe(true);
      expect(check.noPositiveNetIncome).toBe(true);
    }
  });
});
