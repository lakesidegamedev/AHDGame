import { describe, expect, it } from "vitest";
import { marketingBuyerLines } from "./marketingBuyerRules";
import {
  MARKETING_ADVERTISING_DEMAND_ELASTICITY,
  MARKETING_ADVERTISING_DEMAND_RATE,
  MARKETING_ADVERTISING_REFERENCE_BUDGETS_ANCHOR,
} from "@/lib/constants/commodities";

describe("marketing buyers", () => {
  it("spends one turn's slice of the funded daily budget on advertising", () => {
    const ref = MARKETING_ADVERTISING_REFERENCE_BUDGETS_ANCHOR;
    const [a] = marketingBuyerLines(
      [{ accountId: "a", dailyBudgetAnchor: ref, cashAnchor: ref }],
      24
    );
    expect(a.lines).toEqual([
      {
        commodity: "advertising",
        book: "world",
        amountLocal: (ref * MARKETING_ADVERTISING_DEMAND_RATE) / 24,
      },
    ]);
  });

  it("caps the budget at what cash covers for the next turn", () => {
    const [a] = marketingBuyerLines(
      [{ accountId: "a", dailyBudgetAnchor: 2400, cashAnchor: 10 }],
      24
    );
    const factor = Math.pow(
      240 / MARKETING_ADVERTISING_REFERENCE_BUDGETS_ANCHOR,
      MARKETING_ADVERTISING_DEMAND_ELASTICITY - 1
    );
    expect(a.lines[0].amountLocal).toBeCloseTo(
      (240 * MARKETING_ADVERTISING_DEMAND_RATE * factor) / 24,
      9
    );
  });

  it("skips corporations with no budget or no cash", () => {
    expect(
      marketingBuyerLines(
        [
          { accountId: "a", dailyBudgetAnchor: 0, cashAnchor: 100 },
          { accountId: "b", dailyBudgetAnchor: 100, cashAnchor: 0 },
          { accountId: "c", dailyBudgetAnchor: Number.NaN, cashAnchor: 100 },
        ],
        24
      )
    ).toEqual([]);
  });

  it("rejects an invalid day length", () => {
    expect(() => marketingBuyerLines([], 0)).toThrow();
  });
});
