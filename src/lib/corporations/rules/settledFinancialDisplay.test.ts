import { expect, it } from "vitest";
import { settledFinancialDisplay } from "./settledFinancialDisplay";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
it("restates large settled mixed-currency components with their recorded source FX", () => {
  const display = settledFinancialDisplay(
    {
      currencyCode: "JPY",
      fxRateAtWrite: 150,
      income: 1e12,
      revenue: 2e12,
      settledBankLoanInterestPaid: 1e8,
      settledBondCouponIncome: 5e7,
      settledBondInterestPaid: 1e7,
      dividendIncomeReceived: 2e7,
    },
    "CAD",
    1.5
  );
  expect(display.revenue).toBeCloseTo(2e10 * TURNS_PER_DAY, 3);
  expect(display.income).toBeCloseTo(9_999_600_000 * TURNS_PER_DAY, 3);
});
it("keeps a genuine zero settled result distinct from unavailable financing evidence", () => {
  expect(
    settledFinancialDisplay(
      { income: 0, revenue: 0, currencyCode: "USD", settledBankLoanInterestPaid: 0 },
      "USD",
      1
    )
  ).toEqual({ income: 0, revenue: 0 });
  expect(
    settledFinancialDisplay({ income: 100, revenue: 200, currencyCode: "USD" }, "USD", 1)
  ).toEqual({ income: null, revenue: 200 * TURNS_PER_DAY });
});
it("does not replace missing historical FX or unsettled bond cash with a current quote or zero", () => {
  expect(
    settledFinancialDisplay(
      { income: 100, revenue: 200, currencyCode: "JPY", settledBankLoanInterestPaid: 0 },
      "CAD",
      1.5
    )
  ).toEqual({ income: null, revenue: null });
  expect(
    settledFinancialDisplay(
      {
        income: 100,
        revenue: 200,
        currencyCode: "USD",
        settledBankLoanInterestPaid: 0,
        perTurnBondCouponIncome: 10,
      },
      "USD",
      1
    )
  ).toEqual({ income: null, revenue: 200 * TURNS_PER_DAY });
});
