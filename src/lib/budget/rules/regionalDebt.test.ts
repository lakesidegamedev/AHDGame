import { describe, expect, it } from "vitest";
import { settleRegionalDebt, regionalDebtApprovalPenalty } from "./regionalDebt";
const input = {
  openingCash: 0,
  annualRevenue: 4800,
  annualPrimarySpending: 9600,
  turn: 1,
  turnsPerYear: 48,
};
describe("regional debt accounting", () => {
  it("borrows only the per-turn shortfall and records an equal liability", () => {
    expect(settleRegionalDebt(input)).toMatchObject({
      principal: 100,
      borrowed: 100,
      cash: 0,
      interestPaid: 0,
    });
    expect(settleRegionalDebt({ ...input, openingCash: 75 })).toMatchObject({
      principal: 25,
      borrowed: 25,
    });
  });
  it("charges interest on opening debt and makes retries inert", () => {
    const previous = settleRegionalDebt(input);
    const result = settleRegionalDebt({ ...input, turn: 2, previous });
    expect(result).toMatchObject({ annualInterest: 5, interestPaid: 0.1, principal: 200.1 });
    expect(settleRegionalDebt({ ...input, turn: 2, previous: result })).toBe(result);
  });
  it("uses a surplus to repay debt before accumulating cash", () => {
    const previous = settleRegionalDebt(input);
    const result = settleRegionalDebt({
      ...input,
      annualPrimarySpending: 0,
      annualRevenue: 9600,
      turn: 2,
      previous,
    });
    expect(result).toMatchObject({ principal: 0, repaid: 100, borrowed: 0, cash: 99.9 });
  });
  it("converts a legacy negative cash balance once without forgiving the obligation", () => {
    const previous = settleRegionalDebt({
      ...input,
      annualPrimarySpending: 4800,
      openingCash: -1000,
    });
    expect(previous.principal).toBe(1001.04);
    expect(
      settleRegionalDebt({ ...input, previous, turn: 2, annualPrimarySpending: 4800 }).principal
    ).toBe(1002.08);
  });
  it("conserves cash and liabilities over 96 turns of deficits and recovery", () => {
    let previous: ReturnType<typeof settleRegionalDebt> | undefined;
    let receipts = 0,
      primaryOutlays = 0,
      interest = 0;
    for (let turn = 1; turn <= 96; turn++) {
      const annualPrimarySpending = turn <= 48 ? 9600 : 0;
      previous = settleRegionalDebt({
        ...input,
        annualPrimarySpending,
        previous,
        openingCash: previous?.cash ?? 0,
        turn,
      });
      receipts += 100;
      primaryOutlays += annualPrimarySpending / 48;
      interest += previous.interestPaid;
      expect(previous.cash - previous.principal).toBeCloseTo(
        receipts - primaryOutlays - interest,
        8
      );
      expect(settleRegionalDebt({ ...input, previous, turn })).toBe(previous);
    }
  });
  it("scales approval by debt burden and caps the penalty", () => {
    expect(regionalDebtApprovalPenalty(0, 100)).toBe(0);
    expect(regionalDebtApprovalPenalty(50, 100)).toBe(-5);
    expect(regionalDebtApprovalPenalty(100, 100)).toBe(-10);
    expect(regionalDebtApprovalPenalty(1000, 100)).toBe(-25);
    expect(regionalDebtApprovalPenalty(1000, 0)).toBe(0);
  });
  it("preserves cents when large balanced cash flows cancel", () => {
    const result = settleRegionalDebt({
      ...input,
      openingCash: 80_000_000_000_000.01,
      annualRevenue: 10_000_000_000_000,
      annualPrimarySpending: 10_000_000_000_000,
    });
    expect(result.cash).toBe(80_000_000_000_000.01);
    expect(result.principal).toBe(0);
  });
  it("rejects invalid money and unsafe balances", () => {
    expect(() => settleRegionalDebt({ ...input, annualRevenue: NaN })).toThrow();
    expect(() => settleRegionalDebt({ ...input, openingCash: 1e17 })).toThrow();
  });

  it("settles a very rich region in whole units instead of failing", () => {
    // A regional treasury holding about 89.6 trillion in local currency is too large for exact cents.
    const result = settleRegionalDebt({
      previous: {
        principal: 0,
        cash: 89_607_752_880_306.78,
        annualInterest: 0,
        interestRate: 0.05,
        lastSettledTurn: 234,
        borrowed: 0,
        repaid: 0,
        interestPaid: 0,
      },
      openingCash: 89_607_752_880_306.78,
      annualRevenue: 29_500_794_905_856,
      annualPrimarySpending: 0,
      turn: 235,
      turnsPerYear: 48,
    });
    expect(result.lastSettledTurn).toBe(235);
    expect(result.principal).toBe(0);
    expect(result.cash).toBeCloseTo(89_607_752_880_307 + 614_599_893_872, -1);
  });
});
