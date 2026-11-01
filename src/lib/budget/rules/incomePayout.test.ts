import { describe, expect, it } from "vitest";
import { planIncomePayout, taxableDistribution } from "./incomePayout";
const terms = {
  gross: 100,
  income: 100,
  capital: 0,
  sourceFx: 1,
  incomeRates: { national: 20, regional: 10 },
  capitalRates: { national: 10, regional: 0 },
};
describe("income payout priority", () => {
  it("reserves current tax, then pays the oldest debt, then credits net income", () => {
    const paid = planIncomePayout({
      ...terms,
      debts: [
        { id: "new", turn: 11, federal: 50, regional: 0, sourceFx: 1 },
        { id: "old", turn: 2, federal: 40, regional: 0, sourceFx: 1 },
      ],
    });
    expect(paid.currentTax).toBe(30);
    expect(paid.arrears.map((row) => [row.id, row.walletDebit])).toEqual([
      ["old", 40],
      ["new", 30],
    ]);
    expect(paid.net).toBe(0);
    expect(paid.arrears[1].slice.fullyPaid).toBe(false);
  });
  it("preserves prior installments and reconciles debts across currencies", () => {
    const paid = planIncomePayout({
      ...terms,
      sourceFx: 200,
      debts: [{ id: "old", turn: 2, federal: 1, regional: 0, collectedFederal: 0.75, sourceFx: 1 }],
    });
    expect(paid.arrearsPaid).toBe(50);
    expect(paid.net).toBe(20);
    expect(paid.arrears[0].slice.previousFederal).toBe(0.75);
  });
  it("protects returned principal from both tax and income garnishment", () => {
    const paid = planIncomePayout({
      ...terms,
      gross: 1100,
      arrearsExempt: 1000,
      debts: [{ id: "old", turn: 2, federal: 500, regional: 0, sourceFx: 1 }],
    });
    expect(paid.currentTax).toBe(30);
    expect(paid.arrearsPaid).toBe(70);
    expect(paid.net).toBe(1000);
  });
  it("exempts pass-through profit without exempting unrelated capital distributions", () => {
    expect(taxableDistribution(100, 30, 80)).toEqual({ income: 0, capital: 20 });
    expect(taxableDistribution(200, 100, 100, 100)).toEqual({ income: 100, capital: 0 });
  });
  it("rejects invalid income rather than minting or overdrawing money", () => {
    expect(() => planIncomePayout({ ...terms, income: 101, debts: [] })).toThrow();
    expect(() => planIncomePayout({ ...terms, gross: NaN, debts: [] })).toThrow();
  });
});
