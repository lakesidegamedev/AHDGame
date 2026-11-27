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

// A missing denomination invalidates the window rather than removing individual points.
describe("recordedHistoryWindow", () => {
  it("restates a mixed-currency window into one explicit display basis", async () => {
    const { recordedHistoryWindow } = await import("./historyCurrency");
    expect(
      recordedHistoryWindow(
        [
          { currencyCode: "JPY", fxRateAtWrite: 100, sharePrice: 1000, income: -200 },
          { currencyCode: "CAD", fxRateAtWrite: 1.5, sharePrice: 18, income: -6 },
        ],
        "CAD",
        1.5,
        ["sharePrice", "income"]
      )
    ).toEqual([
      { currencyCode: "CAD", fxRateAtWrite: 1.5, sharePrice: 15, income: -3 },
      { currencyCode: "CAD", fxRateAtWrite: 1.5, sharePrice: 18, income: -6 },
    ]);
  });
  it("does not turn missing conversion evidence into a gap-free trend", async () => {
    const { recordedHistoryWindow } = await import("./historyCurrency");
    expect(
      recordedHistoryWindow(
        [
          { sharePrice: 100, currencyCode: "JPY" },
          { sharePrice: 2, currencyCode: "CAD" },
        ],
        "CAD",
        1.5,
        ["sharePrice"]
      )
    ).toEqual([]);
    expect(
      recordedHistoryWindow([{ sharePrice: 100, currencyCode: undefined }], "CAD", 1.5, [
        "sharePrice",
      ])
    ).toEqual([]);
  });
});
