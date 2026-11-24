import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { computeIncomeStatement, type IncomeStatementInputs } from "./incomeStatement";
vi.mock("@/lib/pensions/employerPensionCosts", () => ({
  employerPensionCostForTurn: vi.fn().mockResolvedValue({
    contributionAnchorPerTurn: 0,
    topUpAnchorPerTurn: 0,
    schemesInDeficit: 0,
  }),
}));
vi.mock("@/lib/corporations/strengthUpkeep", () => ({
  loadStrengthUpkeepStage: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/corporations/rdDevelopmentFunding", () => ({
  loadRdDevelopmentProjects: vi.fn().mockResolvedValue([]),
}));
function input(profits: number[], lossBank: number): IncomeStatementInputs {
  return {
    db: createMockDb(),
    corporation: {
      _id: new ObjectId(),
      countryId: "US",
      type: "agriculture",
      headquartersState: "CT",
      isPrivate: true,
      liquidCapital: 1000,
      liquidCurrencyCode: "USD",
      sharePrice: 1,
      totalShares: 100,
      marketingBudget: 0,
      taxLossCarryforward: { anchor: lossBank, turn: 99, before: lossBank },
    },
    currentTurn: 100,
    totals: {
      totalRevenue: profits.length * 100,
      totalMaintenanceCosts: profits.length * 100 - profits.reduce((a, b) => a + b, 0),
      totalGrowthCosts: 0,
      totalRegulatoryBurden: 0,
      totalLaborCosts: 0,
    },
    wageBillAnchorPerTurnBySectorId: new Map(),
    restatement: { corpCurrency: "USD", corpRate: 1 },
    fxByCurrency: new Map([["USD", 1]]),
    federalBudgets: [{ countryId: "US", taxRates: { domesticCorporateTax: 20 } }],
    stateBudgetsForTax: [],
    sectorDetails: profits.map((profit) => ({
      _id: new ObjectId(),
      profit,
      financialRevenue: 100,
      revenue: 100,
      countryId: "US",
      stateId: "CT",
    })),
    portfolio: {
      outstandingBonds: [],
      heldBondsSummary: [],
      totalBondHoldingsValue: 0,
      dailyCouponIncome: 0,
      totalStockHoldingsValue: 0,
      imfReceivableRows: [],
      imfReceivablesPrincipal: 0,
      dividendIncomeReceivedDaily: 0,
      imfFacilityPaymentDaily: 0,
      imfFacilityReceiptsDaily: 0,
      totalDebtAnchor: 0,
      dailyInterestAnchor: 0,
    },
    bankingPolicyPromise: Promise.resolve(null),
    gameState: null,
  } as unknown as IncomeStatementInputs;
}
it("applies the turn loss bank to daily profit and every sector tax line consistently", async () => {
  const result = await computeIncomeStatement(input([100], 80));
  expect(result.displayFederalTax).toBe(4);
  expect([...result.perSectorTax.values()][0].federalTaxPaid).toBe(4);
  expect(result.sectorTaxByCountry.US.federal).toBe(4);
});
it("offsets a profitable site with a loss at another site before taxing", async () => {
  const result = await computeIncomeStatement(input([100, -100], 0));
  expect(result.displayFederalTax).toBe(0);
  expect([...result.perSectorTax.values()].every((tax) => tax.federalTaxPaid === 0)).toBe(true);
});
