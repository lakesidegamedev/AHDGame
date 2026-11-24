import { describe, it, expect } from "vitest";
import { restateHistoryFinancials } from "./historyCurrency";
describe("recorded income currency", () => {
  it("keeps same-currency figures native despite live FX moving", () => {
    const row = { currencyCode: "CAD", fxRateAtWrite: 2, income: 100 };
    expect(restateHistoryFinancials(row, "CAD", 4, ["income"])?.income).toBe(100);
    expect(row.income).toBe(100);
  });
  it("uses the recorded source rate to restate all monetary components together", () => {
    const row = {
      currencyCode: "CAD",
      fxRateAtWrite: 2,
      income: 100,
      revenue: 200,
      settledBondCouponIncome: 10,
    };
    expect(
      restateHistoryFinancials(row, "JPY", 150, ["income", "revenue", "settledBondCouponIncome"])
    ).toMatchObject({ income: 7500, revenue: 15000, settledBondCouponIncome: 750 });
  });
  it("refuses unknown historical conversion rather than using today's source rate", () => {
    expect(
      restateHistoryFinancials({ currencyCode: "CAD", income: 100 }, "USD", 1, ["income"])
    ).toBeNull();
  });
  it("supports explicit anchor-denominated legacy history", () => {
    expect(
      restateHistoryFinancials({ currencyCode: undefined, income: 100 }, "JPY", 150, ["income"])
        ?.income
    ).toBe(15000);
  });
});
