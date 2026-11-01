import { corporatePayoutCash } from "./corporateTaxPriority";
import { corporateGrowthWithPayables } from "./corporateTaxPriority";
import { describe, expect, it } from "vitest";
import { planCorporateTaxPriority, corporateDecisionCash } from "./corporateTaxPriority";
const base = {
  cash: 100,
  pending: 0,
  netIncome: 80,
  localPerAnchor: 1,
  currentTax: { US: 20 },
  priorTax: { UK: 50 },
  priorOperating: 20,
};
describe("corporate tax priority", () => {
  it("pays current tax, then prior taxes and operating arrears, then releases cash", () => {
    expect(planCorporateTaxPriority(base)).toMatchObject({
      cash: 110,
      currentPaid: { US: 20 },
      priorTaxPaid: { UK: 50 },
      priorOperatingPaid: 20,
    });
  });
  it("does not let old debts consume current tax withholding", () => {
    expect(planCorporateTaxPriority({ ...base, cash: 10, netIncome: -15 })).toMatchObject({
      cash: 0,
      currentPaid: { US: 15 },
      currentUnpaid: { US: 5 },
      priorTaxPaid: { UK: 0 },
      priorOperatingPaid: 0,
    });
  });
  it("releases held proceeds only after taxes and limits household payouts to the residual", () => {
    expect(
      planCorporateTaxPriority({
        ...base,
        cash: 0,
        pending: 100,
        netIncome: -20,
        distributionRequested: 60,
      })
    ).toMatchObject({
      cash: 0,
      distributionPaid: 10,
      currentPaid: { US: 20 },
      priorTaxPaid: { UK: 50 },
    });
  });
  it("services operating payables in their original currencies", () => {
    const result = planCorporateTaxPriority({
      ...base,
      priorOperating: 0,
      priorOperatingByCurrency: {
        GBP: { amount: 8, localPerAnchor: 0.8 },
        JPY: { amount: 1500, localPerAnchor: 150 },
      },
    });
    expect(result.cash).toBe(110);
    expect(result.priorOperatingPaidByCurrency).toEqual({ GBP: 8, JPY: 1500 });
  });
  it("does not promise held cash to an early expansion decision", () => {
    expect(corporateDecisionCash({ ...base, cash: 0, pending: 100, netIncome: -20 })).toBe(0);
  });
});

it("holds optional legacy growth while arrears exist but preserves physical plant operations", () => {
  const policy = {
    newCurrentGrowthRate: 5,
    perTurnGrowthRate: 0.1,
    newRevenue: 101,
    preFlipNameplateRevenue: 101,
  };
  const corp = { federalTaxArrearsAnchorByCountry: { UK: 1 } };
  expect(corporateGrowthWithPayables(policy, corp, 100, false)).toMatchObject({
    perTurnGrowthRate: 0,
    newRevenue: 100,
  });
  expect(corporateGrowthWithPayables(policy, corp, 100, true)).toEqual(policy);
});

it("does not pay future coupons or count funded profit twice when sizing optional payouts", () => {
  expect(corporatePayoutCash({ cash: 100, income: 80, alreadySettled: 100 })).toBe(80);
  expect(corporatePayoutCash({ cash: 0, income: -10, alreadySettled: 0 })).toBe(0);
  expect(corporatePayoutCash({ cash: 100, income: 0, alreadySettled: 0, reservedTax: 20 })).toBe(
    80
  );
});
