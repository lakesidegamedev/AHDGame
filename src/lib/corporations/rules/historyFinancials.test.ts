import { it, expect } from "vitest";
import {
  realizedNetIncomePerTurn,
  historyIncomeBase,
  historyBondSettlementUnavailable,
} from "./historyFinancials";
it("uses witnessed coupon receipts and charges instead of scheduled estimates", () => {
  const row = {
    income: 100,
    revenue: 200,
    perTurnBondCouponIncome: 50,
    perTurnBondDragOnNetIncome: 10,
    settledBondCouponIncome: 30,
    settledBondInterestPaid: 12,
    dividendIncomeReceived: 5,
    bondCouponFxFees: 20,
  };
  expect(realizedNetIncomePerTurn(row)).toBe(123);
  expect(historyIncomeBase(row)).toBe(235);
});
it("does not invent coupon income when the funded receipt says none was paid", () => {
  expect(
    realizedNetIncomePerTurn({
      income: 10,
      perTurnBondCouponIncome: 100,
      settledBondCouponIncome: 0,
    })
  ).toBe(10);
});
it("retains the explicit legacy estimate when settlement evidence is absent", () => {
  expect(
    realizedNetIncomePerTurn({ income: 10, perTurnBondCouponIncome: 100, bondCouponFxFees: 2 })
  ).toBe(108);
});

it("marks unproven coupon or issuer charges as estimates, while respecting an actual zero", () => {
  expect(historyBondSettlementUnavailable({ perTurnBondCouponIncome: 10 })).toBe(true);
  expect(historyBondSettlementUnavailable({ perTurnBondInterestExpense: 10 })).toBe(true);
  expect(
    historyBondSettlementUnavailable({ perTurnBondCouponIncome: 10, settledBondCouponIncome: 0 })
  ).toBe(false);
  expect(
    historyBondSettlementUnavailable({ perTurnBondInterestExpense: 10, settledBondInterestPaid: 0 })
  ).toBe(false);
});
