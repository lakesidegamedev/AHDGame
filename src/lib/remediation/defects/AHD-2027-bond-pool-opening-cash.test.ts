import { describe, expect, it } from "vitest";
import { allocateOpeningFunding } from "./AHD-2027-bond-pool-opening-cash";

describe("opening bond pool funding", () => {
  it("moves the whole opening allocation from same-currency deposits", () => {
    const sources = [
      { id: "B", balance: 1_731_445_469_307_826 },
      { id: "C", balance: 109_992_682_557_746 },
      { id: "A", balance: 3_592_500_133_320 },
    ];
    const amount = 93_669_071_014_364;
    const debits = allocateOpeningFunding(amount, sources);
    expect(debits.map(({ id }) => id)).toEqual(["A", "B", "C"]);
    expect(debits.reduce((sum, debit) => sum + debit.amount, 0)).toBe(amount);
    expect(debits.every((debit) => debit.amount > 0 && debit.amount <= debit.balance)).toBe(true);
  });

  it("refuses a shortfall instead of partially funding the pool", () => {
    expect(() => allocateOpeningFunding(100, [{ id: "B", balance: 99.99 }])).toThrow(
      /cannot cover/
    );
  });
});
