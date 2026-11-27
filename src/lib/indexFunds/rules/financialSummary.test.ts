import { expect, it } from "vitest";
import { recordedDividendSummary } from "./financialSummary";

it("excludes asset purchases, redemption obligations and subscriptions from income", () => {
  const summary = recordedDividendSummary([
    ...[
      "bond_allocation",
      "public_float_buy",
      "public_float_sell",
      "redemption",
      "redemption_queued",
      "subscription",
    ].map((kind) => ({ kind, amountAnchor: 1_000_000 })),
    { kind: "dividend_reinvest", amountAnchor: 30 },
    { kind: "dividend_pass_through", amountAnchor: 70 },
  ]);
  expect(summary.grossIncome).toBe(100);
  expect(summary.grossExpense).toBe(70);
  expect(summary.netIncome).toBe(30);
  expect([...summary.byKind.keys()]).toEqual(["dividend_reinvest", "dividend_pass_through"]);
});
it("does not turn invalid or negative rows into positive earnings", () => {
  expect(
    recordedDividendSummary(
      [NaN, Infinity, -30].map((amountAnchor) => ({ kind: "dividend_reinvest", amountAnchor }))
    ).netIncome
  ).toBe(0);
});
